package models

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// WorkspaceLinkInvite captures invitation state for link-based invites with encrypted key bundles.
// This supports the "user without account" invite flow per BOOK OF ENCRYPTION:
// - The inviter creates an invite_secret (random 32 bytes, NEVER sent to server)
// - All workspace keys are encrypted into a bundle using the invite_secret
// - The encrypted bundle is stored on the server along with a signature
// - The invitee receives the secret via URL fragment (e.g., #sk=...) which never hits the server
// - After registration, the invitee decrypts the bundle and creates self-shares
type WorkspaceLinkInvite struct {
	// ID is the client-generated UUID for the invite (for cryptographic binding in AD).
	ID          string `json:"id" gorm:"primaryKey;type:uuid"`
	WorkspaceID string `json:"workspace_id" gorm:"type:uuid;not null;index:idx_workspace_link_invites_workspace"`
	CreatedBy   string `json:"created_by" gorm:"type:uuid;not null"`

	// Role assigned to the user upon acceptance (default: member).
	Role WorkspaceMemberRole `json:"role" gorm:"type:text;not null;default:'member'"`

	// Crypto fields for encrypted key bundle.
	// These follow the BOOK OF ENCRYPTION spec for invite bundles.

	// WrappedWorkspaceKeysVersion is the protocol version (currently 1).
	WrappedWorkspaceKeysVersion int `json:"wrapped_workspace_keys_v" gorm:"not null;default:1"`

	// WrappedWorkspaceKeysNonce is the XChaCha20-Poly1305 nonce (48 hex chars = 24 bytes).
	WrappedWorkspaceKeysNonce string `json:"wrapped_workspace_keys_nonce" gorm:"type:text;not null"`

	// WrappedWorkspaceKeysCiphertext is the encrypted JSON bundle containing all workspace keys (base64).
	// Bundle structure: { v, workspaceId, inviteId, createdAt, keys: [{workspaceKeyId, generation, workspaceKey}] }
	WrappedWorkspaceKeysCiphertext string `json:"wrapped_workspace_keys_ciphertext" gorm:"type:text;not null"`

	// InviterSignPublicKey is the inviter's Ed25519 public key (64 hex chars = 32 bytes).
	// This is included in the invite URL so the invitee can verify the signature without trusting the server.
	InviterSignPublicKey string `json:"inviter_sign_public_key" gorm:"type:text;not null"`

	// InviteSignature is the Ed25519 signature over the invite data (base64).
	// Signature string format per BOOK OF ENCRYPTION:
	// "SHAPE-INVITE-V1\nworkspace_id=...\ninvite_id=...\nnonce=...\nciphertext=...\n..."
	InviteSignature string `json:"invite_signature" gorm:"type:text;not null"`

	// SignedAt is the client-provided timestamp that's included in the signature.
	// This MUST be stored and returned exactly as provided for signature verification.
	// Nullable for backwards compatibility with existing records.
	SignedAt string `json:"signed_at" gorm:"type:text"`

	// Expiration and lifecycle fields.
	ExpiresAt  time.Time  `json:"expires_at" gorm:"not null"`
	AcceptedAt *time.Time `json:"accepted_at"`
	AcceptedBy *string    `json:"accepted_by" gorm:"type:uuid"`
	RevokedAt  *time.Time `json:"revoked_at"`

	CreatedAt time.Time `json:"created_at" gorm:"autoCreateTime"`
	UpdatedAt time.Time `json:"updated_at" gorm:"autoUpdateTime"`

	Workspace Workspace `json:"-" gorm:"foreignKey:WorkspaceID"`
}

// WorkspaceLinkInviteCryptoFields contains the cryptographic fields for an invite.
// These are sent to/from the client as a nested object.
type WorkspaceLinkInviteCryptoFields struct {
	WrappedWorkspaceKeysVersion    int    `json:"wrapped_workspace_keys_v"`
	WrappedWorkspaceKeysNonce      string `json:"wrapped_workspace_keys_nonce"`
	WrappedWorkspaceKeysCiphertext string `json:"wrapped_workspace_keys_ciphertext"`
	InviterSignPublicKey           string `json:"inviter_sign_public_key"`
	InviteSignature                string `json:"invite_signature"`
	SignedAt                       string `json:"signed_at,omitempty"`
}

// WorkspaceLinkInviteResponse is the API response for a link invite.
type WorkspaceLinkInviteResponse struct {
	ID              string                          `json:"id"`
	WorkspaceID     string                          `json:"workspace_id"`
	WorkspaceName   string                          `json:"workspace_name,omitempty"`
	Role            WorkspaceMemberRole             `json:"role"`
	InviterUserID   string                          `json:"inviter_user_id"`
	InviterUserName string                          `json:"inviter_user_name,omitempty"`
	CryptoFields    WorkspaceLinkInviteCryptoFields `json:"crypto_fields"`
	ExpiresAt       time.Time                       `json:"expires_at"`
	CreatedAt       time.Time                       `json:"created_at"`
}

// ToResponse converts a WorkspaceLinkInvite to its API response form.
func (i *WorkspaceLinkInvite) ToResponse() *WorkspaceLinkInviteResponse {
	return &WorkspaceLinkInviteResponse{
		ID:            i.ID,
		WorkspaceID:   i.WorkspaceID,
		Role:          i.Role,
		InviterUserID: i.CreatedBy,
		CryptoFields: WorkspaceLinkInviteCryptoFields{
			WrappedWorkspaceKeysVersion:    i.WrappedWorkspaceKeysVersion,
			WrappedWorkspaceKeysNonce:      i.WrappedWorkspaceKeysNonce,
			WrappedWorkspaceKeysCiphertext: i.WrappedWorkspaceKeysCiphertext,
			InviterSignPublicKey:           i.InviterSignPublicKey,
			InviteSignature:                i.InviteSignature,
			SignedAt:                       i.SignedAt,
		},
		ExpiresAt: i.ExpiresAt,
		CreatedAt: i.CreatedAt,
	}
}

// ToResponseWithWorkspaceName creates a response with workspace name populated.
func (i *WorkspaceLinkInvite) ToResponseWithWorkspaceName(workspaceName string) *WorkspaceLinkInviteResponse {
	resp := i.ToResponse()
	resp.WorkspaceName = workspaceName
	return resp
}

// ToResponseWithWorkspaceAndInviterName creates a response with both workspace and inviter names populated.
func (i *WorkspaceLinkInvite) ToResponseWithWorkspaceAndInviterName(workspaceName string, inviterUserName string) *WorkspaceLinkInviteResponse {
	resp := i.ToResponseWithWorkspaceName(workspaceName)
	resp.InviterUserName = inviterUserName
	return resp
}

// WorkspaceLinkInviteService manages lifecycle for link-based workspace invitations with E2EE.
type WorkspaceLinkInviteService struct {
	db            *gorm.DB
	subscriptions WorkspaceSubscriptionServiceInterface
	defaultTTL    time.Duration
}

// WorkspaceLinkInviteConfig controls behaviour for link invites.
type WorkspaceLinkInviteConfig struct {
	DefaultTTL time.Duration
}

// CreateWorkspaceLinkInviteParams describes the attributes required to create a link invite.
type CreateWorkspaceLinkInviteParams struct {
	// ID is the client-generated UUID (for cryptographic binding).
	ID          string
	WorkspaceID string
	CreatedBy   string
	Role        WorkspaceMemberRole

	// Crypto fields from the client.
	WrappedWorkspaceKeysVersion    int
	WrappedWorkspaceKeysNonce      string
	WrappedWorkspaceKeysCiphertext string
	InviterSignPublicKey           string
	InviteSignature                string
	SignedAt                       string // Client-provided timestamp included in signature
}

var (
	// ErrLinkInviteNotFound indicates the link invite was not found.
	ErrLinkInviteNotFound = errors.New("link invite not found")
	// ErrLinkInviteExpired indicates the link invite has expired.
	ErrLinkInviteExpired = errors.New("link invite expired")
	// ErrLinkInviteRevoked indicates the link invite has been revoked.
	ErrLinkInviteRevoked = errors.New("link invite revoked")
	// ErrLinkInviteAlreadyAccepted indicates the link invite has already been accepted.
	ErrLinkInviteAlreadyAccepted = errors.New("link invite already accepted")
)

const (
	// defaultLinkInviteTTL is 48 hours per BOOK OF ENCRYPTION.
	defaultLinkInviteTTL = 48 * time.Hour
)

// NewWorkspaceLinkInviteService wires a service with sane defaults.
func NewWorkspaceLinkInviteService(db *gorm.DB, subscriptions WorkspaceSubscriptionServiceInterface, cfg WorkspaceLinkInviteConfig) *WorkspaceLinkInviteService {
	ttl := cfg.DefaultTTL
	if ttl <= 0 {
		ttl = defaultLinkInviteTTL
	}
	return &WorkspaceLinkInviteService{
		db:            db,
		subscriptions: subscriptions,
		defaultTTL:    ttl,
	}
}

// Create creates a new link invite with encrypted workspace key bundle.
func (s *WorkspaceLinkInviteService) Create(params CreateWorkspaceLinkInviteParams) (*WorkspaceLinkInvite, error) {
	// Validate required fields.
	if strings.TrimSpace(params.ID) == "" {
		return nil, fmt.Errorf("invite ID is required")
	}
	if strings.TrimSpace(params.WorkspaceID) == "" {
		return nil, fmt.Errorf("workspace_id is required")
	}
	if strings.TrimSpace(params.CreatedBy) == "" {
		return nil, fmt.Errorf("created_by is required")
	}

	// Validate crypto fields.
	if strings.TrimSpace(params.WrappedWorkspaceKeysNonce) == "" {
		return nil, fmt.Errorf("wrapped_workspace_keys_nonce is required")
	}
	if strings.TrimSpace(params.WrappedWorkspaceKeysCiphertext) == "" {
		return nil, fmt.Errorf("wrapped_workspace_keys_ciphertext is required")
	}
	if strings.TrimSpace(params.InviterSignPublicKey) == "" {
		return nil, fmt.Errorf("inviter_sign_public_key is required")
	}
	if strings.TrimSpace(params.InviteSignature) == "" {
		return nil, fmt.Errorf("invite_signature is required")
	}

	// Default role to member.
	role := params.Role
	if role == "" {
		role = WorkspaceMemberRoleMember
	}

	// Check billing constraints if subscription service is available.
	if s.subscriptions != nil {
		if err := s.subscriptions.EnsureWorkspaceWritable(params.WorkspaceID); err != nil {
			return nil, err
		}
		if err := s.subscriptions.EnsureSeatCapacityForInviteReservation(params.WorkspaceID, 1); err != nil {
			return nil, err
		}
	}

	now := time.Now().UTC()
	invite := &WorkspaceLinkInvite{
		ID:                             params.ID,
		WorkspaceID:                    params.WorkspaceID,
		CreatedBy:                      params.CreatedBy,
		Role:                           role,
		WrappedWorkspaceKeysVersion:    params.WrappedWorkspaceKeysVersion,
		WrappedWorkspaceKeysNonce:      params.WrappedWorkspaceKeysNonce,
		WrappedWorkspaceKeysCiphertext: params.WrappedWorkspaceKeysCiphertext,
		InviterSignPublicKey:           params.InviterSignPublicKey,
		InviteSignature:                params.InviteSignature,
		SignedAt:                       params.SignedAt,
		ExpiresAt:                      now.Add(s.defaultTTL),
	}

	if err := s.db.Create(invite).Error; err != nil {
		return nil, fmt.Errorf("create workspace link invite: %w", err)
	}

	return invite, nil
}

// GetByID retrieves a link invite by its ID.
// Returns the invite regardless of status (for status checking).
func (s *WorkspaceLinkInviteService) GetByID(inviteID string) (*WorkspaceLinkInvite, error) {
	if strings.TrimSpace(inviteID) == "" {
		return nil, ErrLinkInviteNotFound
	}

	// Validate UUID format.
	if _, err := uuid.Parse(inviteID); err != nil {
		return nil, ErrLinkInviteNotFound
	}

	var invite WorkspaceLinkInvite
	if err := s.db.Where("id = ?", inviteID).First(&invite).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrLinkInviteNotFound
		}
		return nil, err
	}

	return &invite, nil
}

// GetActiveByID retrieves a link invite by ID if it's active (not expired, revoked, or accepted).
func (s *WorkspaceLinkInviteService) GetActiveByID(inviteID string) (*WorkspaceLinkInvite, error) {
	invite, err := s.GetByID(inviteID)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	if invite.RevokedAt != nil {
		return nil, ErrLinkInviteRevoked
	}
	if invite.AcceptedAt != nil {
		return nil, ErrLinkInviteAlreadyAccepted
	}
	if invite.ExpiresAt.Before(now) {
		return nil, ErrLinkInviteExpired
	}

	return invite, nil
}

// GetActiveInvitesForWorkspace returns all active link invites for a workspace.
func (s *WorkspaceLinkInviteService) GetActiveInvitesForWorkspace(workspaceID string) ([]*WorkspaceLinkInvite, error) {
	if strings.TrimSpace(workspaceID) == "" {
		return nil, fmt.Errorf("workspace_id is required")
	}

	var invites []*WorkspaceLinkInvite
	err := s.db.
		Where("workspace_id = ? AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at > ?", workspaceID, time.Now().UTC()).
		Order("created_at DESC").
		Find(&invites).Error
	if err != nil {
		return nil, err
	}

	return invites, nil
}

// MarkAccepted records acceptance metadata for the invite.
func (s *WorkspaceLinkInviteService) MarkAccepted(inviteID string, acceptedBy string) error {
	if strings.TrimSpace(inviteID) == "" {
		return fmt.Errorf("invite_id is required")
	}
	if strings.TrimSpace(acceptedBy) == "" {
		return fmt.Errorf("accepted_by is required")
	}

	now := time.Now().UTC()
	result := s.db.Model(&WorkspaceLinkInvite{}).
		Where("id = ? AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at > ?", inviteID, now).
		Updates(map[string]any{
			"accepted_at": now,
			"accepted_by": acceptedBy,
			"updated_at":  now,
		})

	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrLinkInviteNotFound
	}

	return nil
}

// RevokeInvite marks an outstanding invite as revoked.
func (s *WorkspaceLinkInviteService) RevokeInvite(inviteID string) error {
	if strings.TrimSpace(inviteID) == "" {
		return fmt.Errorf("invite_id is required")
	}

	now := time.Now().UTC()
	result := s.db.Model(&WorkspaceLinkInvite{}).
		Where("id = ? AND accepted_at IS NULL AND revoked_at IS NULL", inviteID).
		Updates(map[string]any{
			"revoked_at": now,
			"updated_at": now,
		})

	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrLinkInviteNotFound
	}

	return nil
}

// DeleteExpiredInvites permanently removes all invites that have passed their expiration time.
// This is called by the scheduled cleanup job to keep the database clean and ensure
// expired invite data (including encrypted key bundles) is completely removed.
// Returns the number of invites deleted and any error encountered.
func (s *WorkspaceLinkInviteService) DeleteExpiredInvites() (int64, error) {
	now := time.Now().UTC()
	result := s.db.Where("expires_at < ?", now).Delete(&WorkspaceLinkInvite{})
	if result.Error != nil {
		return 0, fmt.Errorf("delete expired link invites: %w", result.Error)
	}
	return result.RowsAffected, nil
}

// Delete permanently removes a link invite by ID.
// This is called when an invite is accepted to ensure encrypted key bundles
// are not retained beyond their intended use.
func (s *WorkspaceLinkInviteService) Delete(inviteID string) error {
	if strings.TrimSpace(inviteID) == "" {
		return fmt.Errorf("invite_id is required")
	}

	result := s.db.Where("id = ?", inviteID).Delete(&WorkspaceLinkInvite{})
	if result.Error != nil {
		return fmt.Errorf("delete link invite: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return ErrLinkInviteNotFound
	}

	return nil
}
