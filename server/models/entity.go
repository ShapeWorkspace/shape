package models

import (
	"encoding/json"
	"errors"
	"time"

	"gorm.io/datatypes"
)

// ---------------------------------------------------------------------------
// Entity Model (Unified v2 Entity Table)
// ---------------------------------------------------------------------------

// Entity is the unified storage model for all encrypted entities.
// It mirrors the ServerEntity shape used by the engine and stores the
// full encryption envelope + minimal routing metadata in a single table.
//
// Access control is derived from acl_from_* when present; otherwise it is
// determined by entity-specific rules (e.g., direct messages and memos).
type Entity struct {
	// ID is the client-generated UUID for this entity.
	ID string `json:"id" gorm:"primaryKey;type:uuid"`

	// WorkspaceID scopes the entity to a workspace.
	WorkspaceID string `json:"workspace_id" gorm:"type:uuid;not null;index:idx_entities_workspace;uniqueIndex:idx_entities_user_profile_unique,priority:1,where:entity_type = 'user-profile'"`

	// EntityType is the canonical entity type (kebab-case).
	EntityType string `json:"entity_type" gorm:"type:varchar(50);not null;index:idx_entities_type"`

	// ACLFromID/ACLFromType identify the ACL root used for access checks.
	// These are controlled by the server and should not be set by clients.
	ACLFromID   *string `json:"acl_from_id,omitempty" gorm:"type:uuid;index:idx_entities_acl_from"`
	ACLFromType *string `json:"acl_from_type,omitempty" gorm:"type:varchar(50);index:idx_entities_acl_from"`

	// ParentID/ParentType represent the logical parent entity relationship.
	// These are controlled by the server and should not be set by clients.
	ParentID   *string `json:"parent_id,omitempty" gorm:"type:uuid;index:idx_entities_parent"`
	ParentType *string `json:"parent_type,omitempty" gorm:"type:varchar(50);index:idx_entities_parent"`

	// CreatorID is the user who created the entity.
	CreatorID string `json:"creator_id" gorm:"type:uuid;not null;index:idx_entities_creator;uniqueIndex:idx_entities_user_profile_unique,priority:2,where:entity_type = 'user-profile'"`

	// LastUpdatedByID is the last user to update the entity.
	LastUpdatedByID string `json:"last_updated_by_id" gorm:"type:uuid;not null;index:idx_entities_last_updated_by"`

	// ChainRootKeyID is the workspace key at the root of the encryption chain.
	ChainRootKeyID string `json:"chain_root_key_id" gorm:"type:uuid;not null"`

	// WrappingKeyID identifies the key that directly wraps the entity key.
	WrappingKeyID string `json:"wrapping_key_id" gorm:"type:uuid;not null"`

	// WrappingKeyType indicates how the entity key is wrapped.
	WrappingKeyType string `json:"wrapping_key_type" gorm:"type:varchar(50);not null"`

	// ---- Entity Encryption Columns (per Book of Entities) ----

	// EntityKeyNonce is the nonce used to encrypt the entity key.
	EntityKeyNonce string `json:"entity_key_nonce" gorm:"type:char(48);not null"`

	// WrappedEntityKey is the encrypted entity key (base64).
	WrappedEntityKey string `json:"wrapped_entity_key" gorm:"type:text;not null"`

	// ContentNonce is the nonce used to encrypt content with the entity key.
	ContentNonce string `json:"content_nonce" gorm:"type:char(48);not null"`

	// ContentCiphertext is the encrypted JSON content payload (base64).
	ContentCiphertext string `json:"content_ciphertext" gorm:"type:text;not null"`

	// ContentHash is a client-provided hash of content_ciphertext for conflicts.
	ContentHash string `json:"content_hash" gorm:"type:text;not null"`

	// MetaFields contains server-indexed metadata (JSON).
	MetaFields datatypes.JSONMap `json:"meta_fields" gorm:"type:jsonb"`

	// MentionedUserIDsJSON stores mentioned user IDs as a JSON array string.
	// Stored as text because mentions are not query-indexed at the DB level.
	MentionedUserIDsJSON string `json:"-" gorm:"column:mentioned_user_ids;type:text"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// TableName sets the database table name for Entity.
func (Entity) TableName() string {
	return "entities"
}

// ---------------------------------------------------------------------------
// Response Types
// ---------------------------------------------------------------------------

// EntityResponse is the JSON response format for entities.
// It mirrors the engine's ServerEntity type (snake_case).
type EntityResponse struct {
	ID                string                 `json:"id"`
	WorkspaceID       string                 `json:"workspace_id"`
	EntityType        string                 `json:"entity_type"`
	ACLFromID         *string                `json:"acl_from_id,omitempty"`
	ACLFromType       *string                `json:"acl_from_type,omitempty"`
	ParentID          *string                `json:"parent_id,omitempty"`
	ParentType        *string                `json:"parent_type,omitempty"`
	CreatorID         string                 `json:"creator_id"`
	LastUpdatedByID   string                 `json:"last_updated_by_id"`
	ChainRootKeyID    string                 `json:"chain_root_key_id"`
	WrappingKeyID     string                 `json:"wrapping_key_id"`
	WrappingKeyType   string                 `json:"wrapping_key_type"`
	EntityKeyNonce    string                 `json:"entity_key_nonce"`
	WrappedEntityKey  string                 `json:"wrapped_entity_key"`
	ContentNonce      string                 `json:"content_nonce"`
	ContentCiphertext string                 `json:"content_ciphertext"`
	ContentHash       string                 `json:"content_hash"`
	MetaFields        map[string]interface{} `json:"meta_fields"`
	MentionedUserIDs  []string               `json:"mentioned_user_ids"`
	CreatedAt         time.Time              `json:"created_at"`
	UpdatedAt         time.Time              `json:"updated_at"`
}

// ToResponse converts an Entity model to the API response shape.
func (e *Entity) ToResponse() (*EntityResponse, error) {
	mentions, err := e.GetMentionedUserIDs()
	if err != nil {
		return nil, err
	}

	meta := map[string]interface{}(e.MetaFields)
	if meta == nil {
		meta = map[string]interface{}{}
	}

	return &EntityResponse{
		ID:                e.ID,
		WorkspaceID:       e.WorkspaceID,
		EntityType:        e.EntityType,
		ACLFromID:         e.ACLFromID,
		ACLFromType:       e.ACLFromType,
		ParentID:          e.ParentID,
		ParentType:        e.ParentType,
		CreatorID:         e.CreatorID,
		LastUpdatedByID:   e.LastUpdatedByID,
		ChainRootKeyID:    e.ChainRootKeyID,
		WrappingKeyID:     e.WrappingKeyID,
		WrappingKeyType:   e.WrappingKeyType,
		EntityKeyNonce:    e.EntityKeyNonce,
		WrappedEntityKey:  e.WrappedEntityKey,
		ContentNonce:      e.ContentNonce,
		ContentCiphertext: e.ContentCiphertext,
		ContentHash:       e.ContentHash,
		MetaFields:        meta,
		MentionedUserIDs:  mentions,
		CreatedAt:         e.CreatedAt,
		UpdatedAt:         e.UpdatedAt,
	}, nil
}

// ---------------------------------------------------------------------------
// Mentioned User Helpers
// ---------------------------------------------------------------------------

// GetMentionedUserIDs returns the parsed mentioned user IDs.
func (e *Entity) GetMentionedUserIDs() ([]string, error) {
	if e.MentionedUserIDsJSON == "" {
		return []string{}, nil
	}

	var ids []string
	if err := json.Unmarshal([]byte(e.MentionedUserIDsJSON), &ids); err != nil {
		return nil, err
	}
	return ids, nil
}

// SetMentionedUserIDs stores mentioned user IDs as a JSON array string.
func (e *Entity) SetMentionedUserIDs(ids []string) error {
	if ids == nil {
		ids = []string{}
	}
	encoded, err := json.Marshal(ids)
	if err != nil {
		return err
	}
	e.MentionedUserIDsJSON = string(encoded)
	return nil
}

// ---------------------------------------------------------------------------
// Parameter Types
// ---------------------------------------------------------------------------

// CreateEntityParams holds validated parameters for creating a new entity.
type CreateEntityParams struct {
	ID                string
	WorkspaceID       string
	EntityType        string
	ParentID          *string
	ParentType        *string
	ChainRootKeyID    string
	WrappingKeyID     string
	WrappingKeyType   string
	EntityKeyNonce    string
	WrappedEntityKey  string
	ContentNonce      string
	ContentCiphertext string
	ContentHash       string
	MetaFields        map[string]interface{}
	MentionedUserIDs  []string
	CreatorID         string
	LastUpdatedByID   string
}

// UpdateEntityParams holds parameters for updating an encrypted entity.
type UpdateEntityParams struct {
	ChainRootKeyID     string
	WrappingKeyID      string
	WrappingKeyType    string
	EntityKeyNonce     string
	WrappedEntityKey   string
	ContentNonce       string
	ContentCiphertext  string
	ContentHash        string
	ExpectedHash       string
	MetaFields         map[string]interface{}
	MetaFieldsProvided bool
	MentionedUserIDs   *[]string
	ParentID           *string
	ParentType         *string
	// ParentFieldsProvided signals that the request explicitly wants to change parent data.
	ParentFieldsProvided bool
	LastUpdatedByID      string
}

// ErrEntityConflict indicates an optimistic locking conflict during update.
var ErrEntityConflict = errors.New("entity content conflict: expected hash does not match")

// ErrUserProfileAlreadyExists indicates the workspace already has a profile entity for this creator.
var ErrUserProfileAlreadyExists = errors.New("user profile already exists for this user")
