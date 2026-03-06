package models

import (
	"time"
)

// EffectiveResourceAccess is a write-time cache that stores pre-computed access rights.
// This table is updated whenever ACL entries, team memberships, or entity hierarchies change.
// It enables O(1) queries for "list all resources a user can access".
type EffectiveResourceAccess struct {
	WorkspaceID  string `json:"workspace_id" gorm:"type:uuid;not null;index:idx_era_workspace_user,priority:1"`
	UserID       string `json:"user_id" gorm:"type:uuid;not null;primaryKey;index:idx_era_workspace_user,priority:2;index:idx_era_user_type,priority:1"`
	ResourceType string `json:"resource_type" gorm:"type:text;not null;primaryKey;index:idx_era_user_type,priority:2;index:idx_era_resource,priority:1"`
	ResourceID   string `json:"resource_id" gorm:"type:uuid;not null;primaryKey;index:idx_era_resource,priority:2"`
	Permission   string `json:"permission" gorm:"type:text;not null"` // Highest permission: 'admin', 'write', 'read'
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// TableName returns the table name for EffectiveResourceAccess.
func (EffectiveResourceAccess) TableName() string {
	return "effective_resource_access"
}
