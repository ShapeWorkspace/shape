package services

import (
	"shape/models"

	"gorm.io/gorm"
)

// EffectiveAccessService provides methods for managing the effective access cache.
// This service is called by ACLService and TeamMemberService to keep the cache in sync.
type EffectiveAccessService struct {
	db                   *gorm.DB
	entityClosureService *EntityClosureService
}

// NewEffectiveAccessService creates a new EffectiveAccessService instance.
func NewEffectiveAccessService(db *gorm.DB, entityClosureService *EntityClosureService) *EffectiveAccessService {
	return &EffectiveAccessService{
		db:                   db,
		entityClosureService: entityClosureService,
	}
}

// GetUserPermission returns the cached permission for a user on a resource.
// Returns nil if the user has no access.
func (s *EffectiveAccessService) GetUserPermission(userID, resourceType, resourceID string) (*models.ACLPermission, error) {
	var access models.EffectiveResourceAccess
	err := s.db.Where("user_id = ? AND resource_type = ? AND resource_id = ?",
		userID, resourceType, resourceID).First(&access).Error

	if err == gorm.ErrRecordNotFound {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	perm := models.ACLPermission(access.Permission)
	return &perm, nil
}

// UserHasAccess checks if a user has any level of access to a resource.
func (s *EffectiveAccessService) UserHasAccess(userID, resourceType, resourceID string) (bool, error) {
	var count int64
	err := s.db.Model(&models.EffectiveResourceAccess{}).
		Where("user_id = ? AND resource_type = ? AND resource_id = ?",
			userID, resourceType, resourceID).
		Count(&count).Error
	return count > 0, err
}

// UserHasWriteAccess checks if a user has write or admin access to a resource.
func (s *EffectiveAccessService) UserHasWriteAccess(userID, resourceType, resourceID string) (bool, error) {
	var count int64
	err := s.db.Model(&models.EffectiveResourceAccess{}).
		Where("user_id = ? AND resource_type = ? AND resource_id = ? AND permission IN ('write', 'admin')",
			userID, resourceType, resourceID).
		Count(&count).Error
	return count > 0, err
}

// GetResourcesForUser returns all resource IDs of a given type that a user can access.
// This is the primary query that benefits from the cache.
func (s *EffectiveAccessService) GetResourcesForUser(userID, workspaceID, resourceType string) ([]string, error) {
	var resourceIDs []string
	err := s.db.Model(&models.EffectiveResourceAccess{}).
		Where("user_id = ? AND workspace_id = ? AND resource_type = ?",
			userID, workspaceID, resourceType).
		Pluck("resource_id", &resourceIDs).Error
	return resourceIDs, err
}

// GetUsersForResource returns all users who have access to a resource.
// Useful for the ACL management UI.
func (s *EffectiveAccessService) GetUsersForResource(resourceType, resourceID string) ([]models.EffectiveResourceAccess, error) {
	var accesses []models.EffectiveResourceAccess
	err := s.db.Where("resource_type = ? AND resource_id = ?",
		resourceType, resourceID).Find(&accesses).Error
	return accesses, err
}

// OnACLEntryCreated updates the cache when a new ACL entry is created.
// This propagates access to all descendants of the resource.
func (s *EffectiveAccessService) OnACLEntryCreated(entry *models.ACLEntry) error {
	// Get affected users
	userIDs, err := s.getAffectedUserIDs(entry.SubjectType, entry.SubjectID)
	if err != nil {
		return err
	}

	// Get affected resources (resource + all descendants)
	resources := []struct{ Type, ID string }{{string(entry.ResourceType), entry.ResourceID}}
	descendants, err := s.entityClosureService.GetDescendantIDs(string(entry.ResourceType), entry.ResourceID)
	if err != nil {
		return err
	}
	resources = append(resources, descendants...)

	// Recompute access for each (user, resource) pair
	for _, userID := range userIDs {
		for _, res := range resources {
			if err := s.recomputeAccess(entry.WorkspaceID, userID, res.Type, res.ID); err != nil {
				return err
			}
		}
	}

	return nil
}

// OnACLEntryDeleted updates the cache when an ACL entry is deleted.
// This removes access from all descendants of the resource.
func (s *EffectiveAccessService) OnACLEntryDeleted(entry *models.ACLEntry) error {
	// Same logic as OnACLEntryCreated - recompute access for affected users/resources
	return s.OnACLEntryCreated(entry)
}

// OnACLEntryUpdated updates the cache when an ACL entry's permission is changed.
func (s *EffectiveAccessService) OnACLEntryUpdated(entry *models.ACLEntry) error {
	// Same logic as OnACLEntryCreated - recompute access for affected users/resources
	return s.OnACLEntryCreated(entry)
}

// OnTeamMemberAdded updates the cache when a user is added to a team.
// This grants access to all resources the team has access to.
func (s *EffectiveAccessService) OnTeamMemberAdded(workspaceID, teamID, userID string) error {
	// Find all ACL entries for this team
	var entries []models.ACLEntry
	if err := s.db.Where("subject_type = 'team' AND subject_id = ?", teamID).Find(&entries).Error; err != nil {
		return err
	}

	// For each resource the team has access to, recompute access for the user
	for _, entry := range entries {
		// Get affected resources (resource + all descendants)
		resources := []struct{ Type, ID string }{{string(entry.ResourceType), entry.ResourceID}}
		descendants, err := s.entityClosureService.GetDescendantIDs(string(entry.ResourceType), entry.ResourceID)
		if err != nil {
			return err
		}
		resources = append(resources, descendants...)

		for _, res := range resources {
			if err := s.recomputeAccess(entry.WorkspaceID, userID, res.Type, res.ID); err != nil {
				return err
			}
		}
	}

	return nil
}

// OnTeamMemberRemoved updates the cache when a user is removed from a team.
// This may revoke access to resources the team had access to (unless user has other access paths).
func (s *EffectiveAccessService) OnTeamMemberRemoved(workspaceID, teamID, userID string) error {
	// Same logic as OnTeamMemberAdded - recompute access for all team's resources
	return s.OnTeamMemberAdded(workspaceID, teamID, userID)
}

// OnEntityCreatedWithParent updates the cache when an entity is created with a parent.
// This copies the parent's effective access to the new entity.
func (s *EffectiveAccessService) OnEntityCreatedWithParent(
	workspaceID string,
	entityType string,
	entityID string,
	parentType string,
	parentID string,
) error {
	if parentID == "" {
		return nil
	}

	// Get all users who have access to the parent
	var parentAccess []models.EffectiveResourceAccess
	if err := s.db.Where("resource_type = ? AND resource_id = ?", parentType, parentID).
		Find(&parentAccess).Error; err != nil {
		return err
	}

	// Copy parent's access to the new entity
	for _, access := range parentAccess {
		if err := s.db.Save(&models.EffectiveResourceAccess{
			WorkspaceID:  workspaceID,
			UserID:       access.UserID,
			ResourceType: entityType,
			ResourceID:   entityID,
			Permission:   access.Permission,
		}).Error; err != nil {
			return err
		}
	}

	// Also check if the entity itself has any direct ACL entries
	// and merge with inherited access
	return s.recomputeAccessForResource(workspaceID, entityType, entityID)
}

// OnEntityDeleted removes all cache entries for a deleted entity.
func (s *EffectiveAccessService) OnEntityDeleted(resourceType, resourceID string) error {
	return s.db.Where("resource_type = ? AND resource_id = ?", resourceType, resourceID).
		Delete(&models.EffectiveResourceAccess{}).Error
}

// RebuildForResource recomputes effective access for a single resource and all its descendants.
// This is the core rebuild function used by other methods.
func (s *EffectiveAccessService) RebuildForResource(workspaceID, resourceType, resourceID string) error {
	// Get all descendants (including self if it's in the closure table)
	resources := []struct{ Type, ID string }{{resourceType, resourceID}}
	descendants, err := s.entityClosureService.GetDescendantIDs(resourceType, resourceID)
	if err != nil {
		return err
	}
	resources = append(resources, descendants...)

	// Get all users in the workspace
	var userIDs []string
	if err := s.db.Model(&models.WorkspaceMember{}).
		Where("workspace_id = ?", workspaceID).
		Pluck("user_id", &userIDs).Error; err != nil {
		return err
	}

	// Recompute access for each (user, resource) pair
	for _, userID := range userIDs {
		for _, res := range resources {
			if err := s.recomputeAccess(workspaceID, userID, res.Type, res.ID); err != nil {
				return err
			}
		}
	}

	return nil
}

// RebuildForUser recomputes all effective access for a single user.
// Used when a user's team memberships change significantly.
func (s *EffectiveAccessService) RebuildForUser(workspaceID, userID string) error {
	// Delete all existing access for this user in this workspace
	if err := s.db.Where("workspace_id = ? AND user_id = ?", workspaceID, userID).
		Delete(&models.EffectiveResourceAccess{}).Error; err != nil {
		return err
	}

	// Get all ACL entries where user has direct access
	var directEntries []models.ACLEntry
	if err := s.db.Where("workspace_id = ? AND subject_type = 'user' AND subject_id = ?",
		workspaceID, userID).Find(&directEntries).Error; err != nil {
		return err
	}

	// Get all teams the user is a member of
	var teamIDs []string
	if err := s.db.Model(&models.TeamMember{}).
		Where("user_id = ?", userID).
		Pluck("team_id", &teamIDs).Error; err != nil {
		return err
	}

	// Get all ACL entries for user's teams
	var teamEntries []models.ACLEntry
	if len(teamIDs) > 0 {
		if err := s.db.Where("workspace_id = ? AND subject_type = 'team' AND subject_id IN ?",
			workspaceID, teamIDs).Find(&teamEntries).Error; err != nil {
			return err
		}
	}

	// Combine all entries
	allEntries := append(directEntries, teamEntries...)

	// For each entry, compute access for the resource and all descendants
	for _, entry := range allEntries {
		resources := []struct{ Type, ID string }{{string(entry.ResourceType), entry.ResourceID}}
		descendants, err := s.entityClosureService.GetDescendantIDs(string(entry.ResourceType), entry.ResourceID)
		if err != nil {
			return err
		}
		resources = append(resources, descendants...)

		for _, res := range resources {
			if err := s.recomputeAccess(workspaceID, userID, res.Type, res.ID); err != nil {
				return err
			}
		}
	}

	return nil
}

// BackfillForWorkspace rebuilds the entire cache for a workspace.
// This is an expensive operation and should only be used for initial setup or recovery.
func (s *EffectiveAccessService) BackfillForWorkspace(workspaceID string) error {
	// Delete all existing cache for this workspace
	if err := s.db.Where("workspace_id = ?", workspaceID).
		Delete(&models.EffectiveResourceAccess{}).Error; err != nil {
		return err
	}

	// Get all users in the workspace
	var userIDs []string
	if err := s.db.Model(&models.WorkspaceMember{}).
		Where("workspace_id = ?", workspaceID).
		Pluck("user_id", &userIDs).Error; err != nil {
		return err
	}

	// Get all ACL entries in the workspace
	var entries []models.ACLEntry
	if err := s.db.Where("workspace_id = ?", workspaceID).Find(&entries).Error; err != nil {
		return err
	}

	// Build a map of resource -> highest permission per user
	accessMap := make(map[string]map[string]string) // resourceKey -> userID -> permission

	for _, entry := range entries {
		// Get affected users for this entry
		userIDsForEntry, err := s.getAffectedUserIDs(entry.SubjectType, entry.SubjectID)
		if err != nil {
			return err
		}

		// Get affected resources (entry's resource + all descendants)
		resources := []struct{ Type, ID string }{{string(entry.ResourceType), entry.ResourceID}}
		descendants, err := s.entityClosureService.GetDescendantIDs(string(entry.ResourceType), entry.ResourceID)
		if err != nil {
			return err
		}
		resources = append(resources, descendants...)

		// Update access map
		for _, userID := range userIDsForEntry {
			for _, res := range resources {
				resourceKey := res.Type + ":" + res.ID
				if accessMap[resourceKey] == nil {
					accessMap[resourceKey] = make(map[string]string)
				}

				// Only update if new permission is higher
				currentPerm := accessMap[resourceKey][userID]
				if s.isHigherPermission(string(entry.Permission), currentPerm) {
					accessMap[resourceKey][userID] = string(entry.Permission)
				}
			}
		}
	}

	// Insert all access entries
	for resourceKey, userPerms := range accessMap {
		parts := splitResourceKey(resourceKey)
		if len(parts) != 2 {
			continue
		}
		resourceType, resourceID := parts[0], parts[1]

		for userID, permission := range userPerms {
			if err := s.db.Create(&models.EffectiveResourceAccess{
				WorkspaceID:  workspaceID,
				UserID:       userID,
				ResourceType: resourceType,
				ResourceID:   resourceID,
				Permission:   permission,
			}).Error; err != nil {
				return err
			}
		}
	}

	return nil
}

// getAffectedUserIDs returns all user IDs affected by an ACL subject.
// For user subjects, returns just that user.
// For team subjects, returns all team members.
func (s *EffectiveAccessService) getAffectedUserIDs(subjectType models.ACLSubjectType, subjectID string) ([]string, error) {
	if subjectType == models.ACLSubjectTypeUser {
		return []string{subjectID}, nil
	}

	if subjectType == models.ACLSubjectTypeTeam {
		var userIDs []string
		if err := s.db.Model(&models.TeamMember{}).
			Where("team_id = ?", subjectID).
			Pluck("user_id", &userIDs).Error; err != nil {
			return nil, err
		}
		return userIDs, nil
	}

	return nil, nil
}

// recomputeAccess recalculates effective access for a single (user, resource) pair.
// This considers direct ACL entries, team-based entries, and inherited access.
func (s *EffectiveAccessService) recomputeAccess(workspaceID, userID, resourceType, resourceID string) error {
	// Get the highest permission from all access paths:
	// 1. Direct ACL entry on this resource
	// 2. Team-based ACL entry on this resource
	// 3. Inherited from ancestors (via entity_closure)

	var permission string
	err := s.db.Raw(`
		SELECT permission FROM (
			-- Direct user grants on this resource
			SELECT permission,
				CASE permission WHEN 'admin' THEN 2 WHEN 'write' THEN 1 WHEN 'read' THEN 0 END as priority
			FROM acl_entries
			WHERE resource_type = ? AND resource_id = ? AND subject_type = 'user' AND subject_id = ?

			UNION ALL

			-- Team grants on this resource
			SELECT ae.permission,
				CASE ae.permission WHEN 'admin' THEN 2 WHEN 'write' THEN 1 WHEN 'read' THEN 0 END as priority
			FROM acl_entries ae
			JOIN team_members tm ON tm.team_id = ae.subject_id
			WHERE ae.resource_type = ? AND ae.resource_id = ? AND ae.subject_type = 'team' AND tm.user_id = ?

			UNION ALL

			-- Inherited from ancestors (user grants)
			SELECT ae.permission,
				CASE ae.permission WHEN 'admin' THEN 2 WHEN 'write' THEN 1 WHEN 'read' THEN 0 END as priority
			FROM acl_entries ae
			JOIN entity_closure ec ON ae.resource_type = ec.ancestor_type AND ae.resource_id = ec.ancestor_id
			WHERE ec.descendant_type = ? AND ec.descendant_id = ?
				AND ae.subject_type = 'user' AND ae.subject_id = ?

			UNION ALL

			-- Inherited from ancestors (team grants)
			SELECT ae.permission,
				CASE ae.permission WHEN 'admin' THEN 2 WHEN 'write' THEN 1 WHEN 'read' THEN 0 END as priority
			FROM acl_entries ae
			JOIN entity_closure ec ON ae.resource_type = ec.ancestor_type AND ae.resource_id = ec.ancestor_id
			JOIN team_members tm ON tm.team_id = ae.subject_id
			WHERE ec.descendant_type = ? AND ec.descendant_id = ?
				AND ae.subject_type = 'team' AND tm.user_id = ?
		) all_grants
		ORDER BY priority DESC
		LIMIT 1
	`, resourceType, resourceID, userID,
		resourceType, resourceID, userID,
		resourceType, resourceID, userID,
		resourceType, resourceID, userID).Scan(&permission).Error

	if err != nil && err != gorm.ErrRecordNotFound {
		return err
	}

	if permission == "" {
		// No access - delete any existing cache entry
		return s.db.Where("user_id = ? AND resource_type = ? AND resource_id = ?",
			userID, resourceType, resourceID).Delete(&models.EffectiveResourceAccess{}).Error
	}

	// Upsert access entry
	return s.db.Save(&models.EffectiveResourceAccess{
		WorkspaceID:  workspaceID,
		UserID:       userID,
		ResourceType: resourceType,
		ResourceID:   resourceID,
		Permission:   permission,
	}).Error
}

// recomputeAccessForResource recalculates effective access for all users on a single resource.
func (s *EffectiveAccessService) recomputeAccessForResource(workspaceID, resourceType, resourceID string) error {
	// Get all users in the workspace
	var userIDs []string
	if err := s.db.Model(&models.WorkspaceMember{}).
		Where("workspace_id = ?", workspaceID).
		Pluck("user_id", &userIDs).Error; err != nil {
		return err
	}

	for _, userID := range userIDs {
		if err := s.recomputeAccess(workspaceID, userID, resourceType, resourceID); err != nil {
			return err
		}
	}

	return nil
}

// isHigherPermission returns true if perm1 is higher priority than perm2.
func (s *EffectiveAccessService) isHigherPermission(perm1, perm2 string) bool {
	priority := map[string]int{"admin": 2, "write": 1, "read": 0, "": -1}
	return priority[perm1] > priority[perm2]
}

// splitResourceKey splits a "type:id" key into parts.
func splitResourceKey(key string) []string {
	for i := 0; i < len(key); i++ {
		if key[i] == ':' {
			return []string{key[:i], key[i+1:]}
		}
	}
	return nil
}
