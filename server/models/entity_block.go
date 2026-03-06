package models

import (
	"time"
)

// EntityBlockType represents the type of entity that owns the block.
// This enables generic block storage for different entity types while
// maintaining type safety at the application level.
type EntityBlockType string

const (
	// EntityBlockTypePaper indicates the block belongs to a paper.
	EntityBlockTypePaper EntityBlockType = "paper"
	// EntityBlockTypeNote indicates the block belongs to a note.
	EntityBlockTypeNote EntityBlockType = "note"
	// EntityBlockTypeTask indicates the block belongs to a task.
	EntityBlockTypeTask EntityBlockType = "task"
)

// EntityBlock stores encrypted Yjs deltas for collaborative entity content.
// Blocks are created when users make edits (debounced 750ms, aggregated into RealtimeBlock).
// The encrypted_data contains a serialized RealtimeBlock protobuf with encrypted deltas.
//
// Each delta within the block is encrypted with the entity's key.
// Other clients receive blocks via SSE and decrypt them to apply updates.
//
// Access control: Block access inherits from the parent entity's access.
// Users can only access blocks if they have access to the parent entity.
type EntityBlock struct {
	// ID is the unique identifier for this block.
	ID string `json:"id" gorm:"primaryKey;type:uuid"`

	// EntityID is the parent entity this block belongs to (paper, note, task, etc.).
	EntityID string `json:"entity_id" gorm:"type:uuid;not null;index:idx_entity_blocks_entity"`

	// EntityType identifies what kind of entity owns this block ("paper", "note", "task").
	EntityType EntityBlockType `json:"entity_type" gorm:"type:varchar(20);not null;index:idx_entity_blocks_entity"`

	// EntityField identifies which field of the entity this block is for.
	// For papers this is always "text". For tasks it could be "description".
	// Defaults to "text" for simple entities with a single rich text field.
	EntityField string `json:"entity_field" gorm:"type:varchar(50);not null;default:'text'"`

	// AuthorID is the user who created this block.
	AuthorID string `json:"author_id" gorm:"type:uuid;not null;index"`

	// EncryptedData contains the serialized RealtimeBlock protobuf.
	// The RealtimeBlock contains repeated EncryptedDelta messages,
	// each with ciphertext and nonce for the encrypted Yjs update.
	EncryptedData []byte `json:"encrypted_data" gorm:"type:bytea;not null"`

	// DataVersion identifies the encoding format of EncryptedData.
	// Currently "yjs-v1" for Yjs-based collaborative editing.
	DataVersion string `json:"data_version" gorm:"type:varchar(20);not null;default:'yjs-v1'"`

	CreatedAt time.Time `json:"created_at"`
}

// TableName returns the database table name for entity blocks.
func (EntityBlock) TableName() string {
	return "entity_blocks"
}

// EntityBlockResponse is the JSON response format for an entity block.
// Used when returning blocks to clients via REST API or sync responses.
type EntityBlockResponse struct {
	ID            string          `json:"id"`
	EntityID      string          `json:"entity_id"`
	EntityType    EntityBlockType `json:"entity_type"`
	EntityField   string          `json:"entity_field"`
	AuthorID      string          `json:"author_id"`
	EncryptedData string          `json:"encrypted_data"` // base64 encoded
	DataVersion   string          `json:"data_version"`
	CreatedAt     time.Time       `json:"created_at"`
}

// ToResponse converts an EntityBlock to its JSON response format.
// Note: EncryptedData must be converted to base64 by the caller before passing.
func (b *EntityBlock) ToResponse(base64Data string) *EntityBlockResponse {
	return &EntityBlockResponse{
		ID:            b.ID,
		EntityID:      b.EntityID,
		EntityType:    b.EntityType,
		EntityField:   b.EntityField,
		AuthorID:      b.AuthorID,
		EncryptedData: base64Data,
		DataVersion:   b.DataVersion,
		CreatedAt:     b.CreatedAt,
	}
}

// EntityBlockCompactionThreshold is the number of blocks after which compaction should be triggered.
// When an entity exceeds this many blocks, the client should merge them into a single
// compacted block to reduce storage and improve load times.
const EntityBlockCompactionThreshold = 1000
