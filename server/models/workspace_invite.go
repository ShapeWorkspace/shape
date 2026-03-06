package models

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

const workspaceInviteDefaultTTL = 30 * 24 * time.Hour

// WorkspaceInvite represents a token that can be used to join a workspace.
type WorkspaceInvite struct {
	ID          string              `json:"token" gorm:"primaryKey;type:uuid"`
	WorkspaceID string              `json:"workspace_id" gorm:"type:uuid;not null;index:idx_workspace_invites_active,priority:1,where:accepted_at IS NULL AND revoked_at IS NULL"`
	CreatedBy   string              `json:"created_by" gorm:"type:uuid;not null"`
	Role        WorkspaceMemberRole `json:"role" gorm:"not null"`
	ExpiresAt   *time.Time          `json:"expires_at" gorm:"index:idx_workspace_invites_active,priority:2,where:accepted_at IS NULL AND revoked_at IS NULL"`
	AcceptedAt  *time.Time          `json:"accepted_at"`
	AcceptedBy  *string             `json:"accepted_by" gorm:"type:uuid"`
	RevokedAt   *time.Time          `json:"revoked_at"`
	CreatedAt   time.Time           `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt   time.Time           `json:"updated_at" gorm:"autoUpdateTime"`
}

// InviteService provides methods for managing workspace invites.
type InviteService struct {
	db               *gorm.DB
	workspaceChecker WorkspaceCheckerInterface
	subscriptions    WorkspaceSubscriptionServiceInterface
}

// NewInviteService creates a new invite service instance.
func NewInviteService(db *gorm.DB, workspaceChecker WorkspaceCheckerInterface, subscriptions WorkspaceSubscriptionServiceInterface) *InviteService {
	return &InviteService{db: db, workspaceChecker: workspaceChecker, subscriptions: subscriptions}
}

// CreateInviteParams holds the parameters for creating a workspace invite.
type CreateInviteParams struct {
	WorkspaceID string
	CreatedBy   string
}

var (
	ErrWorkspaceInviteNotFound        = errors.New("workspace invite not found")
	ErrWorkspaceInviteExpired         = errors.New("workspace invite expired")
	ErrWorkspaceInviteRevoked         = errors.New("workspace invite revoked")
	ErrWorkspaceInviteAlreadyAccepted = errors.New("workspace invite already accepted")
)

// CreateWorkspaceInvite creates a new workspace invite token.
func (s *InviteService) CreateWorkspaceInvite(params CreateInviteParams) (*WorkspaceInvite, error) {
	// Only admins can create invites
	if !s.workspaceChecker.IsUserWorkspaceAdmin(params.CreatedBy, params.WorkspaceID) {
		return nil, errors.New("forbidden")
	}

	// Check billing constraints if subscriptions service is available
	if s.subscriptions != nil {
		if err := s.subscriptions.EnsureWorkspaceWritable(params.WorkspaceID); err != nil {
			return nil, err
		}
		if err := s.subscriptions.EnsureSeatCapacityForInviteReservation(params.WorkspaceID, 1); err != nil {
			return nil, err
		}
	}

	// Token invites are always short-lived and use a single server-defined TTL.
	expiresAt := time.Now().Add(workspaceInviteDefaultTTL)

	invite := &WorkspaceInvite{
		ID:          uuid.New().String(),
		WorkspaceID: params.WorkspaceID,
		CreatedBy:   params.CreatedBy,
		Role:        WorkspaceMemberRoleMember,
		ExpiresAt:   &expiresAt,
	}

	if err := s.db.Create(invite).Error; err != nil {
		return nil, err
	}

	return invite, nil
}

// GetInviteByToken retrieves an invite by its token regardless of status flags.
func (s *InviteService) GetInviteByToken(token string) (*WorkspaceInvite, error) {
	var invite WorkspaceInvite
	if err := s.db.Where("id = ?", token).First(&invite).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrWorkspaceInviteNotFound
		}
		return nil, err
	}

	return &invite, nil
}

// GetActiveInviteByToken retrieves an invite token that is still usable.
func (s *InviteService) GetActiveInviteByToken(token string) (*WorkspaceInvite, error) {
	invite, err := s.GetInviteByToken(token)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	if invite.RevokedAt != nil {
		return nil, ErrWorkspaceInviteRevoked
	}
	if invite.AcceptedAt != nil {
		return nil, ErrWorkspaceInviteAlreadyAccepted
	}
	if invite.ExpiresAt != nil && now.After(*invite.ExpiresAt) {
		return nil, ErrWorkspaceInviteExpired
	}

	return invite, nil
}

// GetActiveInvitesForWorkspace returns active workspace invites for admin management surfaces.
func (s *InviteService) GetActiveInvitesForWorkspace(workspaceID string) ([]*WorkspaceInvite, error) {
	now := time.Now().UTC()
	var invites []*WorkspaceInvite
	if err := s.db.
		Where("workspace_id = ? AND revoked_at IS NULL AND accepted_at IS NULL AND (expires_at IS NULL OR expires_at > ?)", workspaceID, now).
		Order("created_at DESC").
		Find(&invites).Error; err != nil {
		return nil, err
	}
	return invites, nil
}

// RevokeInvite marks an outstanding workspace invite token as revoked.
func (s *InviteService) RevokeInvite(workspaceID, inviteID string) error {
	now := time.Now().UTC()
	result := s.db.Model(&WorkspaceInvite{}).
		Where("id = ? AND workspace_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)", inviteID, workspaceID, now).
		Updates(map[string]any{
			"revoked_at": now,
			"updated_at": now,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrWorkspaceInviteNotFound
	}
	return nil
}

// MarkAccepted marks an invite token consumed by a user.
func (s *InviteService) MarkAccepted(inviteID, acceptedBy string) error {
	now := time.Now().UTC()
	result := s.db.Model(&WorkspaceInvite{}).
		Where("id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)", inviteID, now).
		Updates(map[string]any{
			"accepted_at": now,
			"accepted_by": acceptedBy,
			"updated_at":  now,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		invite, err := s.GetInviteByToken(inviteID)
		if err != nil {
			return err
		}
		switch {
		case invite.RevokedAt != nil:
			return ErrWorkspaceInviteRevoked
		case invite.AcceptedAt != nil:
			acceptedByValue := ""
			if invite.AcceptedBy != nil {
				acceptedByValue = strings.TrimSpace(*invite.AcceptedBy)
			}
			if acceptedByValue != "" && acceptedByValue == strings.TrimSpace(acceptedBy) {
				return nil
			}
			return ErrWorkspaceInviteAlreadyAccepted
		case invite.ExpiresAt != nil && now.After(*invite.ExpiresAt):
			return ErrWorkspaceInviteExpired
		default:
			return ErrWorkspaceInviteNotFound
		}
	}
	return nil
}

// ReopenAcceptedInvite resets acceptance for an invite consumed by the same user.
// This is used as best-effort compensation when member creation fails after token consumption.
func (s *InviteService) ReopenAcceptedInvite(inviteID, acceptedBy string) error {
	result := s.db.Model(&WorkspaceInvite{}).
		Where("id = ? AND accepted_by = ? AND revoked_at IS NULL", inviteID, acceptedBy).
		Updates(map[string]any{
			"accepted_at": nil,
			"accepted_by": nil,
			"updated_at":  time.Now().UTC(),
		})
	if result.Error != nil {
		return result.Error
	}
	return nil
}
