package models

import (
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// WorkspaceKeyShare stores an encrypted copy of a workspace key for a specific recipient.
// The ciphertext is created using crypto_box_easy, encrypting the workspace key with:
// - Sender's box_sk (secret key)
// - Recipient's box_pk (public key)
//
// The recipient can decrypt using:
// - Sender's box_pk (included in this record)
// - Recipient's box_sk (from their identity keys)
//
// A share_signature (Ed25519) allows verification that the sender actually created this share.
type WorkspaceKeyShare struct {
	// ID is the unique identifier for this share.
	ID string `json:"id" gorm:"primaryKey;type:uuid"`

	// WorkspaceID scopes this share to a specific workspace.
	WorkspaceID string `json:"workspace_id" gorm:"type:uuid;not null;index"`

	// WorkspaceKeyID identifies which workspace key generation this share contains.
	WorkspaceKeyID string `json:"workspace_key_id" gorm:"type:uuid;not null;index"`

	// RecipientUserID is the user who can decrypt this share.
	RecipientUserID string `json:"recipient_user_id" gorm:"type:uuid;not null;index"`

	// SenderUserID is the user who created this share.
	SenderUserID string `json:"sender_user_id" gorm:"type:uuid;not null"`

	// SenderBoxPublicKey is the sender's X25519 public key used in crypto_box.
	// Stored as 64 hex characters (32 bytes).
	SenderBoxPublicKey string `json:"sender_box_public_key" gorm:"not null"`

	// SenderSignPublicKey is the sender's Ed25519 public key for signature verification.
	// Stored as 64 hex characters (32 bytes).
	SenderSignPublicKey string `json:"sender_sign_public_key" gorm:"not null"`

	// Nonce is the 24-byte nonce used in crypto_box encryption.
	// Stored as 48 hex characters.
	Nonce string `json:"nonce" gorm:"not null"`

	// Ciphertext is the crypto_box ciphertext containing the encrypted workspace key.
	// Stored as base64.
	Ciphertext string `json:"ciphertext" gorm:"type:text;not null"`

	// ShareSignature is an Ed25519 signature over the share contents.
	// This allows the recipient to verify the share was created by the claimed sender.
	// Stored as base64.
	ShareSignature string `json:"share_signature" gorm:"type:text;not null"`

	CreatedAt time.Time `json:"created_at"`
}

// WorkspaceKeyShareResponse is the JSON response format for a workspace key share.
type WorkspaceKeyShareResponse struct {
	ID                  string    `json:"id"`
	WorkspaceID         string    `json:"workspace_id"`
	WorkspaceKeyID      string    `json:"workspace_key_id"`
	RecipientUserID     string    `json:"recipient_user_id"`
	SenderUserID        string    `json:"sender_user_id"`
	SenderBoxPublicKey  string    `json:"sender_box_public_key"`
	SenderSignPublicKey string    `json:"sender_sign_public_key"`
	Nonce               string    `json:"nonce"`
	Ciphertext          string    `json:"ciphertext"`
	ShareSignature      string    `json:"share_signature"`
	CreatedAt           time.Time `json:"created_at"`
}

// ToResponse converts a WorkspaceKeyShare to its JSON response format.
func (s *WorkspaceKeyShare) ToResponse() *WorkspaceKeyShareResponse {
	return &WorkspaceKeyShareResponse{
		ID:                  s.ID,
		WorkspaceID:         s.WorkspaceID,
		WorkspaceKeyID:      s.WorkspaceKeyID,
		RecipientUserID:     s.RecipientUserID,
		SenderUserID:        s.SenderUserID,
		SenderBoxPublicKey:  s.SenderBoxPublicKey,
		SenderSignPublicKey: s.SenderSignPublicKey,
		Nonce:               s.Nonce,
		Ciphertext:          s.Ciphertext,
		ShareSignature:      s.ShareSignature,
		CreatedAt:           s.CreatedAt,
	}
}

// CreateShareParams holds parameters for creating a new workspace key share.
type CreateShareParams struct {
	// ID is the client-generated UUID for this share.
	ID string
	// WorkspaceID is the workspace this share belongs to.
	WorkspaceID string
	// WorkspaceKeyID is the key generation this share encrypts.
	WorkspaceKeyID string
	// RecipientUserID is the user who can decrypt this share.
	RecipientUserID string
	// SenderUserID is the user creating this share.
	SenderUserID string
	// SenderBoxPublicKey is the sender's X25519 public key (64 hex chars).
	SenderBoxPublicKey string
	// SenderSignPublicKey is the sender's Ed25519 public key (64 hex chars).
	SenderSignPublicKey string
	// Nonce is the crypto_box nonce (48 hex chars / 24 bytes).
	Nonce string
	// Ciphertext is the encrypted workspace key (base64).
	Ciphertext string
	// ShareSignature is the Ed25519 signature (base64).
	ShareSignature string
}

// WorkspaceKeyShareService provides methods for managing workspace key shares.
type WorkspaceKeyShareService struct {
	db *gorm.DB
}

// NewWorkspaceKeyShareService creates a new workspace key share service instance.
func NewWorkspaceKeyShareService(db *gorm.DB) *WorkspaceKeyShareService {
	return &WorkspaceKeyShareService{db: db}
}

// Create creates a new workspace key share. The share contains an encrypted copy
// of a workspace key that only the recipient can decrypt.
func (s *WorkspaceKeyShareService) Create(params CreateShareParams) (*WorkspaceKeyShare, error) {
	// Validate the client-provided ID
	if params.ID == "" {
		return nil, errors.New("share ID is required")
	}
	if _, err := uuid.Parse(params.ID); err != nil {
		return nil, fmt.Errorf("invalid share ID format: must be a valid UUID")
	}

	// Validate required fields
	if params.WorkspaceKeyID == "" {
		return nil, errors.New("workspace_key_id is required")
	}
	if params.RecipientUserID == "" {
		return nil, errors.New("recipient_user_id is required")
	}
	if params.Nonce == "" {
		return nil, errors.New("nonce is required")
	}
	if params.Ciphertext == "" {
		return nil, errors.New("ciphertext is required")
	}
	if params.ShareSignature == "" {
		return nil, errors.New("share_signature is required")
	}

	share := &WorkspaceKeyShare{
		ID:                  params.ID,
		WorkspaceID:         params.WorkspaceID,
		WorkspaceKeyID:      params.WorkspaceKeyID,
		RecipientUserID:     params.RecipientUserID,
		SenderUserID:        params.SenderUserID,
		SenderBoxPublicKey:  params.SenderBoxPublicKey,
		SenderSignPublicKey: params.SenderSignPublicKey,
		Nonce:               params.Nonce,
		Ciphertext:          params.Ciphertext,
		ShareSignature:      params.ShareSignature,
	}

	if err := s.db.Create(share).Error; err != nil {
		return nil, err
	}

	return share, nil
}

// GetSharesForKey returns all shares for a specific workspace key.
func (s *WorkspaceKeyShareService) GetSharesForKey(workspaceKeyID string) ([]*WorkspaceKeyShare, error) {
	var shares []*WorkspaceKeyShare
	if err := s.db.Where("workspace_key_id = ?", workspaceKeyID).Find(&shares).Error; err != nil {
		return nil, err
	}
	return shares, nil
}

// GetSharesForUser returns all shares for a specific user in a workspace.
func (s *WorkspaceKeyShareService) GetSharesForUser(workspaceID string, userID string) ([]*WorkspaceKeyShare, error) {
	var shares []*WorkspaceKeyShare
	if err := s.db.Where("workspace_id = ? AND recipient_user_id = ?", workspaceID, userID).
		Find(&shares).Error; err != nil {
		return nil, err
	}
	return shares, nil
}

// GetShareForUserAndKey returns a specific share for a user and key combination.
func (s *WorkspaceKeyShareService) GetShareForUserAndKey(workspaceKeyID string, userID string) (*WorkspaceKeyShare, error) {
	var share WorkspaceKeyShare
	if err := s.db.Where("workspace_key_id = ? AND recipient_user_id = ?", workspaceKeyID, userID).
		First(&share).Error; err != nil {
		return nil, err
	}
	return &share, nil
}

// DeleteSharesForKey removes all shares for a specific workspace key.
// Used during key rotation cleanup.
func (s *WorkspaceKeyShareService) DeleteSharesForKey(workspaceKeyID string) error {
	return s.db.Where("workspace_key_id = ?", workspaceKeyID).Delete(&WorkspaceKeyShare{}).Error
}

// DeleteSharesForUserInWorkspace removes all shares for a user in a workspace.
// Used when revoking access to a workspace.
func (s *WorkspaceKeyShareService) DeleteSharesForUserInWorkspace(workspaceID string, userID string) error {
	return s.db.Where("workspace_id = ? AND recipient_user_id = ?", workspaceID, userID).
		Delete(&WorkspaceKeyShare{}).Error
}
