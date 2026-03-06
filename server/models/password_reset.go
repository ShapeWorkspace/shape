package models

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// PasswordResetToken represents a token used for password reset flows.
type PasswordResetToken struct {
	ID        string     `gorm:"primaryKey;type:uuid"`
	UserID    string     `gorm:"type:uuid;not null"`
	TokenHash string     `gorm:"not null"`
	ExpiresAt time.Time  `gorm:"index;not null"`
	UsedAt    *time.Time
	CreatedAt time.Time
	UpdatedAt time.Time
}

// PasswordResetService provides methods for password reset flows.
type PasswordResetService struct {
	db          *gorm.DB
	userService *UserService
}

// NewPasswordResetService creates a new password reset service instance.
func NewPasswordResetService(db *gorm.DB, userService *UserService) *PasswordResetService {
	return &PasswordResetService{db: db, userService: userService}
}

// GenerateTokenForEmail creates a reset token for a user if the email exists.
// It returns tokenID and raw token when a user is found. If the user does not exist, it returns empty strings and no error.
func (s *PasswordResetService) GenerateTokenForEmail(email string, ttl time.Duration) (string, string, *User, error) {
	user, err := s.userService.GetByEmail(email)
	if err != nil {
		// Do not leak whether the email exists
		return "", "", nil, nil
	}

	rawToken, err := generateRandomToken(32)
	if err != nil {
		return "", "", nil, err
	}
	tokenHash := hashToken(rawToken)

	record := &PasswordResetToken{
		ID:        uuid.New().String(),
		UserID:    user.ID,
		TokenHash: tokenHash,
		ExpiresAt: time.Now().Add(ttl),
	}

	if err := s.db.Create(record).Error; err != nil {
		return "", "", nil, err
	}

	return record.ID, rawToken, user, nil
}

// VerifyAndConsume validates a token and marks it as used.
func (s *PasswordResetService) VerifyAndConsume(tokenID, rawToken string) (*User, error) {
	var rec PasswordResetToken
	if err := s.db.Where("id = ?", tokenID).First(&rec).Error; err != nil {
		return nil, err
	}
	if rec.UsedAt != nil {
		return nil, errors.New("token already used")
	}
	if time.Now().After(rec.ExpiresAt) {
		return nil, errors.New("token expired")
	}
	if rec.TokenHash != hashToken(rawToken) {
		return nil, errors.New("invalid token")
	}

	now := time.Now()
	if err := s.db.Model(&rec).Update("used_at", &now).Error; err != nil {
		return nil, err
	}

	return s.userService.GetByID(rec.UserID)
}

// generateRandomToken generates a cryptographically secure random hex string.
func generateRandomToken(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// hashToken computes the SHA-256 hash of the token.
func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
