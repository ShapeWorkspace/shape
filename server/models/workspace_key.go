package models

import (
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// WorkspaceKey is a manifest entry representing a single generation of a workspace's
// symmetric encryption key. The actual cryptographic material is stored in WorkspaceKeyShare
// records, one per recipient user. Each share contains the key encrypted to that user's
// public key.
//
// Key hierarchy (per Book of Encryption):
// - User identity keys (box/sign keypairs) are used to encrypt shares
// - Workspace keys are symmetric 32-byte keys used to wrap entity keys
// - Entity keys are per-entity symmetric keys used to encrypt content
type WorkspaceKey struct {
	// ID is the unique identifier for this workspace key generation (workspace_key_id).
	ID string `json:"id" gorm:"primaryKey;type:uuid"`

	// WorkspaceID scopes this key to a specific workspace.
	WorkspaceID string `json:"workspace_id" gorm:"type:uuid;not null;index"`

	// Generation is a monotonically increasing counter (1, 2, 3...) for key rotation.
	// New entities should use the highest generation key. Old entities retain their
	// original generation reference for decryption.
	Generation int `json:"generation" gorm:"not null"`

	// CreatedByUserID is the user who created this key generation.
	CreatedByUserID string `json:"created_by_user_id" gorm:"type:uuid;not null"`

	CreatedAt time.Time `json:"created_at"`
}

// WorkspaceKeyResponse is the JSON response format for a workspace key without shares.
type WorkspaceKeyResponse struct {
	ID              string    `json:"id"`
	WorkspaceID     string    `json:"workspace_id"`
	Generation      int       `json:"generation"`
	CreatedByUserID string    `json:"created_by_user_id"`
	CreatedAt       time.Time `json:"created_at"`
}

// WorkspaceKeyWithSharesResponse includes the key metadata along with the requesting
// user's share (the encrypted workspace key). This is what the client uses to decrypt.
type WorkspaceKeyWithSharesResponse struct {
	ID              string                       `json:"id"`
	WorkspaceID     string    					`json:"workspace_id"`
	Generation      int                          `json:"generation"`
	CreatedByUserID string                       `json:"created_by_user_id"`
	CreatedAt       time.Time                    `json:"created_at"`
	Shares          []WorkspaceKeyShareResponse  `json:"shares"`
}

// ToResponse converts a WorkspaceKey to its JSON response format.
func (wk *WorkspaceKey) ToResponse() *WorkspaceKeyResponse {
	return &WorkspaceKeyResponse{
		ID:              wk.ID,
		WorkspaceID:     wk.WorkspaceID,
		Generation:      wk.Generation,
		CreatedByUserID: wk.CreatedByUserID,
		CreatedAt:       wk.CreatedAt,
	}
}

// WorkspaceKeyService provides methods for managing workspace keys.
type WorkspaceKeyService struct {
	db *gorm.DB
}

// NewWorkspaceKeyService creates a new workspace key service instance.
func NewWorkspaceKeyService(db *gorm.DB) *WorkspaceKeyService {
	return &WorkspaceKeyService{db: db}
}

// CreateKeyParams holds parameters for creating a new workspace key generation.
type CreateKeyParams struct {
	// ID is the client-generated UUID for this key (required for cryptographic binding).
	ID string
	// WorkspaceID is the workspace this key belongs to.
	WorkspaceID string
	// CreatedByUserID is the user creating this key.
	CreatedByUserID string
}

// Create creates a new workspace key generation. The generation number is automatically
// assigned as the next increment for the workspace. Also updates the workspace's
// current_workspace_key_id to point to this new key. Returns the created key along with
// its generation number.
func (s *WorkspaceKeyService) Create(params CreateKeyParams) (*WorkspaceKey, error) {
	// Validate the client-provided ID
	if params.ID == "" {
		return nil, errors.New("workspace key ID is required")
	}
	if _, err := uuid.Parse(params.ID); err != nil {
		return nil, fmt.Errorf("invalid workspace key ID format: must be a valid UUID")
	}

	// Determine the next generation number within a transaction
	tx := s.db.Begin()
	if err := tx.Error; err != nil {
		return nil, err
	}

	// Get the current highest generation for this workspace
	var maxGeneration int
	if err := tx.Model(&WorkspaceKey{}).
		Where("workspace_id = ?", params.WorkspaceID).
		Select("COALESCE(MAX(generation), 0)").
		Scan(&maxGeneration).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	key := &WorkspaceKey{
		ID:              params.ID,
		WorkspaceID:     params.WorkspaceID,
		Generation:      maxGeneration + 1,
		CreatedByUserID: params.CreatedByUserID,
	}

	if err := tx.Create(key).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	// Update the workspace's current_workspace_key_id to point to this new key.
	// This ensures that clients always know which key to use for new encryptions.
	if err := tx.Model(&Workspace{}).
		Where("id = ?", params.WorkspaceID).
		Update("current_workspace_key_id", key.ID).Error; err != nil {
		tx.Rollback()
		return nil, err
	}

	if err := tx.Commit().Error; err != nil {
		return nil, err
	}

	return key, nil
}

// GetByID retrieves a workspace key by its ID.
func (s *WorkspaceKeyService) GetByID(id string) (*WorkspaceKey, error) {
	var key WorkspaceKey
	if err := s.db.Where("id = ?", id).First(&key).Error; err != nil {
		return nil, err
	}
	return &key, nil
}

// GetKeysForWorkspace returns all workspace keys for a workspace, ordered by generation.
func (s *WorkspaceKeyService) GetKeysForWorkspace(workspaceID string) ([]*WorkspaceKey, error) {
	var keys []*WorkspaceKey
	if err := s.db.Where("workspace_id = ?", workspaceID).
		Order("generation ASC").
		Find(&keys).Error; err != nil {
		return nil, err
	}
	return keys, nil
}

// GetCurrentKey returns the highest-generation (current) key for a workspace.
func (s *WorkspaceKeyService) GetCurrentKey(workspaceID string) (*WorkspaceKey, error) {
	var key WorkspaceKey
	if err := s.db.Where("workspace_id = ?", workspaceID).
		Order("generation DESC").
		First(&key).Error; err != nil {
		return nil, err
	}
	return &key, nil
}

// GetKeysWithSharesForUser returns all workspace keys for a workspace with shares
// filtered to only include the specified user's shares. This is what clients call
// to get the encrypted keys they can decrypt.
func (s *WorkspaceKeyService) GetKeysWithSharesForUser(workspaceID string, userID string) ([]*WorkspaceKeyWithSharesResponse, error) {
	// Get all keys for the workspace
	var keys []*WorkspaceKey
	if err := s.db.Where("workspace_id = ?", workspaceID).
		Order("generation ASC").
		Find(&keys).Error; err != nil {
		return nil, err
	}

	// Get all shares for this user in this workspace
	var shares []*WorkspaceKeyShare
	if err := s.db.Where("workspace_id = ? AND recipient_user_id = ?", workspaceID, userID).
		Find(&shares).Error; err != nil {
		return nil, err
	}

	// Create a map of workspace_key_id -> shares for efficient lookup
	sharesByKeyID := make(map[string][]*WorkspaceKeyShare)
	for _, share := range shares {
		sharesByKeyID[share.WorkspaceKeyID] = append(sharesByKeyID[share.WorkspaceKeyID], share)
	}

	// Build the response combining keys with their shares
	result := make([]*WorkspaceKeyWithSharesResponse, len(keys))
	for i, key := range keys {
		keyShares := sharesByKeyID[key.ID]
		shareResponses := make([]WorkspaceKeyShareResponse, len(keyShares))
		for j, share := range keyShares {
			shareResponses[j] = *share.ToResponse()
		}

		result[i] = &WorkspaceKeyWithSharesResponse{
			ID:              key.ID,
			WorkspaceID:     key.WorkspaceID,
			Generation:      key.Generation,
			CreatedByUserID: key.CreatedByUserID,
			CreatedAt:       key.CreatedAt,
			Shares:          shareResponses,
		}
	}

	return result, nil
}
