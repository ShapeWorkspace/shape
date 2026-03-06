package models

import (
	"crypto/rand"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// InviteCode represents a registration invite code for gating user signups.
// Each code can only be used once and is tied to the user who redeemed it.
type InviteCode struct {
	ID           string     `gorm:"type:varchar(36);primaryKey" json:"id"`
	Code         string     `gorm:"type:varchar(10);uniqueIndex;not null" json:"code"` // 5-char uppercase alphanumeric
	UsedByUserID *string    `gorm:"type:varchar(36);index" json:"used_by_user_id,omitempty"`
	UsedAt       *time.Time `json:"used_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
}

// InviteCodeService handles invite code operations.
type InviteCodeService struct {
	db *gorm.DB
}

// NewInviteCodeService creates a new invite code service instance.
func NewInviteCodeService(db *gorm.DB) *InviteCodeService {
	return &InviteCodeService{db: db}
}

// GenerateCode creates a new random 5-character alphanumeric code (uppercase).
// Uses crypto/rand for secure randomness.
func GenerateCode() (string, error) {
	// Alphanumeric charset (uppercase + digits, excluding confusing chars like 0/O, 1/I/L)
	const charset = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
	const codeLength = 5

	bytes := make([]byte, codeLength)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("failed to generate random bytes: %w", err)
	}

	code := make([]byte, codeLength)
	for i := range bytes {
		code[i] = charset[int(bytes[i])%len(charset)]
	}

	return string(code), nil
}

// Create generates and stores a new invite code.
func (s *InviteCodeService) Create() (*InviteCode, error) {
	code, err := GenerateCode()
	if err != nil {
		return nil, err
	}

	inviteCode := &InviteCode{
		ID:        uuid.New().String(),
		Code:      code,
		CreatedAt: time.Now(),
	}

	if err := s.db.Create(inviteCode).Error; err != nil {
		return nil, fmt.Errorf("failed to create invite code: %w", err)
	}

	return inviteCode, nil
}

// GetByCode retrieves an invite code by its code value (case-insensitive).
func (s *InviteCodeService) GetByCode(code string) (*InviteCode, error) {
	normalizedCode := strings.ToUpper(strings.TrimSpace(code))
	if normalizedCode == "" {
		return nil, fmt.Errorf("invite code cannot be empty")
	}

	var inviteCode InviteCode
	if err := s.db.Where("code = ?", normalizedCode).First(&inviteCode).Error; err != nil {
		return nil, err
	}

	return &inviteCode, nil
}

// IsCodeValid checks if a code exists and hasn't been used yet.
func (s *InviteCodeService) IsCodeValid(code string) (bool, error) {
	inviteCode, err := s.GetByCode(code)
	if err != nil {
		return false, nil // Code doesn't exist
	}

	// Code exists but already used
	if inviteCode.UsedByUserID != nil {
		return false, nil
	}

	return true, nil
}

// MarkAsUsed marks an invite code as used by a specific user.
// Returns an error if the code is already used or doesn't exist.
func (s *InviteCodeService) MarkAsUsed(code string, userID string) error {
	normalizedCode := strings.ToUpper(strings.TrimSpace(code))

	now := time.Now()
	result := s.db.Model(&InviteCode{}).
		Where("code = ? AND used_by_user_id IS NULL", normalizedCode).
		Updates(map[string]interface{}{
			"used_by_user_id": userID,
			"used_at":         now,
		})

	if result.Error != nil {
		return fmt.Errorf("failed to mark invite code as used: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return fmt.Errorf("invite code not found or already used")
	}

	return nil
}

// GetAll returns all invite codes (for admin purposes).
func (s *InviteCodeService) GetAll() ([]InviteCode, error) {
	var codes []InviteCode
	if err := s.db.Order("created_at DESC").Find(&codes).Error; err != nil {
		return nil, fmt.Errorf("failed to retrieve invite codes: %w", err)
	}
	return codes, nil
}

// Delete removes an invite code by its code value.
func (s *InviteCodeService) Delete(code string) error {
	normalizedCode := strings.ToUpper(strings.TrimSpace(code))
	result := s.db.Where("code = ?", normalizedCode).Delete(&InviteCode{})
	if result.Error != nil {
		return fmt.Errorf("failed to delete invite code: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("invite code not found")
	}
	return nil
}
