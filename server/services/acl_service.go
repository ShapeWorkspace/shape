package services

import (
	"errors"
	"sort"

	"shape/models"

	"gorm.io/gorm"
)

// ACLService provides methods for managing ACL entries on resources.
// It handles CRUD operations for ACL entries and permission checking.
type ACLService struct {
	db                     *gorm.DB
	effectiveAccessService *EffectiveAccessService
}

// NewACLService creates a new ACL service instance.
func NewACLService(db *gorm.DB) *ACLService {
	return &ACLService{db: db}
}

// SetEffectiveAccessService sets the effective access service for cache updates.
// This is optional - if not set, cache updates will be skipped.
func (s *ACLService) SetEffectiveAccessService(effectiveAccessService *EffectiveAccessService) {
	s.effectiveAccessService = effectiveAccessService
}

// ACLEntryResponse is the JSON response format for an ACL entry.
// Includes hydrated user or team data based on subject_type.
type ACLEntryResponse struct {
	ID          string                `json:"id"`
	SubjectType models.ACLSubjectType `json:"subject_type"`
	SubjectID   string                `json:"subject_id"`
	Permission  models.ACLPermission  `json:"permission"`
	User        *UserResponse         `json:"user,omitempty"`
	Team        *TeamResponse         `json:"team,omitempty"`
	CreatedAt   string                `json:"created_at"`
}

// UserResponse is a minimal user representation for ACL responses.
type UserResponse struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

// TeamResponse is a minimal team representation for ACL responses.
type TeamResponse struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	TeamType    models.TeamType `json:"team_type"`
	MemberCount int             `json:"member_count"`
}

// AvailableSubjectsResponse contains teams and members that can be granted access.
type AvailableSubjectsResponse struct {
	Teams   []TeamResponse            `json:"teams"`
	Members []WorkspaceMemberResponse `json:"members"`
}

// WorkspaceMemberResponse is a minimal workspace member representation.
type WorkspaceMemberResponse struct {
	UserID string       `json:"user_id"`
	User   UserResponse `json:"user"`
}

// GetACLEntriesForResource returns all ACL entries for a specific resource, with hydrated user/team data.
// Results are ordered by creation time (newest first).
func (s *ACLService) GetACLEntriesForResource(workspaceID string, resourceType models.ACLResourceType, resourceID string) ([]models.ACLEntry, error) {
	var entries []models.ACLEntry
	if err := s.db.Where("workspace_id = ? AND resource_type = ? AND resource_id = ?", workspaceID, resourceType, resourceID).
		Order("created_at DESC").
		Find(&entries).Error; err != nil {
		return nil, err
	}

	// Hydrate user and team data for each entry
	for i := range entries {
		if err := s.hydrateACLEntry(&entries[i]); err != nil {
			return nil, err
		}
	}

	return entries, nil
}

// GetACLMemberCountForResource returns the count of unique users with access to a resource.
// This expands team memberships to count individual users.
// creatorID is optional - if provided, the creator is included in the count (for implicit access).
func (s *ACLService) GetACLMemberCountForResource(workspaceID string, resourceType models.ACLResourceType, resourceID string, creatorID string) (int, error) {
	// Count direct user grants + expanded team member grants (unique users only).
	// Using a subquery to expand teams and count distinct users.
	// If creatorID is provided, also include the creator in the count.
	var count int64

	query := `
		SELECT COUNT(DISTINCT user_id) FROM (
			-- Direct user grants
			SELECT subject_id as user_id
			FROM acl_entries
			WHERE workspace_id = ? AND resource_type = ? AND resource_id = ? AND subject_type = 'user'

			UNION

			-- Team grants expanded to team members
			SELECT tm.user_id
			FROM acl_entries ae
			JOIN team_members tm ON tm.team_id = ae.subject_id
			WHERE ae.workspace_id = ? AND ae.resource_type = ? AND ae.resource_id = ? AND ae.subject_type = 'team'
	`

	args := []interface{}{workspaceID, resourceType, resourceID, workspaceID, resourceType, resourceID}

	// Include creator if provided.
	// PostgreSQL needs explicit UUID casting while SQLite rejects ::uuid syntax.
	if creatorID != "" {
		creatorSelect := "SELECT ? as user_id"
		if s.db.Dialector.Name() == "postgres" {
			creatorSelect = "SELECT ?::uuid as user_id"
		}

		query += `
			UNION

			-- Creator has implicit access
			` + creatorSelect + `
		`
		args = append(args, creatorID)
	}

	query += `) expanded_users`

	err := s.db.Raw(query, args...).Scan(&count).Error
	if err != nil {
		return 0, err
	}
	return int(count), nil
}

// GetResourceCreatorID returns the creator/author ID for a resource, scoped to workspace.
// This is used to include implicit access for mention suggestions.
func (s *ACLService) GetResourceCreatorID(
	workspaceID string,
	resourceType models.ACLResourceType,
	resourceID string,
) (string, error) {
	entityType, ok := mapACLResourceTypeToEntityType(resourceType)
	if !ok {
		return "", errors.New("unsupported resource type")
	}

	var entity models.Entity
	if err := s.db.Select("creator_id").
		Where("id = ? AND workspace_id = ? AND entity_type = ?", resourceID, workspaceID, entityType).
		First(&entity).Error; err != nil {
		return "", err
	}

	return entity.CreatorID, nil
}

func mapACLResourceTypeToEntityType(resourceType models.ACLResourceType) (string, bool) {
	switch resourceType {
	case models.ACLResourceTypeProject:
		return "project", true
	case models.ACLResourceTypePaper:
		return "paper", true
	case models.ACLResourceTypeFile:
		return "file", true
	case models.ACLResourceTypeFolder:
		return "folder", true
	case models.ACLResourceTypeGroupChat:
		return "group-chat", true
	case models.ACLResourceTypeForumChannel:
		return "forum-channel", true
	default:
		return "", false
	}
}

// ListUserIDsWithAccessForResource returns user IDs with access to a resource.
// Uses the effective access cache and adds the creator as implicit access.
func (s *ACLService) ListUserIDsWithAccessForResource(
	workspaceID string,
	resourceType models.ACLResourceType,
	resourceID string,
	creatorID string,
) ([]string, error) {
	type userIDRow struct {
		UserID string `gorm:"column:user_id"`
	}

	var rows []userIDRow
	if err := s.db.Raw(`
		SELECT user_id
		FROM effective_resource_access
		WHERE workspace_id = ? AND resource_type = ? AND resource_id = ?
	`, workspaceID, resourceType, resourceID).Scan(&rows).Error; err != nil {
		return nil, err
	}

	uniqueUserIDs := make(map[string]struct{}, len(rows)+1)
	for _, row := range rows {
		if row.UserID == "" {
			continue
		}
		uniqueUserIDs[row.UserID] = struct{}{}
	}

	if creatorID != "" {
		uniqueUserIDs[creatorID] = struct{}{}
	}

	userIDs := make([]string, 0, len(uniqueUserIDs))
	for userID := range uniqueUserIDs {
		userIDs = append(userIDs, userID)
	}

	sort.Strings(userIDs)

	return userIDs, nil
}

// CreateACLEntryParams holds parameters for creating an ACL entry.
type CreateACLEntryParams struct {
	WorkspaceID  string
	ResourceType models.ACLResourceType
	ResourceID   string
	SubjectType  models.ACLSubjectType
	SubjectID    string
	Permission   models.ACLPermission
}

// CreateACLEntry creates a new ACL entry for a resource.
// Returns error if an entry already exists for the same resource/subject combination.
func (s *ACLService) CreateACLEntry(params CreateACLEntryParams) (*models.ACLEntry, error) {
	entry := models.NewACLEntry(params.WorkspaceID, params.ResourceType, params.ResourceID, params.SubjectType, params.SubjectID, params.Permission)

	if err := entry.Validate(); err != nil {
		return nil, err
	}

	if err := s.db.Create(entry).Error; err != nil {
		return nil, err
	}

	// Update effective access cache
	if s.effectiveAccessService != nil {
		if err := s.effectiveAccessService.OnACLEntryCreated(entry); err != nil {
			// Log error but don't fail the operation - cache can be rebuilt
			// TODO: Add proper logging
		}
	}

	// Hydrate and return
	if err := s.hydrateACLEntry(entry); err != nil {
		return nil, err
	}

	return entry, nil
}

// UpdateACLEntry updates the permission level of an existing ACL entry.
func (s *ACLService) UpdateACLEntry(entryID string, permission models.ACLPermission) (*models.ACLEntry, error) {
	// Validate permission
	switch permission {
	case models.ACLPermissionAdmin, models.ACLPermissionWrite, models.ACLPermissionRead:
		// Valid
	default:
		return nil, errors.New("invalid permission")
	}

	var entry models.ACLEntry
	if err := s.db.Where("id = ?", entryID).First(&entry).Error; err != nil {
		return nil, err
	}

	entry.Permission = permission
	if err := s.db.Save(&entry).Error; err != nil {
		return nil, err
	}

	// Update effective access cache
	if s.effectiveAccessService != nil {
		if err := s.effectiveAccessService.OnACLEntryUpdated(&entry); err != nil {
			// Log error but don't fail the operation - cache can be rebuilt
			// TODO: Add proper logging
		}
	}

	// Hydrate and return
	if err := s.hydrateACLEntry(&entry); err != nil {
		return nil, err
	}

	return &entry, nil
}

// DeleteACLEntry removes an ACL entry by ID.
func (s *ACLService) DeleteACLEntry(entryID string) error {
	// First, fetch the entry so we can update the cache
	var entry models.ACLEntry
	if err := s.db.Where("id = ?", entryID).First(&entry).Error; err != nil {
		return err
	}

	// Delete the entry
	result := s.db.Where("id = ?", entryID).Delete(&models.ACLEntry{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	// Update effective access cache
	if s.effectiveAccessService != nil {
		if err := s.effectiveAccessService.OnACLEntryDeleted(&entry); err != nil {
			// Log error but don't fail the operation - cache can be rebuilt
			// TODO: Add proper logging
		}
	}

	return nil
}

// GetACLEntryByID retrieves an ACL entry by its ID.
func (s *ACLService) GetACLEntryByID(entryID string) (*models.ACLEntry, error) {
	var entry models.ACLEntry
	if err := s.db.Where("id = ?", entryID).First(&entry).Error; err != nil {
		return nil, err
	}
	return &entry, nil
}

// CanUserManageACL checks if a user can manage ACL entries for a resource.
// Returns true if the user is the resource creator OR has admin permission on the resource.
func (s *ACLService) CanUserManageACL(userID string, resourceType models.ACLResourceType, resourceID string) (bool, error) {
	// Treat all ACL roots as entities in v2; creator access lives in the entities table.
	isCreator, err := s.isUserCreatorOfACLResourceEntity(userID, resourceType, resourceID)
	if err != nil {
		return false, err
	}
	if isCreator {
		return true, nil
	}

	// Check if user has direct admin permission
	var directAdmin int64
	if err := s.db.Model(&models.ACLEntry{}).
		Where("resource_type = ? AND resource_id = ? AND subject_type = ? AND subject_id = ? AND permission = ?",
			resourceType, resourceID, models.ACLSubjectTypeUser, userID, models.ACLPermissionAdmin).
		Count(&directAdmin).Error; err != nil {
		return false, err
	}
	if directAdmin > 0 {
		return true, nil
	}

	// Check if user has admin permission through a team
	var teamAdmin int64
	if err := s.db.Raw(`
		SELECT COUNT(*)
		FROM acl_entries ae
		JOIN team_members tm ON tm.team_id = ae.subject_id
		WHERE ae.resource_type = ? AND ae.resource_id = ?
			AND ae.subject_type = 'team' AND ae.permission = 'admin'
			AND tm.user_id = ?
	`, resourceType, resourceID, userID).Scan(&teamAdmin).Error; err != nil {
		return false, err
	}

	return teamAdmin > 0, nil
}

func (s *ACLService) isUserCreatorOfACLResourceEntity(userID string, resourceType models.ACLResourceType, resourceID string) (bool, error) {
	// Only ACL roots that map to an entity type can use creator ownership.
	entityType, ok := mapACLResourceTypeToEntityType(resourceType)
	if !ok {
		return false, nil
	}

	var entity models.Entity
	if err := s.db.Select("creator_id").
		Where("id = ? AND entity_type = ?", resourceID, entityType).
		First(&entity).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, nil
		}
		return false, err
	}

	return entity.CreatorID == userID, nil
}

// GetUserPermissionOnResource returns the highest permission a user has on a resource.
// Considers direct user grants, team membership grants, and inherited grants from ancestors.
// Returns nil if the user has no access.
func (s *ACLService) GetUserPermissionOnResource(userID string, resourceType models.ACLResourceType, resourceID string) (*models.ACLPermission, error) {
	// Query direct, team-based, and inherited permissions, returning the highest one.
	// Inherited permissions are checked via the entity_closure table which tracks parent-child
	// relationships between folders and their contents (files, subfolders).
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

			-- Inherited user grants from ancestors (via entity_closure)
			SELECT ae.permission,
				CASE ae.permission WHEN 'admin' THEN 2 WHEN 'write' THEN 1 WHEN 'read' THEN 0 END as priority
			FROM acl_entries ae
			JOIN entity_closure ec ON ae.resource_type = ec.ancestor_type AND ae.resource_id = ec.ancestor_id
			WHERE ec.descendant_type = ? AND ec.descendant_id = ?
				AND ae.subject_type = 'user' AND ae.subject_id = ?

			UNION ALL

			-- Inherited team grants from ancestors (via entity_closure)
			SELECT ae.permission,
				CASE ae.permission WHEN 'admin' THEN 2 WHEN 'write' THEN 1 WHEN 'read' THEN 0 END as priority
			FROM acl_entries ae
			JOIN entity_closure ec ON ae.resource_type = ec.ancestor_type AND ae.resource_id = ec.ancestor_id
			JOIN team_members tm ON tm.team_id = ae.subject_id
			WHERE ec.descendant_type = ? AND ec.descendant_id = ?
				AND ae.subject_type = 'team' AND tm.user_id = ?
		) grants
		ORDER BY priority DESC
		LIMIT 1
	`, resourceType, resourceID, userID,
		resourceType, resourceID, userID,
		resourceType, resourceID, userID,
		resourceType, resourceID, userID).Scan(&permission).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}

	if permission == "" {
		return nil, nil
	}

	result := models.ACLPermission(permission)
	return &result, nil
}

// UserHasAccessToResource checks if a user has any level of access to a resource.
// Considers both direct user grants and team membership grants.
func (s *ACLService) UserHasAccessToResource(userID string, resourceType models.ACLResourceType, resourceID string) (bool, error) {
	permission, err := s.GetUserPermissionOnResource(userID, resourceType, resourceID)
	if err != nil {
		return false, err
	}
	return permission != nil, nil
}

// UserHasWriteAccessToResource checks if a user has write or admin access to a resource.
// This is used to enforce write permissions for operations like sending messages.
// Considers both direct user grants and team membership grants.
func (s *ACLService) UserHasWriteAccessToResource(userID string, resourceType models.ACLResourceType, resourceID string) (bool, error) {
	permission, err := s.GetUserPermissionOnResource(userID, resourceType, resourceID)
	if err != nil {
		return false, err
	}
	if permission == nil {
		return false, nil
	}
	// Write or admin permission allows writing
	return *permission == models.ACLPermissionWrite || *permission == models.ACLPermissionAdmin, nil
}

// GetAvailableSubjectsForResource returns teams and members that don't already have access to the resource.
// Teams are listed first (including Everyone team), then individual workspace members.
// excludeUserIDs is a list of user IDs to exclude from the results (typically the current user,
// since you can't add yourself to a resource).
func (s *ACLService) GetAvailableSubjectsForResource(workspaceID string, resourceType models.ACLResourceType, resourceID string, excludeUserIDs ...string) (*AvailableSubjectsResponse, error) {
	// Get all teams in the workspace that don't already have access to this resource.
	// Everyone team should appear first.
	var teams []models.Team
	if err := s.db.Raw(`
		SELECT t.*,
			(SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count
		FROM teams t
		WHERE t.workspace_id = ?
			AND t.id NOT IN (
				SELECT subject_id FROM acl_entries
				WHERE workspace_id = ? AND resource_type = ? AND resource_id = ? AND subject_type = 'team'
			)
		ORDER BY
			CASE WHEN t.team_type = 'everyone' THEN 0 ELSE 1 END,
			t.name ASC
	`, workspaceID, workspaceID, resourceType, resourceID).Scan(&teams).Error; err != nil {
		return nil, err
	}

	// Build the query for workspace members, excluding those with direct access
	query := s.db.Preload("User").
		Where("workspace_id = ?", workspaceID).
		Where("user_id NOT IN (?)",
			s.db.Table("acl_entries").
				Select("subject_id").
				Where("workspace_id = ? AND resource_type = ? AND resource_id = ? AND subject_type = ?",
					workspaceID, resourceType, resourceID, models.ACLSubjectTypeUser))

	// Also exclude any additional user IDs (current user, creator, etc.)
	if len(excludeUserIDs) > 0 {
		query = query.Where("user_id NOT IN ?", excludeUserIDs)
	}

	var members []models.WorkspaceMember
	if err := query.Order("created_at ASC").Find(&members).Error; err != nil {
		return nil, err
	}

	// Convert to response format
	teamResponses := make([]TeamResponse, len(teams))
	for i, team := range teams {
		teamResponses[i] = TeamResponse{
			ID:          team.ID,
			Name:        team.Name,
			TeamType:    team.TeamType,
			MemberCount: team.MemberCount,
		}
	}

	memberResponses := make([]WorkspaceMemberResponse, len(members))
	for i, member := range members {
		memberResponses[i] = WorkspaceMemberResponse{
			UserID: member.UserID,
			User: UserResponse{
				ID:    member.User.ID,
				Email: member.User.Email,
			},
		}
	}

	return &AvailableSubjectsResponse{
		Teams:   teamResponses,
		Members: memberResponses,
	}, nil
}

// hydrateACLEntry loads user or team data for an ACL entry based on subject_type.
func (s *ACLService) hydrateACLEntry(entry *models.ACLEntry) error {
	switch entry.SubjectType {
	case models.ACLSubjectTypeUser:
		var user models.User
		if err := s.db.Where("id = ?", entry.SubjectID).First(&user).Error; err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			// User not found - might have been deleted
		} else {
			entry.User = &user
		}
	case models.ACLSubjectTypeTeam:
		var team models.Team
		if err := s.db.Raw(`
			SELECT t.*,
				(SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count
			FROM teams t
			WHERE t.id = ?
		`, entry.SubjectID).Scan(&team).Error; err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			// Team not found - might have been deleted
		} else {
			entry.Team = &team
		}
	}
	return nil
}

// ToACLEntryResponse converts an ACLEntry to its JSON response format.
func ToACLEntryResponse(e *models.ACLEntry) *ACLEntryResponse {
	response := &ACLEntryResponse{
		ID:          e.ID,
		SubjectType: e.SubjectType,
		SubjectID:   e.SubjectID,
		Permission:  e.Permission,
		CreatedAt:   e.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}

	if e.User != nil {
		response.User = &UserResponse{
			ID:    e.User.ID,
			Email: e.User.Email,
		}
	}

	if e.Team != nil {
		response.Team = &TeamResponse{
			ID:          e.Team.ID,
			Name:        e.Team.Name,
			TeamType:    e.Team.TeamType,
			MemberCount: e.Team.MemberCount,
		}
	}

	return response
}
