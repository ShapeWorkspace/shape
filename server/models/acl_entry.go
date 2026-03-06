package models

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

// ACLResourceType enumerates resources that can be protected by ACL entries.
type ACLResourceType string

const (
	ACLResourceTypeDiscussion    ACLResourceType = "discussion"
	ACLResourceTypeProject       ACLResourceType = "project"
	ACLResourceTypeGroupChat     ACLResourceType = "group_chat"
	ACLResourceTypeFolder        ACLResourceType = "folder"
	ACLResourceTypeFile          ACLResourceType = "file"
	ACLResourceTypePaper         ACLResourceType = "paper"
	ACLResourceTypeForumChannel  ACLResourceType = "forum_channel"
)

// ACLSubjectType enumerates the subjects that may hold permissions.
type ACLSubjectType string

const (
	ACLSubjectTypeUser    ACLSubjectType = "user"
	ACLSubjectTypeTeam    ACLSubjectType = "team"
	ACLSubjectTypeProject ACLSubjectType = "project"
)

// ACLPermission defines the permission levels supported by the ACL surface.
type ACLPermission string

const (
	ACLPermissionAdmin ACLPermission = "admin"
	ACLPermissionWrite ACLPermission = "write"
	ACLPermissionRead  ACLPermission = "read"
)

// ACLEntry captures a permission binding between a subject (user or team) and a protected resource.
type ACLEntry struct {
	ID           string          `json:"id" gorm:"primaryKey;type:uuid"`
	WorkspaceID  string          `json:"workspace_id" gorm:"type:uuid;not null;index:idx_acl_entries_workspace"`
	ResourceType ACLResourceType `json:"resource_type" gorm:"type:text;not null;uniqueIndex:idx_acl_resource_subject,priority:1;index:idx_acl_resource_lookup,priority:1"`
	ResourceID   string          `json:"resource_id" gorm:"type:uuid;not null;uniqueIndex:idx_acl_resource_subject,priority:2;index:idx_acl_resource_lookup,priority:2"`
	SubjectType  ACLSubjectType  `json:"subject_type" gorm:"type:text;not null;uniqueIndex:idx_acl_resource_subject,priority:3;index:idx_acl_subject_lookup,priority:1"`
	SubjectID    string          `json:"subject_id" gorm:"type:uuid;not null;uniqueIndex:idx_acl_resource_subject,priority:4;index:idx_acl_subject_lookup,priority:2"`
	Permission   ACLPermission   `json:"permission" gorm:"type:text;not null"`
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
	// Do not let GORM create FK constraints here; subject_id is polymorphic.
	Team *Team `json:"team,omitempty" gorm:"-"`
	User *User `json:"user,omitempty" gorm:"-"`
}

// TableName keeps the ACL entry table name consistent across services.
func (ACLEntry) TableName() string {
	return "acl_entries"
}

// NewACLEntry constructs a normalized ACL entry for persistence.
func NewACLEntry(workspaceID string, resourceType ACLResourceType, resourceID string, subjectType ACLSubjectType, subjectID string, permission ACLPermission) *ACLEntry {
	return &ACLEntry{
		ID:           uuid.NewString(),
		WorkspaceID:  workspaceID,
		ResourceType: resourceType,
		ResourceID:   resourceID,
		SubjectType:  subjectType,
		SubjectID:    subjectID,
		Permission:   permission,
	}
}

// Validate ensures the entry contains required values before writes occur.
func (e *ACLEntry) Validate() error {
	if e.WorkspaceID == "" || e.ResourceID == "" || e.SubjectID == "" {
		return errors.New("workspace_id, resource_id, and subject_id are required")
	}
	switch e.ResourceType {
	case ACLResourceTypeDiscussion, ACLResourceTypeProject, ACLResourceTypeGroupChat, ACLResourceTypeFolder, ACLResourceTypeFile, ACLResourceTypePaper, ACLResourceTypeForumChannel:
	default:
		return errors.New("invalid resource type")
	}
	switch e.SubjectType {
	case ACLSubjectTypeUser, ACLSubjectTypeTeam, ACLSubjectTypeProject:
	default:
		return errors.New("invalid subject type")
	}
	switch e.Permission {
	case ACLPermissionAdmin, ACLPermissionWrite, ACLPermissionRead:
	default:
		return errors.New("invalid permission")
	}
	return nil
}
