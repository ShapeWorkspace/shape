package services

import (
	"shape/models"

	"gorm.io/gorm"
)

// WorkspaceChecker provides common workspace membership checking functionality.
// This service is designed to be a dependency for other services that need to check workspace membership.
type WorkspaceChecker struct {
	db *gorm.DB
}

// NewWorkspaceChecker creates a new WorkspaceChecker instance.
func NewWorkspaceChecker(db *gorm.DB) *WorkspaceChecker {
	return &WorkspaceChecker{
		db: db,
	}
}

// IsUserInWorkspace checks if a user is a member of a workspace.
func (c *WorkspaceChecker) IsUserInWorkspace(userID, workspaceID string) bool {
	var count int64
	c.db.Model(&models.WorkspaceMember{}).Where("user_id = ? AND workspace_id = ?", userID, workspaceID).Count(&count)
	return count > 0
}

// IsUserWorkspaceAdmin checks if a user is an admin of a workspace.
// Treat super administrators as implicit admins so existing admin-gated flows continue to work.
func (c *WorkspaceChecker) IsUserWorkspaceAdmin(userID, workspaceID string) bool {
	var count int64
	c.db.Model(&models.WorkspaceMember{}).
		Where(
			"user_id = ? AND workspace_id = ? AND role IN ?",
			userID,
			workspaceID,
			[]models.WorkspaceMemberRole{models.WorkspaceMemberRoleAdmin, models.WorkspaceMemberRoleSuperAdmin},
		).
		Count(&count)
	return count > 0
}

// IsUserWorkspaceSuperAdmin reports whether the user has the top-level workspace owner role.
func (c *WorkspaceChecker) IsUserWorkspaceSuperAdmin(userID, workspaceID string) bool {
	var count int64
	c.db.Model(&models.WorkspaceMember{}).
		Where("user_id = ? AND workspace_id = ? AND role = ?", userID, workspaceID, models.WorkspaceMemberRoleSuperAdmin).
		Count(&count)
	return count > 0
}
