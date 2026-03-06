package models

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// WorkspaceEmailInvite captures invitation state for email addresses that are not yet registered.
type WorkspaceEmailInvite struct {
	ID              string              `json:"id" gorm:"primaryKey;type:uuid"`
	WorkspaceID     string              `json:"workspace_id" gorm:"type:uuid;not null;index:idx_workspace_email_invites_unique_active,priority:1,where:accepted_at IS NULL AND revoked_at IS NULL"`
	Email           string              `json:"email" gorm:"type:text;not null;index:idx_workspace_email_invites_unique_active,priority:2,where:accepted_at IS NULL AND revoked_at IS NULL;index:idx_workspace_email_invites_email_lookup,priority:1,expression:lower(email)"`
	Role            WorkspaceMemberRole `json:"role" gorm:"type:text;not null"`
	CreatedBy       string              `json:"created_by" gorm:"type:uuid;not null"`
	TokenHash       []byte              `json:"-" gorm:"type:bytea;not null;index:idx_workspace_email_invites_token_hash"`
	TokenLastSentAt time.Time           `json:"token_last_sent_at" gorm:"not null"`
	ExpiresAt       time.Time           `json:"expires_at" gorm:"not null"`
	AcceptedAt      *time.Time          `json:"accepted_at" gorm:"index:idx_workspace_email_invites_email_lookup,priority:2"`
	AcceptedBy      *string             `json:"accepted_by" gorm:"type:uuid"`
	RevokedAt       *time.Time          `json:"revoked_at"`
	CreatedAt       time.Time           `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt       time.Time           `json:"updated_at" gorm:"autoUpdateTime"`

	Workspace Workspace `json:"-" gorm:"foreignKey:WorkspaceID"`
}

// WorkspaceEmailInviteConfig controls behaviour around invite expiry and resend cadence.
type WorkspaceEmailInviteConfig struct {
	DefaultTTL     time.Duration
	ResendCooldown time.Duration
}

// WorkspaceEmailInviteService manages lifecycle for email-scoped workspace invitations.
type WorkspaceEmailInviteService struct {
	db             *gorm.DB
	subscriptions  WorkspaceSubscriptionServiceInterface
	defaultTTL     time.Duration
	resendCooldown time.Duration
}

// CreateWorkspaceEmailInviteParams describes the attributes required to issue an invite.
type CreateWorkspaceEmailInviteParams struct {
	WorkspaceID string
	Email       string
	Role        WorkspaceMemberRole
	CreatedBy   string
}

// CreateWorkspaceEmailInviteResult summarises the outcome of CreateOrRefresh.
type CreateWorkspaceEmailInviteResult struct {
	Invite     *WorkspaceEmailInvite
	Token      string
	ShouldSend bool
	IsRefresh  bool
}

var (
	// ErrInviteTokenInvalid indicates the invite token is malformed or invalid.
	ErrInviteTokenInvalid = errors.New("invite token invalid")
	// ErrWorkspaceEmailInviteRevoked indicates the invite has been revoked.
	ErrWorkspaceEmailInviteRevoked = errors.New("invite revoked")
)

const (
	defaultInviteTTL     = 14 * 24 * time.Hour
	defaultResendBackoff = 15 * time.Minute
	tokenLengthBytes     = 32
)

// NewWorkspaceEmailInviteService wires a service with sane defaults.
func NewWorkspaceEmailInviteService(db *gorm.DB, subscriptions WorkspaceSubscriptionServiceInterface, cfg WorkspaceEmailInviteConfig) *WorkspaceEmailInviteService {
	ttl := cfg.DefaultTTL
	if ttl <= 0 {
		ttl = defaultInviteTTL
	}
	resend := cfg.ResendCooldown
	if resend <= 0 {
		resend = defaultResendBackoff
	}
	return &WorkspaceEmailInviteService{
		db:             db,
		subscriptions:  subscriptions,
		defaultTTL:     ttl,
		resendCooldown: resend,
	}
}

// CreateOrRefresh issues or refreshes an invite for the provided workspace/email pair.
func (s *WorkspaceEmailInviteService) CreateOrRefresh(params CreateWorkspaceEmailInviteParams) (*CreateWorkspaceEmailInviteResult, error) {
	email := strings.TrimSpace(strings.ToLower(params.Email))
	if email == "" {
		return nil, fmt.Errorf("email is required")
	}
	if params.WorkspaceID == "" || params.CreatedBy == "" {
		return nil, fmt.Errorf("workspace_id and created_by are required")
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

	now := time.Now().UTC()
	result := &CreateWorkspaceEmailInviteResult{}

	err := s.db.Transaction(func(tx *gorm.DB) error {
		var invite WorkspaceEmailInvite
		queryErr := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("workspace_id = ? AND email = ? AND accepted_at IS NULL AND revoked_at IS NULL", params.WorkspaceID, email).
			First(&invite).Error

		if errors.Is(queryErr, gorm.ErrRecordNotFound) {
			token, hash, err := generateInviteToken()
			if err != nil {
				return err
			}
			invite = WorkspaceEmailInvite{
				ID:              uuid.New().String(),
				WorkspaceID:     params.WorkspaceID,
				Email:           email,
				Role:            params.Role,
				CreatedBy:       params.CreatedBy,
				TokenHash:       hash,
				TokenLastSentAt: now,
				ExpiresAt:       now.Add(s.defaultTTL),
			}
			if err := tx.Create(&invite).Error; err != nil {
				return fmt.Errorf("create workspace email invite: %w", err)
			}
			result.Invite = &invite
			result.Token = token
			result.ShouldSend = true
			result.IsRefresh = false
			return nil
		}

		if queryErr != nil {
			return fmt.Errorf("load workspace email invite: %w", queryErr)
		}

		if invite.RevokedAt != nil {
			return ErrWorkspaceEmailInviteRevoked
		}

		shouldRotateToken := invite.ExpiresAt.Before(now) || now.Sub(invite.TokenLastSentAt) >= s.resendCooldown

		if shouldRotateToken {
			token, hash, err := generateInviteToken()
			if err != nil {
				return err
			}
			invite.TokenHash = hash
			invite.TokenLastSentAt = now
			invite.ExpiresAt = now.Add(s.defaultTTL)
			if err := tx.Model(&invite).Select("token_hash", "token_last_sent_at", "expires_at", "updated_at").
				Updates(map[string]any{
					"token_hash":         invite.TokenHash,
					"token_last_sent_at": invite.TokenLastSentAt,
					"expires_at":         invite.ExpiresAt,
					"updated_at":         now,
				}).Error; err != nil {
				return fmt.Errorf("refresh workspace email invite: %w", err)
			}
			result.Invite = &invite
			result.Token = token
			result.ShouldSend = true
			result.IsRefresh = true
			return nil
		}

		// Within the resend backoff window
		result.Invite = &invite
		result.Token = ""
		result.ShouldSend = false
		result.IsRefresh = true

		return nil
	})

	if err != nil {
		return nil, err
	}

	return result, nil
}

// GetInviteByToken returns the invite for the provided token string.
func (s *WorkspaceEmailInviteService) GetInviteByToken(token string) (*WorkspaceEmailInvite, error) {
	hash, err := hashTokenString(token)
	if err != nil {
		return nil, err
	}

	var invite WorkspaceEmailInvite
	if err := s.db.Where("token_hash = ?", hash).First(&invite).Error; err != nil {
		return nil, err
	}
	return &invite, nil
}

// GetActiveInvitesForEmail returns all invites awaiting acceptance for the given email.
func (s *WorkspaceEmailInviteService) GetActiveInvitesForEmail(email string) ([]*WorkspaceEmailInvite, error) {
	normalized := strings.TrimSpace(strings.ToLower(email))
	if normalized == "" {
		return []*WorkspaceEmailInvite{}, nil
	}

	var invites []*WorkspaceEmailInvite
	err := s.db.Where("email = ? AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at > ?", normalized, time.Now().UTC()).
		Find(&invites).Error
	if err != nil {
		return nil, err
	}
	return invites, nil
}

// GetActiveInvitesForWorkspace returns all active invites for the workspace.
func (s *WorkspaceEmailInviteService) GetActiveInvitesForWorkspace(workspaceID string) ([]*WorkspaceEmailInvite, error) {
	if strings.TrimSpace(workspaceID) == "" {
		return nil, fmt.Errorf("workspaceID is required")
	}

	var invites []*WorkspaceEmailInvite
	err := s.db.
		Where("workspace_id = ? AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at > ?", workspaceID, time.Now().UTC()).
		Order("created_at DESC").
		Find(&invites).Error
	if err != nil {
		return nil, err
	}
	return invites, nil
}

// GetActiveInviteByID loads a single invite scoped to a workspace.
func (s *WorkspaceEmailInviteService) GetActiveInviteByID(workspaceID, inviteID string) (*WorkspaceEmailInvite, error) {
	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(inviteID) == "" {
		return nil, fmt.Errorf("workspaceID and inviteID are required")
	}

	var invite WorkspaceEmailInvite
	err := s.db.
		Where(
			"id = ? AND workspace_id = ? AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at > ?",
			inviteID,
			workspaceID,
			time.Now().UTC(),
		).
		First(&invite).Error
	if err != nil {
		return nil, err
	}
	return &invite, nil
}

// MarkAccepted records acceptance metadata for the invite.
func (s *WorkspaceEmailInviteService) MarkAccepted(inviteID string, acceptedBy string) error {
	if inviteID == "" {
		return fmt.Errorf("inviteID is required")
	}
	now := time.Now().UTC()

	return s.db.Model(&WorkspaceEmailInvite{}).
		Where("id = ? AND revoked_at IS NULL AND (accepted_at IS NULL OR accepted_by = ?)", inviteID, acceptedBy).
		Updates(map[string]any{
			"accepted_at": now,
			"accepted_by": acceptedBy,
			"updated_at":  now,
		}).Error
}

// RevokeInvite marks an outstanding invite as revoked.
func (s *WorkspaceEmailInviteService) RevokeInvite(inviteID string, revokedAt time.Time) error {
	if inviteID == "" {
		return fmt.Errorf("inviteID is required")
	}
	return s.db.Model(&WorkspaceEmailInvite{}).
		Where("id = ? AND accepted_at IS NULL AND revoked_at IS NULL", inviteID).
		Updates(map[string]any{
			"revoked_at": revokedAt,
			"updated_at": revokedAt,
		}).Error
}

func generateInviteToken() (string, []byte, error) {
	raw := make([]byte, tokenLengthBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", nil, fmt.Errorf("generate invite token: %w", err)
	}
	token := hex.EncodeToString(raw)
	hash := sha256.Sum256([]byte(token))
	return token, hash[:], nil
}

func hashTokenString(token string) ([]byte, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return nil, ErrInviteTokenInvalid
	}
	decoded, err := hex.DecodeString(token)
	if err != nil || len(decoded) == 0 {
		return nil, ErrInviteTokenInvalid
	}
	hash := sha256.Sum256([]byte(token))
	return hash[:], nil
}
