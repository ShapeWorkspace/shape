package models

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

// TeamPrivacyType defines whether a team is visible to everyone or only its members.
type TeamPrivacyType string

const (
	TeamPrivacyPublic  TeamPrivacyType = "public"
	TeamPrivacyPrivate TeamPrivacyType = "private"
)

// TeamType distinguishes system-managed teams (e.g. "everyone") from user-created ones.
type TeamType string

const (
	TeamTypeEveryone TeamType = "everyone"
	TeamTypeCustom   TeamType = "custom"
)

// EveryoneTeamName is the canonical display name for the auto-created Everyone team.
const EveryoneTeamName = "everyone"

// Team represents a group of workspace members that can be granted permissions collectively.
type Team struct {
	ID          string          `json:"id" gorm:"primaryKey;type:uuid"`
	WorkspaceID string          `json:"workspace_id" gorm:"type:uuid;not null;index:idx_teams_workspace_name,priority:1"`
	Name        string          `json:"name" gorm:"not null;index:idx_teams_workspace_name,priority:2"`
	Privacy     TeamPrivacyType `json:"privacy" gorm:"type:text;not null"`
	TeamType    TeamType        `json:"team_type" gorm:"type:text;not null;default:'custom'"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
	MemberCount int             `json:"member_count" gorm:"->;column:member_count"`
	IsMember    bool            `json:"is_member" gorm:"->;column:is_member"`
	Members     []TeamMember    `json:"members,omitempty" gorm:"foreignKey:TeamID;references:ID;constraint:OnDelete:CASCADE"`
}

// NormalizeTeamName trims and lowercases the provided team name.
func NormalizeTeamName(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

// ValidateTeam ensures required fields are present before persistence happens.
func (t *Team) ValidateTeam() error {
	if strings.TrimSpace(t.Name) == "" {
		return errors.New("team name is required")
	}
	if t.Privacy != TeamPrivacyPublic && t.Privacy != TeamPrivacyPrivate {
		return errors.New("invalid team privacy type")
	}
	return nil
}

// NewTeam builds a normalized team value using the provided parameters.
func NewTeam(workspaceID, name string, privacy TeamPrivacyType) *Team {
	return &Team{
		ID:          uuid.NewString(),
		WorkspaceID: workspaceID,
		Name:        NormalizeTeamName(name),
		Privacy:     privacy,
		TeamType:    TeamTypeCustom,
	}
}

// NewEveryoneTeam creates the special Everyone team for a workspace. This team is public
// and automatically includes all workspace members.
func NewEveryoneTeam(workspaceID string) *Team {
	return &Team{
		ID:          uuid.NewString(),
		WorkspaceID: workspaceID,
		Name:        EveryoneTeamName,
		Privacy:     TeamPrivacyPublic,
		TeamType:    TeamTypeEveryone,
	}
}

// IsEveryoneTeam returns true if the team is the auto-managed Everyone team.
func (t *Team) IsEveryoneTeam() bool {
	return t.TeamType == TeamTypeEveryone
}

// TeamMemberRole defines the privilege level of a member within a team.
type TeamMemberRole string

const (
	TeamMemberRoleOwner  TeamMemberRole = "owner"
	TeamMemberRoleMember TeamMemberRole = "member"
)

// TeamMember links a workspace user to a team.
type TeamMember struct {
	ID          string         `json:"id" gorm:"primaryKey;type:uuid"`
	TeamID      string         `json:"team_id" gorm:"type:uuid;not null;index:idx_team_members_team_user,priority:1"`
	WorkspaceID string         `json:"workspace_id" gorm:"type:uuid;not null;index:idx_team_members_workspace"`
	UserID      string         `json:"user_id" gorm:"type:uuid;not null;index:idx_team_members_team_user,priority:2"`
	Role        TeamMemberRole `json:"role" gorm:"type:text;not null;default:'member'"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	User        *User          `json:"user,omitempty" gorm:"foreignKey:UserID;references:ID"`
}

// TableName keeps the legacy naming consistent if callers rely on explicit table references.
func (TeamMember) TableName() string {
	return "team_members"
}
