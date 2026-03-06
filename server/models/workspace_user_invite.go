package models

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// WorkspaceUserInvite represents an invitation to a workspace for a user who already has an account.
// Unlike WorkspaceEmailInvite (for non-registered users), this tracks invites for existing users.
// Per BOOK OF ENCRYPTION, the inviter creates key shares for the invitee at invite time.
type WorkspaceUserInvite struct {
	ID            string              `json:"id" gorm:"primaryKey;type:uuid"`
	WorkspaceID   string              `json:"workspace_id" gorm:"type:uuid;not null;index:idx_workspace_user_invites_workspace"`
	InviteeUserID string              `json:"invitee_user_id" gorm:"type:uuid;not null;index:idx_workspace_user_invites_invitee"`
	InviterUserID string              `json:"inviter_user_id" gorm:"type:uuid;not null"`
	Role          WorkspaceMemberRole `json:"role" gorm:"type:text;not null"`
	AcceptedAt    *time.Time          `json:"accepted_at"`
	RevokedAt     *time.Time          `json:"revoked_at"`
	CreatedAt     time.Time           `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt     time.Time           `json:"updated_at" gorm:"autoUpdateTime"`

	// Relations for eager loading
	Workspace   Workspace `json:"-" gorm:"foreignKey:WorkspaceID"`
	InviteeUser User      `json:"invitee_user,omitempty" gorm:"foreignKey:InviteeUserID"`
	InviterUser User      `json:"inviter_user,omitempty" gorm:"foreignKey:InviterUserID"`
}

// WorkspaceUserInviteResponse is the JSON response representation of a user invite.
type WorkspaceUserInviteResponse struct {
	ID                   string              `json:"id"`
	WorkspaceID          string              `json:"workspace_id"`
	WorkspaceName        string              `json:"workspace_name,omitempty"`
	InviteeUserID        string              `json:"invitee_user_id"`
	InviteeEmail         string              `json:"invitee_email,omitempty"`
	InviteeUserName      string              `json:"invitee_user_name,omitempty"`
	InviteeBoxPublicKey  string              `json:"invitee_box_public_key,omitempty"`
	InviteeSignPublicKey string              `json:"invitee_sign_public_key,omitempty"`
	InviterUserID        string              `json:"inviter_user_id"`
	InviterUserName      string              `json:"inviter_user_name,omitempty"`
	Role                 WorkspaceMemberRole `json:"role"`
	CreatedAt            time.Time           `json:"created_at"`
}

// ToResponse converts the model to a response DTO.
func (i *WorkspaceUserInvite) ToResponse() *WorkspaceUserInviteResponse {
	resp := &WorkspaceUserInviteResponse{
		ID:            i.ID,
		WorkspaceID:   i.WorkspaceID,
		InviteeUserID: i.InviteeUserID,
		InviterUserID: i.InviterUserID,
		Role:          i.Role,
		CreatedAt:     i.CreatedAt,
	}

	// Include workspace name if preloaded
	if i.Workspace.ID != "" {
		resp.WorkspaceName = i.Workspace.Name
	}

	// Include invitee info if preloaded
	if i.InviteeUser.ID != "" {
		resp.InviteeEmail = i.InviteeUser.Email
		resp.InviteeUserName = deriveUserDisplayNameFromEmail(i.InviteeUser.Email)
		resp.InviteeBoxPublicKey = i.InviteeUser.BoxPublicKey
		resp.InviteeSignPublicKey = i.InviteeUser.SignPublicKey
	}

	// Include inviter name if preloaded
	if i.InviterUser.ID != "" {
		resp.InviterUserName = deriveUserDisplayNameFromEmail(i.InviterUser.Email)
	}

	return resp
}

func deriveUserDisplayNameFromEmail(email string) string {
	trimmed := strings.TrimSpace(email)
	if trimmed == "" {
		return "there"
	}
	if idx := strings.Index(trimmed, "@"); idx > 0 {
		return trimmed[:idx]
	}
	return trimmed
}

// WorkspaceUserInviteService manages lifecycle for user-scoped workspace invitations.
type WorkspaceUserInviteService struct {
	db            *gorm.DB
	subscriptions WorkspaceSubscriptionServiceInterface
}

// NewWorkspaceUserInviteService creates a new service instance.
func NewWorkspaceUserInviteService(db *gorm.DB, subscriptions WorkspaceSubscriptionServiceInterface) *WorkspaceUserInviteService {
	return &WorkspaceUserInviteService{
		db:            db,
		subscriptions: subscriptions,
	}
}

// CreateWorkspaceUserInviteParams describes the attributes required to create an invite.
type CreateWorkspaceUserInviteParams struct {
	WorkspaceID   string
	InviteeUserID string
	InviterUserID string
	Role          WorkspaceMemberRole
}

var (
	// ErrUserInviteAlreadyExists indicates an active invite already exists for this user/workspace pair.
	ErrUserInviteAlreadyExists = errors.New("user already has a pending invite to this workspace")
	// ErrUserAlreadyMember indicates the user is already a member of the workspace.
	ErrUserAlreadyMember = errors.New("user is already a member of this workspace")
	// ErrCannotInviteSelf indicates a user tried to invite themselves.
	ErrCannotInviteSelf = errors.New("cannot invite yourself")
	// ErrUserInviteNotFound indicates the invite does not exist.
	ErrUserInviteNotFound = errors.New("invite not found")
)

// Create creates a new user invite for an existing user.
func (s *WorkspaceUserInviteService) Create(params CreateWorkspaceUserInviteParams) (*WorkspaceUserInvite, error) {
	// Validate inputs
	if strings.TrimSpace(params.WorkspaceID) == "" {
		return nil, fmt.Errorf("workspace_id is required")
	}
	if strings.TrimSpace(params.InviteeUserID) == "" {
		return nil, fmt.Errorf("invitee_user_id is required")
	}
	if strings.TrimSpace(params.InviterUserID) == "" {
		return nil, fmt.Errorf("inviter_user_id is required")
	}
	if params.InviteeUserID == params.InviterUserID {
		return nil, ErrCannotInviteSelf
	}
	if params.Role != WorkspaceMemberRoleAdmin && params.Role != WorkspaceMemberRoleMember && params.Role != WorkspaceMemberRoleSuperAdmin {
		return nil, fmt.Errorf("invalid role")
	}

	// Check billing constraints
	if s.subscriptions != nil {
		if err := s.subscriptions.EnsureWorkspaceWritable(params.WorkspaceID); err != nil {
			return nil, err
		}
		if err := s.subscriptions.EnsureSeatCapacityForInviteReservation(params.WorkspaceID, 1); err != nil {
			return nil, err
		}
	}

	var invite *WorkspaceUserInvite

	err := s.db.Transaction(func(tx *gorm.DB) error {
		// Check if user is already a member
		var memberCount int64
		if err := tx.Model(&WorkspaceMember{}).
			Where("workspace_id = ? AND user_id = ?", params.WorkspaceID, params.InviteeUserID).
			Count(&memberCount).Error; err != nil {
			return err
		}
		if memberCount > 0 {
			return ErrUserAlreadyMember
		}

		// Check for existing active invite
		var existingInvite WorkspaceUserInvite
		err := tx.Where("workspace_id = ? AND invitee_user_id = ? AND accepted_at IS NULL AND revoked_at IS NULL",
			params.WorkspaceID, params.InviteeUserID).
			First(&existingInvite).Error
		if err == nil {
			return ErrUserInviteAlreadyExists
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		// Create the invite
		invite = &WorkspaceUserInvite{
			ID:            uuid.New().String(),
			WorkspaceID:   params.WorkspaceID,
			InviteeUserID: params.InviteeUserID,
			InviterUserID: params.InviterUserID,
			Role:          params.Role,
		}

		if err := tx.Create(invite).Error; err != nil {
			return fmt.Errorf("create workspace user invite: %w", err)
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return invite, nil
}

// GetPendingInvitesForUser returns all pending invites for a user (invites they can accept).
func (s *WorkspaceUserInviteService) GetPendingInvitesForUser(userID string) ([]*WorkspaceUserInvite, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, fmt.Errorf("user_id is required")
	}

	var invites []*WorkspaceUserInvite
	err := s.db.
		Preload("Workspace").
		Preload("InviterUser").
		Where("invitee_user_id = ? AND accepted_at IS NULL AND revoked_at IS NULL", userID).
		Order("created_at DESC").
		Find(&invites).Error
	if err != nil {
		return nil, err
	}
	return invites, nil
}

// GetPendingInvitesForWorkspace returns all pending user invites for a workspace (for admin view).
func (s *WorkspaceUserInviteService) GetPendingInvitesForWorkspace(workspaceID string) ([]*WorkspaceUserInvite, error) {
	if strings.TrimSpace(workspaceID) == "" {
		return nil, fmt.Errorf("workspace_id is required")
	}

	var invites []*WorkspaceUserInvite
	err := s.db.
		Preload("InviteeUser").
		Preload("InviterUser").
		Where("workspace_id = ? AND accepted_at IS NULL AND revoked_at IS NULL", workspaceID).
		Order("created_at DESC").
		Find(&invites).Error
	if err != nil {
		return nil, err
	}
	return invites, nil
}

// GetPendingInviteByID returns a specific pending invite.
func (s *WorkspaceUserInviteService) GetPendingInviteByID(inviteID string) (*WorkspaceUserInvite, error) {
	if strings.TrimSpace(inviteID) == "" {
		return nil, fmt.Errorf("invite_id is required")
	}

	var invite WorkspaceUserInvite
	err := s.db.
		Preload("Workspace").
		Preload("InviterUser").
		Where("id = ? AND accepted_at IS NULL AND revoked_at IS NULL", inviteID).
		First(&invite).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrUserInviteNotFound
		}
		return nil, err
	}
	return &invite, nil
}

// Accept marks an invite as accepted. The caller is responsible for adding the user as a member.
func (s *WorkspaceUserInviteService) Accept(inviteID, userID string) (*WorkspaceUserInvite, error) {
	if strings.TrimSpace(inviteID) == "" || strings.TrimSpace(userID) == "" {
		return nil, fmt.Errorf("invite_id and user_id are required")
	}

	var invite WorkspaceUserInvite
	now := time.Now().UTC()

	err := s.db.Transaction(func(tx *gorm.DB) error {
		// Load the invite
		if err := tx.Where("id = ? AND invitee_user_id = ? AND accepted_at IS NULL AND revoked_at IS NULL",
			inviteID, userID).First(&invite).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrUserInviteNotFound
			}
			return err
		}

		// Mark as accepted
		invite.AcceptedAt = &now
		if err := tx.Save(&invite).Error; err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return &invite, nil
}

// Revoke marks an invite as revoked (cancelled by the inviter/admin).
func (s *WorkspaceUserInviteService) Revoke(inviteID, workspaceID string) error {
	if strings.TrimSpace(inviteID) == "" || strings.TrimSpace(workspaceID) == "" {
		return fmt.Errorf("invite_id and workspace_id are required")
	}

	now := time.Now().UTC()
	result := s.db.Model(&WorkspaceUserInvite{}).
		Where("id = ? AND workspace_id = ? AND accepted_at IS NULL AND revoked_at IS NULL", inviteID, workspaceID).
		Updates(map[string]any{
			"revoked_at": now,
			"updated_at": now,
		})

	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrUserInviteNotFound
	}
	return nil
}

// Decline allows the invitee to decline an invite (marks as revoked from their perspective).
func (s *WorkspaceUserInviteService) Decline(inviteID, userID string) error {
	if strings.TrimSpace(inviteID) == "" || strings.TrimSpace(userID) == "" {
		return fmt.Errorf("invite_id and user_id are required")
	}

	now := time.Now().UTC()
	result := s.db.Model(&WorkspaceUserInvite{}).
		Where("id = ? AND invitee_user_id = ? AND accepted_at IS NULL AND revoked_at IS NULL", inviteID, userID).
		Updates(map[string]any{
			"revoked_at": now,
			"updated_at": now,
		})

	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrUserInviteNotFound
	}
	return nil
}
