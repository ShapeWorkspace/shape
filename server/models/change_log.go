package models

import (
	"time"

	"gorm.io/gorm"
)

// ChangeLogOperation represents the type of change that occurred.
type ChangeLogOperation string

const (
	ChangeLogOperationCreate ChangeLogOperation = "create"
	ChangeLogOperationUpdate ChangeLogOperation = "update"
	ChangeLogOperationDelete ChangeLogOperation = "delete"
)

// ChangeLogEntityType represents the type of entity that was changed.
// These correspond to the entity-scoped sync endpoints.
type ChangeLogEntityType string

const (
	ChangeLogEntityTypeDirectMessage     ChangeLogEntityType = "direct_message"
	ChangeLogEntityTypeGroupChat         ChangeLogEntityType = "group_chat"
	ChangeLogEntityTypeGroupMessage      ChangeLogEntityType = "group_message"
	ChangeLogEntityTypeProject           ChangeLogEntityType = "project"
	ChangeLogEntityTypeProjectTask       ChangeLogEntityType = "project_task"
	ChangeLogEntityTypeTaskComment       ChangeLogEntityType = "task_comment"
	ChangeLogEntityTypeNote              ChangeLogEntityType = "note"
	ChangeLogEntityTypePaper             ChangeLogEntityType = "paper"
	ChangeLogEntityTypePaperComment      ChangeLogEntityType = "paper_comment"
	ChangeLogEntityTypePaperCommentReply ChangeLogEntityType = "paper_comment_reply"
	ChangeLogEntityTypeEntityBlock       ChangeLogEntityType = "entity_block"
	ChangeLogEntityTypeFile              ChangeLogEntityType = "file"
	ChangeLogEntityTypeFolder            ChangeLogEntityType = "folder"
	ChangeLogEntityTypeForumChannel      ChangeLogEntityType = "forum_channel"
	ChangeLogEntityTypeForumDiscussion   ChangeLogEntityType = "forum_discussion"
	ChangeLogEntityTypeForumReply        ChangeLogEntityType = "forum_reply"
	ChangeLogEntityTypeWorkspaceMember   ChangeLogEntityType = "workspace_member"
)

// ChangeLogEntry represents a single entry in the workspace change log.
// This is an append-only log that tracks all entity mutations for sync purposes.
//
// Key design decisions:
// - References only: We store entity_id, not the actual payload. The entity
//   is fetched from its source table at sync time with ACL enforcement.
// - Workspace-scoped sequence: Each workspace has its own monotonically increasing
//   sequence number, eliminating timestamp precision issues.
// - Deletes are first-class: Delete operations are recorded so clients can remove
//   entities they had previously synced.
//
// For sync, only the latest entry per entity matters. Older entries for the same
// entity are redundant since we fetch current state from the entity table.
// Compaction can be deferred until log size becomes a concern.
type ChangeLogEntry struct {
	// ID is the auto-generated primary key.
	ID uint64 `json:"id" gorm:"primaryKey;autoIncrement"`

	// WorkspaceID scopes this entry to a specific workspace.
	// Part of the unique constraint on (workspace_id, sequence).
	WorkspaceID string `json:"workspace_id" gorm:"type:uuid;not null;index:idx_change_log_workspace_seq;uniqueIndex:idx_change_log_workspace_sequence,priority:1"`

	// Sequence is a workspace-scoped monotonically increasing number.
	// This is the cursor clients use for incremental sync.
	// Part of the unique constraint on (workspace_id, sequence).
	Sequence int64 `json:"sequence" gorm:"not null;index:idx_change_log_workspace_seq;uniqueIndex:idx_change_log_workspace_sequence,priority:2"`

	// EntityType identifies what kind of entity changed.
	EntityType ChangeLogEntityType `json:"entity_type" gorm:"type:varchar(50);not null;index:idx_change_log_entity_type"`

	// EntityID references the entity that changed.
	EntityID string `json:"entity_id" gorm:"type:uuid;not null"`

	// Operation describes what happened to the entity.
	Operation ChangeLogOperation `json:"operation" gorm:"type:varchar(10);not null"`

	// ActorID is the user who initiated this change.
	ActorID string `json:"actor_id" gorm:"type:uuid;not null"`

	// CreatedAt is when this entry was created.
	CreatedAt time.Time `json:"created_at" gorm:"autoCreateTime"`
}

// TableName specifies the table name for GORM.
func (ChangeLogEntry) TableName() string {
	return "workspace_change_log"
}

// BeforeCreate is a GORM hook that assigns the next sequence number.
// We use a subquery to atomically get the next sequence for this workspace.
// Note: This hook is used when entities are created via GORM directly.
// The repository uses raw SQL for better control over the insert.
func (e *ChangeLogEntry) BeforeCreate(tx *gorm.DB) error {
	// Get the next sequence number for this workspace.
	// COALESCE handles the case when there are no entries yet (returns 0, so first entry gets 1).
	var maxSequence int64
	result := tx.Model(&ChangeLogEntry{}).
		Where("workspace_id = ?", e.WorkspaceID).
		Select("COALESCE(MAX(sequence), 0)").
		Scan(&maxSequence)

	if result.Error != nil {
		return result.Error
	}

	e.Sequence = maxSequence + 1
	return nil
}
