package models

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// AppRefreshToken represents a long-lived refresh credential for Tauri app auth.
// The raw token is never stored; we only persist a SHA-256 hash for safety.
type AppRefreshToken struct {
	ID        string     `gorm:"primaryKey;type:uuid"`
	UserID    string     `gorm:"type:uuid;index;not null"`
	TokenHash string     `gorm:"uniqueIndex;not null"`
	ExpiresAt time.Time  `gorm:"index;not null"`
	RevokedAt *time.Time `gorm:"index"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

// AppRefreshTokenService manages refresh token lifecycle for Tauri app auth.
type AppRefreshTokenService struct {
	db                   *gorm.DB
	refreshTokenDuration time.Duration
}

const defaultAppRefreshTokenDuration = 90 * 24 * time.Hour
const refreshTokenBytes = 32

// NewAppRefreshTokenService wires a refresh token service with defaults.
func NewAppRefreshTokenService(db *gorm.DB) *AppRefreshTokenService {
	return &AppRefreshTokenService{
		db:                   db,
		refreshTokenDuration: defaultAppRefreshTokenDuration,
	}
}

// Issue creates a new refresh token for the provided user ID.
// Returns the raw token string for client storage and a persisted record.
func (s *AppRefreshTokenService) Issue(userID string) (string, error) {
	rawToken, hashedToken, err := generateRefreshToken()
	if err != nil {
		return "", err
	}

	refreshToken := &AppRefreshToken{
		ID:        uuid.NewString(),
		UserID:    userID,
		TokenHash: hashedToken,
		ExpiresAt: time.Now().Add(s.refreshTokenDuration),
	}

	if err := s.db.Create(refreshToken).Error; err != nil {
		return "", err
	}

	return rawToken, nil
}

// Rotate validates an existing refresh token, revokes it, and issues a new one.
// Returns the new raw token and the associated user ID.
func (s *AppRefreshTokenService) Rotate(existingToken string) (string, string, error) {
	hashedToken := hashRefreshToken(existingToken)

	var record AppRefreshToken
	if err := s.db.Where("token_hash = ?", hashedToken).First(&record).Error; err != nil {
		return "", "", fmt.Errorf("refresh token not found")
	}

	if record.RevokedAt != nil {
		return "", "", fmt.Errorf("refresh token revoked")
	}

	if time.Now().After(record.ExpiresAt) {
		return "", "", fmt.Errorf("refresh token expired")
	}

	rawToken, newHashedToken, err := generateRefreshToken()
	if err != nil {
		return "", "", err
	}

	now := time.Now()
	newRecord := &AppRefreshToken{
		ID:        uuid.NewString(),
		UserID:    record.UserID,
		TokenHash: newHashedToken,
		ExpiresAt: now.Add(s.refreshTokenDuration),
	}

	err = s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&AppRefreshToken{}).
			Where("id = ?", record.ID).
			Update("revoked_at", now).Error; err != nil {
			return err
		}

		if err := tx.Create(newRecord).Error; err != nil {
			return err
		}

		return nil
	})
	if err != nil {
		return "", "", err
	}

	return rawToken, record.UserID, nil
}

// generateRefreshToken produces a cryptographically random token and its SHA-256 hash.
func generateRefreshToken() (string, string, error) {
	randomBytes := make([]byte, refreshTokenBytes)
	if _, err := rand.Read(randomBytes); err != nil {
		return "", "", fmt.Errorf("failed to generate refresh token: %w", err)
	}

	rawToken := hex.EncodeToString(randomBytes)
	return rawToken, hashRefreshToken(rawToken), nil
}

// hashRefreshToken returns a SHA-256 hex digest for secure storage.
func hashRefreshToken(rawToken string) string {
	sum := sha256.Sum256([]byte(rawToken))
	return hex.EncodeToString(sum[:])
}
