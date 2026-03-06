package services

import (
	"shape/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// TeamService provides methods for querying and managing teams within a workspace.
type TeamService struct {
	db                     *gorm.DB
	effectiveAccessService *EffectiveAccessService
}

// NewTeamService creates a new team service instance.
func NewTeamService(db *gorm.DB) *TeamService {
	return &TeamService{db: db}
}

// SetEffectiveAccessService sets the effective access service for cache updates.
// This is optional - if not set, cache updates will be skipped.
func (s *TeamService) SetEffectiveAccessService(effectiveAccessService *EffectiveAccessService) {
	s.effectiveAccessService = effectiveAccessService
}

// GetTeamsInWorkspace returns all teams in a workspace, ordered with Everyone team first.
// Each team includes a computed member_count field.
func (s *TeamService) GetTeamsInWorkspace(workspaceID string) ([]models.Team, error) {
	var teams []models.Team
	if err := s.db.Raw(`
		SELECT t.*,
			(SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count
		FROM teams t
		WHERE t.workspace_id = ?
		ORDER BY
			CASE WHEN t.team_type = 'everyone' THEN 0 ELSE 1 END,
			t.name ASC
	`, workspaceID).Scan(&teams).Error; err != nil {
		return nil, err
	}
	return teams, nil
}

// GetTeamByID returns a single team by ID with member count.
func (s *TeamService) GetTeamByID(teamID string) (*models.Team, error) {
	var team models.Team
	if err := s.db.Raw(`
		SELECT t.*,
			(SELECT COUNT(*) FROM team_members WHERE team_id = t.id) as member_count
		FROM teams t
		WHERE t.id = ?
	`, teamID).Scan(&team).Error; err != nil {
		return nil, err
	}
	if team.ID == "" {
		return nil, gorm.ErrRecordNotFound
	}
	return &team, nil
}

// GetTeamMembers returns all members of a team with their user data.
func (s *TeamService) GetTeamMembers(teamID string) ([]models.TeamMember, error) {
	var members []models.TeamMember
	if err := s.db.Preload("User").
		Where("team_id = ?", teamID).
		Order("created_at ASC").
		Find(&members).Error; err != nil {
		return nil, err
	}
	return members, nil
}

// AddMember adds a user to a team and updates the effective access cache.
// This method should be used for all team membership additions to ensure cache consistency.
func (s *TeamService) AddMember(workspaceID, teamID, userID string, role models.TeamMemberRole) (*models.TeamMember, error) {
	// Check if user is already a member
	var existing models.TeamMember
	if err := s.db.Where("team_id = ? AND user_id = ?", teamID, userID).First(&existing).Error; err == nil {
		return &existing, nil
	}

	member := &models.TeamMember{
		ID:          uuid.NewString(),
		TeamID:      teamID,
		WorkspaceID: workspaceID,
		UserID:      userID,
		Role:        role,
	}

	if err := s.db.Create(member).Error; err != nil {
		return nil, err
	}

	// Update effective access cache
	if s.effectiveAccessService != nil {
		if err := s.effectiveAccessService.OnTeamMemberAdded(workspaceID, teamID, userID); err != nil {
			// Log error but don't fail the operation - cache can be rebuilt
			// TODO: Add proper logging
		}
	}

	return member, nil
}

// RemoveMember removes a user from a team and updates the effective access cache.
// This method should be used for all team membership removals to ensure cache consistency.
func (s *TeamService) RemoveMember(workspaceID, teamID, userID string) error {
	result := s.db.Where("team_id = ? AND user_id = ?", teamID, userID).Delete(&models.TeamMember{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	// Update effective access cache
	if s.effectiveAccessService != nil {
		if err := s.effectiveAccessService.OnTeamMemberRemoved(workspaceID, teamID, userID); err != nil {
			// Log error but don't fail the operation - cache can be rebuilt
			// TODO: Add proper logging
		}
	}

	return nil
}

// RemoveAllMembersFromTeam removes all members from a team.
// This is used when deleting a team. Cache updates are handled per-member.
func (s *TeamService) RemoveAllMembersFromTeam(workspaceID, teamID string) error {
	// Get all members first for cache updates
	var members []models.TeamMember
	if err := s.db.Where("team_id = ?", teamID).Find(&members).Error; err != nil {
		return err
	}

	// Delete all members
	if err := s.db.Where("team_id = ?", teamID).Delete(&models.TeamMember{}).Error; err != nil {
		return err
	}

	// Update effective access cache for each member
	if s.effectiveAccessService != nil {
		for _, member := range members {
			if err := s.effectiveAccessService.OnTeamMemberRemoved(workspaceID, teamID, member.UserID); err != nil {
				// Log error but don't fail the operation - cache can be rebuilt
				// TODO: Add proper logging
			}
		}
	}

	return nil
}
