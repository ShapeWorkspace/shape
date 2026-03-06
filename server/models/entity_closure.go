package models

import (
	"time"
)

// EntityClosure stores ancestor-descendant relationships for ACL inheritance.
// This is a closure table that enables efficient queries for:
// 1. Finding all ancestors of an entity (for permission checks)
// 2. Finding all descendants of an entity (for cache invalidation)
//
// Examples of inheritance relationships:
// - Files/Papers/Tables inherit from Folders
// - Tasks inherit from Projects
// - Forum messages inherit from Forum channels
type EntityClosure struct {
	WorkspaceID    string `json:"workspace_id" gorm:"type:uuid;not null;index:idx_ec_workspace"`
	AncestorType   string `json:"ancestor_type" gorm:"type:text;not null;primaryKey;index:idx_ec_ancestor,priority:1"`
	AncestorID     string `json:"ancestor_id" gorm:"type:uuid;not null;primaryKey;index:idx_ec_ancestor,priority:2"`
	DescendantType string `json:"descendant_type" gorm:"type:text;not null;primaryKey;index:idx_ec_descendant,priority:1"`
	DescendantID   string `json:"descendant_id" gorm:"type:uuid;not null;primaryKey;index:idx_ec_descendant,priority:2"`
	Depth          int    `json:"depth" gorm:"not null"` // 0 = self, 1 = direct child, etc.
	CreatedAt      time.Time
}

// TableName returns the table name for EntityClosure.
func (EntityClosure) TableName() string {
	return "entity_closure"
}
