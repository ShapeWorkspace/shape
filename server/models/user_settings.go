package models

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// UserSetting persists a single key/value pair for a user.
type UserSetting struct {
	ID        string          `json:"id" gorm:"primaryKey;type:uuid"`
	UserID    string          `json:"user_id" gorm:"type:uuid;not null;uniqueIndex:user_settings_user_key,priority:1"`
	Key       string          `json:"key" gorm:"type:text;not null;uniqueIndex:user_settings_user_key,priority:2"`
	Value     json.RawMessage `json:"value" gorm:"type:jsonb;not null"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
}

// EmailMode captures the supported delivery modes for notification emails.
type EmailMode string

const (
	// EmailModeRealtime delivers notifications immediately.
	EmailModeRealtime EmailMode = "realtime"
	// EmailModeBatched groups notifications and delivers them on a cadence.
	EmailModeBatched EmailMode = "batched"
	// EmailModeOff silences all notification emails.
	EmailModeOff EmailMode = "off"
)

// Setting keys used throughout the server and client.
const (
	UserSettingEmailModeKey          = "email_mode"
	UserSettingEmailBatchIntervalKey = "email_batch_interval"
)

// allowedEmailDelayBuckets defines the server-approved delay options (seconds).
var allowedEmailDelayBuckets = []int{60, 300, 1800, 3600, 10800, 14400, 21600, 28800, 43200, 86400}

// defaultEmailDelaySeconds is used when no prior preference exists.
const defaultEmailDelaySeconds = 300

// EmailNotificationSettings groups the email-related preferences in a typed form.
type EmailNotificationSettings struct {
	Mode         EmailMode
	DelaySeconds int
}

// Validate ensures the EmailNotificationSettings are internally consistent.
func (e EmailNotificationSettings) Validate() error {
	switch e.Mode {
	case EmailModeRealtime:
		return nil
	case EmailModeOff:
		if !isAllowedDelay(e.DelaySeconds) {
			return fmt.Errorf("delay %d is not permitted", e.DelaySeconds)
		}
		return nil
	case EmailModeBatched:
		if !isAllowedDelay(e.DelaySeconds) {
			return fmt.Errorf("delay %d is not permitted", e.DelaySeconds)
		}
		return nil
	default:
		return fmt.Errorf("unsupported email mode %q", e.Mode)
	}
}

// UserSettingsService exposes persistence helpers on top of GORM.
type UserSettingsService struct {
	db *gorm.DB
}

// NewUserSettingsService builds a service that can manage user settings records.
func NewUserSettingsService(db *gorm.DB) *UserSettingsService {
	return &UserSettingsService{db: db}
}

// GetEmailSettings fetches the current email preferences, applying server defaults when unset.
func (s *UserSettingsService) GetEmailSettings(userID string) (EmailNotificationSettings, error) {
	settings := EmailNotificationSettings{
		Mode:         EmailModeRealtime,
		DelaySeconds: defaultEmailDelaySeconds,
	}

	records, err := s.getSettingsMap(userID)
	if err != nil {
		return settings, err
	}

	if rawMode, ok := records[UserSettingEmailModeKey]; ok {
		var mode string
		if err := json.Unmarshal(rawMode, &mode); err != nil {
			return settings, fmt.Errorf("failed to decode email mode: %w", err)
		}
		switch EmailMode(mode) {
		case EmailModeRealtime:
			settings.Mode = EmailModeRealtime
		case EmailModeBatched:
			settings.Mode = EmailModeBatched
		case EmailModeOff:
			settings.Mode = EmailModeOff
		default:
			return settings, fmt.Errorf("unexpected email mode %q", mode)
		}
	}

	if rawDelay, ok := records[UserSettingEmailBatchIntervalKey]; ok {
		var delay int
		if err := json.Unmarshal(rawDelay, &delay); err != nil {
			return settings, fmt.Errorf("failed to decode email delay: %w", err)
		}
		if isAllowedDelay(delay) {
			settings.DelaySeconds = delay
		} else {
			return settings, fmt.Errorf("email delay %d is not in the allowed buckets", delay)
		}
	}

	return settings, nil
}

// UpdateEmailSettings persists the supplied email preferences.
func (s *UserSettingsService) UpdateEmailSettings(userID string, prefs EmailNotificationSettings) error {
	if err := prefs.Validate(); err != nil {
		return err
	}

	delay := prefs.DelaySeconds
	if delay == 0 {
		delay = defaultEmailDelaySeconds
	}

	modeJSON, err := json.Marshal(prefs.Mode)
	if err != nil {
		return fmt.Errorf("failed to marshal email mode: %w", err)
	}
	delayJSON, err := json.Marshal(delay)
	if err != nil {
		return fmt.Errorf("failed to marshal email delay: %w", err)
	}

	updates := map[string]json.RawMessage{
		UserSettingEmailModeKey:          json.RawMessage(modeJSON),
		UserSettingEmailBatchIntervalKey: json.RawMessage(delayJSON),
	}

	return s.upsertSettings(userID, updates)
}

// getSettingsMap loads all settings for the user into a key-addressable structure.
func (s *UserSettingsService) getSettingsMap(userID string) (map[string]json.RawMessage, error) {
	if userID == "" {
		return nil, errors.New("userID cannot be empty")
	}

	var rows []UserSetting
	if err := s.db.Where("user_id = ?", userID).Find(&rows).Error; err != nil {
		return nil, err
	}

	settings := make(map[string]json.RawMessage, len(rows))
	for _, row := range rows {
		settings[row.Key] = row.Value
	}

	return settings, nil
}

// upsertSettings writes each key/value pair for the user, creating rows as needed.
func (s *UserSettingsService) upsertSettings(userID string, updates map[string]json.RawMessage) error {
	if userID == "" {
		return errors.New("userID cannot be empty")
	}
	if len(updates) == 0 {
		return nil
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		for key, value := range updates {
			if err := s.upsertSetting(tx, userID, key, value); err != nil {
				return err
			}
		}
		return nil
	})
}

// upsertSetting handles a single record within the transaction scope.
func (s *UserSettingsService) upsertSetting(tx *gorm.DB, userID string, key string, value json.RawMessage) error {
	if len(value) == 0 {
		return fmt.Errorf("refusing to persist empty value for key %s", key)
	}

	var existing UserSetting
	err := tx.Where("user_id = ? AND key = ?", userID, key).First(&existing).Error
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		entry := UserSetting{
			ID:     uuid.NewString(),
			UserID: userID,
			Key:    key,
			Value:  value,
		}
		return tx.Create(&entry).Error
	case err != nil:
		return err
	default:
		return tx.Model(&existing).Update("value", value).Error
	}
}

// isAllowedDelay checks whether the provided delay aligns with server policy.
func isAllowedDelay(candidate int) bool {
	for _, allowed := range allowedEmailDelayBuckets {
		if candidate == allowed {
			return true
		}
	}
	return false
}
