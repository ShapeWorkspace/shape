package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"shape/middleware"
	"shape/models"
	"shape/services"

	"github.com/gorilla/mux"
)

// LinkInviteHandlers handles workspace link invite operations with E2EE key bundles.
// These invites support the "user without account" flow per BOOK OF ENCRYPTION.
type LinkInviteHandlers struct {
	linkInviteService      *models.WorkspaceLinkInviteService
	workspaceMemberService *models.WorkspaceMemberService
	workspaceService       *models.WorkspaceService
	workspaceChecker       *services.WorkspaceChecker
	keyShareService        *models.WorkspaceKeyShareService
	userService            *models.UserService
}

// NewLinkInviteHandlers creates a new link invite handlers instance with required dependencies.
func NewLinkInviteHandlers(
	linkInviteService *models.WorkspaceLinkInviteService,
	workspaceMemberService *models.WorkspaceMemberService,
	workspaceService *models.WorkspaceService,
	workspaceChecker *services.WorkspaceChecker,
	keyShareService *models.WorkspaceKeyShareService,
	userService *models.UserService,
) *LinkInviteHandlers {
	return &LinkInviteHandlers{
		linkInviteService:      linkInviteService,
		workspaceMemberService: workspaceMemberService,
		workspaceService:       workspaceService,
		workspaceChecker:       workspaceChecker,
		keyShareService:        keyShareService,
		userService:            userService,
	}
}

// CreateLinkInviteCryptoFields contains the cryptographic fields for creating a link invite.
type CreateLinkInviteCryptoFields struct {
	// ID is the client-generated UUID for the invite (for cryptographic binding in AD).
	ID string `json:"id"`
	// WrappedWorkspaceKeysVersion is the protocol version (currently 1).
	WrappedWorkspaceKeysVersion int `json:"wrapped_workspace_keys_v"`
	// WrappedWorkspaceKeysNonce is the XChaCha20-Poly1305 nonce (48 hex chars).
	WrappedWorkspaceKeysNonce string `json:"wrapped_workspace_keys_nonce"`
	// WrappedWorkspaceKeysCiphertext is the encrypted bundle (base64).
	WrappedWorkspaceKeysCiphertext string `json:"wrapped_workspace_keys_ciphertext"`
	// InviterSignPublicKey is the inviter's Ed25519 public key (64 hex chars).
	InviterSignPublicKey string `json:"inviter_sign_public_key"`
	// InviteSignature is the Ed25519 signature (base64).
	InviteSignature string `json:"invite_signature"`
	// CreatedAt is the client-provided timestamp (included in signature for verification).
	CreatedAt string `json:"created_at"`
}

// CreateLinkInviteRequest is the request body for creating a link invite.
type CreateLinkInviteRequest struct {
	CryptoFields CreateLinkInviteCryptoFields `json:"crypto_fields"`
}

// AcceptLinkInviteRequest is the request body for accepting a link invite.
// The client sends self-shares for all workspace keys after decrypting the bundle.
type AcceptLinkInviteRequest struct {
	// Shares contains the self-shares the user creates after decrypting the invite bundle.
	// Each share encrypts a workspace key to the user's own public key.
	Shares []CreateSelfShareRequest `json:"shares"`
}

// CreateSelfShareRequest contains the data for a self-share after invite acceptance.
type CreateSelfShareRequest struct {
	// ID is the client-generated UUID for the share.
	ID string `json:"id"`
	// WorkspaceKeyID identifies which workspace key this share is for.
	WorkspaceKeyID string `json:"workspace_key_id"`
	// SenderBoxPublicKey is the user's X25519 public key (self-share, so sender = recipient).
	SenderBoxPublicKey string `json:"sender_box_public_key"`
	// SenderSignPublicKey is the user's Ed25519 public key.
	SenderSignPublicKey string `json:"sender_sign_public_key"`
	// Nonce is the crypto_box nonce (48 hex chars).
	Nonce string `json:"nonce"`
	// Ciphertext is the encrypted workspace key (base64).
	Ciphertext string `json:"ciphertext"`
	// ShareSignature is the Ed25519 signature (base64).
	ShareSignature string `json:"share_signature"`
}

// CreateLinkInvite creates a new link invite with encrypted workspace key bundle.
// POST /api/workspaces/{workspaceId}/link-invites
func (h *LinkInviteHandlers) CreateLinkInvite(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["workspaceId"]

	if strings.TrimSpace(workspaceID) == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	// Only workspace admins can create invite links.
	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserWorkspaceAdmin(userID, workspaceID) {
		JSONError(w, "Only workspace admins can create invite links", http.StatusForbidden)
		return
	}

	var req CreateLinkInviteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Validate crypto fields.
	cf := req.CryptoFields
	if strings.TrimSpace(cf.ID) == "" {
		JSONError(w, "crypto_fields.id is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(cf.WrappedWorkspaceKeysNonce) == "" {
		JSONError(w, "crypto_fields.wrapped_workspace_keys_nonce is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(cf.WrappedWorkspaceKeysCiphertext) == "" {
		JSONError(w, "crypto_fields.wrapped_workspace_keys_ciphertext is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(cf.InviterSignPublicKey) == "" {
		JSONError(w, "crypto_fields.inviter_sign_public_key is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(cf.InviteSignature) == "" {
		JSONError(w, "crypto_fields.invite_signature is required", http.StatusBadRequest)
		return
	}

	invite, err := h.linkInviteService.Create(models.CreateWorkspaceLinkInviteParams{
		ID:                             cf.ID,
		WorkspaceID:                    workspaceID,
		CreatedBy:                      userID,
		Role:                           models.WorkspaceMemberRoleMember,
		WrappedWorkspaceKeysVersion:    cf.WrappedWorkspaceKeysVersion,
		WrappedWorkspaceKeysNonce:      cf.WrappedWorkspaceKeysNonce,
		WrappedWorkspaceKeysCiphertext: cf.WrappedWorkspaceKeysCiphertext,
		InviterSignPublicKey:           cf.InviterSignPublicKey,
		InviteSignature:                cf.InviteSignature,
		SignedAt:                       cf.CreatedAt,
	})

	if err != nil {
		switch {
		case errors.Is(err, models.ErrWorkspaceReadOnly):
			JSONError(w, "Workspace is in read-only mode", http.StatusForbidden)
		case errors.Is(err, models.ErrSeatLimitReached):
			JSONError(w, "Not enough seats. Please upgrade your subscription.", http.StatusPaymentRequired)
		default:
			JSONErrorWithErr(w, "Failed to create link invite", err, http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(invite.ToResponse())
}

// GetLinkInvite retrieves a link invite by ID (public endpoint for invite acceptance flow).
// GET /api/link-invites/{inviteId}
func (h *LinkInviteHandlers) GetLinkInvite(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	inviteID := strings.TrimSpace(vars["inviteId"])

	if inviteID == "" {
		JSONError(w, "Invite ID is required", http.StatusBadRequest)
		return
	}

	// Get the invite (check if active).
	invite, err := h.linkInviteService.GetActiveByID(inviteID)
	if err != nil {
		switch {
		case errors.Is(err, models.ErrLinkInviteNotFound):
			JSONError(w, "Invite not found", http.StatusNotFound)
		case errors.Is(err, models.ErrLinkInviteExpired):
			JSONError(w, "Invite has expired", http.StatusGone)
		case errors.Is(err, models.ErrLinkInviteRevoked):
			JSONError(w, "Invite has been revoked", http.StatusGone)
		case errors.Is(err, models.ErrLinkInviteAlreadyAccepted):
			JSONError(w, "Invite has already been accepted", http.StatusGone)
		default:
			JSONErrorWithErr(w, "Failed to get invite", err, http.StatusInternalServerError)
		}
		return
	}

	// Get workspace name for display.
	var workspaceName string
	if h.workspaceService != nil {
		ws, wsErr := h.workspaceService.GetByID(invite.WorkspaceID)
		if wsErr == nil {
			workspaceName = ws.Name
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(invite.ToResponseWithWorkspaceAndInviterName(workspaceName, h.resolveInviterUserNameByID(invite.CreatedBy)))
}

// AcceptLinkInvite accepts a link invite and creates workspace membership.
// The client provides self-shares for all workspace keys.
// POST /api/link-invites/{inviteId}/accept
func (h *LinkInviteHandlers) AcceptLinkInvite(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	inviteID := strings.TrimSpace(vars["inviteId"])

	if inviteID == "" {
		JSONError(w, "Invite ID is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	var req AcceptLinkInviteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Validate shares - at least one share is required (the current workspace key).
	if len(req.Shares) == 0 {
		JSONError(w, "At least one key share is required", http.StatusBadRequest)
		return
	}

	// Validate each share has required fields.
	for i, share := range req.Shares {
		if strings.TrimSpace(share.ID) == "" {
			JSONError(w, "shares["+string(rune('0'+i))+"].id is required", http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(share.WorkspaceKeyID) == "" {
			JSONError(w, "shares["+string(rune('0'+i))+"].workspace_key_id is required", http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(share.Nonce) == "" {
			JSONError(w, "shares["+string(rune('0'+i))+"].nonce is required", http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(share.Ciphertext) == "" {
			JSONError(w, "shares["+string(rune('0'+i))+"].ciphertext is required", http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(share.ShareSignature) == "" {
			JSONError(w, "shares["+string(rune('0'+i))+"].share_signature is required", http.StatusBadRequest)
			return
		}
	}

	// Get the invite.
	invite, err := h.linkInviteService.GetActiveByID(inviteID)
	if err != nil {
		switch {
		case errors.Is(err, models.ErrLinkInviteNotFound):
			JSONError(w, "Invite not found", http.StatusNotFound)
		case errors.Is(err, models.ErrLinkInviteExpired):
			JSONError(w, "Invite has expired", http.StatusGone)
		case errors.Is(err, models.ErrLinkInviteRevoked):
			JSONError(w, "Invite has been revoked", http.StatusGone)
		case errors.Is(err, models.ErrLinkInviteAlreadyAccepted):
			JSONError(w, "Invite has already been accepted", http.StatusGone)
		default:
			JSONErrorWithErr(w, "Failed to get invite", err, http.StatusInternalServerError)
		}
		return
	}

	// Create self-shares for each workspace key.
	// These are encrypted to the user's own public key after decrypting from the invite bundle.
	for _, share := range req.Shares {
		_, createErr := h.keyShareService.Create(models.CreateShareParams{
			ID:                  share.ID,
			WorkspaceID:         invite.WorkspaceID,
			WorkspaceKeyID:      share.WorkspaceKeyID,
			RecipientUserID:     userID,
			SenderUserID:        userID, // Self-share: sender = recipient
			SenderBoxPublicKey:  share.SenderBoxPublicKey,
			SenderSignPublicKey: share.SenderSignPublicKey,
			Nonce:               share.Nonce,
			Ciphertext:          share.Ciphertext,
			ShareSignature:      share.ShareSignature,
		})
		if createErr != nil {
			JSONErrorWithErr(w, "Failed to create key share", createErr, http.StatusInternalServerError)
			return
		}
	}

	// Add user as workspace member.
	_, memberErr := h.workspaceMemberService.AddMemberToWorkspaceByUserID(
		invite.CreatedBy,
		invite.WorkspaceID,
		userID,
		invite.Role,
	)
	if memberErr != nil {
		switch {
		case errors.Is(memberErr, models.ErrSeatLimitReached):
			JSONError(w, "Invite cannot be accepted because the workspace has no available seats", http.StatusPaymentRequired)
		case errors.Is(memberErr, models.ErrWorkspaceReadOnly):
			JSONError(w, "Workspace is in read-only mode", http.StatusForbidden)
		default:
			// If already a member, that's fine.
			if !strings.Contains(memberErr.Error(), "duplicate") {
				JSONErrorWithErr(w, "Failed to add member", memberErr, http.StatusInternalServerError)
				return
			}
		}
	}

	// Delete the invite now that it's been accepted.
	// We remove the invite entirely rather than marking it accepted to ensure
	// encrypted key bundles are not retained beyond their intended use.
	if deleteErr := h.linkInviteService.Delete(inviteID); deleteErr != nil {
		// Log but don't fail - user is already a member and the invite
		// will be cleaned up by the scheduled expiration job if needed.
	}

	JSONResponse(w, map[string]any{
		"message":      "Invite accepted",
		"workspace_id": invite.WorkspaceID,
	}, http.StatusOK)
}

// GetWorkspaceLinkInvites returns all active link invites for a workspace (admin only).
// GET /api/workspaces/{workspaceId}/link-invites
func (h *LinkInviteHandlers) GetWorkspaceLinkInvites(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["workspaceId"]

	if strings.TrimSpace(workspaceID) == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	// Only workspace admins can view link invites.
	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserWorkspaceAdmin(userID, workspaceID) {
		JSONError(w, "Only workspace admins can view invite links", http.StatusForbidden)
		return
	}

	invites, err := h.linkInviteService.GetActiveInvitesForWorkspace(workspaceID)
	if err != nil {
		JSONErrorWithErr(w, "Failed to get link invites", err, http.StatusInternalServerError)
		return
	}

	// Convert to response format.
	inviterUserNamesByID := h.resolveInviterUserNamesByID(invites)
	responses := make([]*models.WorkspaceLinkInviteResponse, len(invites))
	for i, invite := range invites {
		response := invite.ToResponse()
		response.InviterUserName = inviterUserNamesByID[invite.CreatedBy]
		responses[i] = response
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"invites": responses,
	})
}

// resolveInviterUserNameByID loads a single inviter name for display in invite UIs.
// The public invite endpoint should not fail just because the inviter record is missing.
func (h *LinkInviteHandlers) resolveInviterUserNameByID(inviterUserID string) string {
	if h.userService == nil || strings.TrimSpace(inviterUserID) == "" {
		return ""
	}

	user, err := h.userService.GetByID(inviterUserID)
	if err != nil {
		return ""
	}

	return deriveInviteeDisplayName(user.Email)
}

// resolveInviterUserNamesByID builds a map of inviter user IDs to names for batch responses.
func (h *LinkInviteHandlers) resolveInviterUserNamesByID(invites []*models.WorkspaceLinkInvite) map[string]string {
	inviterUserNamesByID := make(map[string]string)
	if h.userService == nil || len(invites) == 0 {
		return inviterUserNamesByID
	}

	inviterUserIDs := make([]string, 0, len(invites))
	seenInviterUserIDs := make(map[string]struct{})

	for _, invite := range invites {
		if strings.TrimSpace(invite.CreatedBy) == "" {
			continue
		}
		if _, alreadyTracked := seenInviterUserIDs[invite.CreatedBy]; alreadyTracked {
			continue
		}
		seenInviterUserIDs[invite.CreatedBy] = struct{}{}
		inviterUserIDs = append(inviterUserIDs, invite.CreatedBy)
	}

	if len(inviterUserIDs) == 0 {
		return inviterUserNamesByID
	}

	users, err := h.userService.GetByIDs(inviterUserIDs)
	if err != nil {
		return inviterUserNamesByID
	}

	for _, user := range users {
		inviterUserNamesByID[user.ID] = deriveInviteeDisplayName(user.Email)
	}

	return inviterUserNamesByID
}

// RevokeLinkInvite revokes an active link invite (admin only).
// DELETE /api/workspaces/{workspaceId}/link-invites/{inviteId}
func (h *LinkInviteHandlers) RevokeLinkInvite(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["workspaceId"]
	inviteID := vars["inviteId"]

	if strings.TrimSpace(workspaceID) == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(inviteID) == "" {
		JSONError(w, "Invite ID is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	// Only workspace admins can revoke invites.
	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserWorkspaceAdmin(userID, workspaceID) {
		JSONError(w, "Only workspace admins can revoke invite links", http.StatusForbidden)
		return
	}

	// Verify the invite belongs to this workspace.
	invite, err := h.linkInviteService.GetByID(inviteID)
	if err != nil {
		if errors.Is(err, models.ErrLinkInviteNotFound) {
			JSONError(w, "Invite not found", http.StatusNotFound)
			return
		}
		JSONErrorWithErr(w, "Failed to get invite", err, http.StatusInternalServerError)
		return
	}
	if invite.WorkspaceID != workspaceID {
		JSONError(w, "Invite does not belong to this workspace", http.StatusForbidden)
		return
	}

	if err := h.linkInviteService.RevokeInvite(inviteID); err != nil {
		if errors.Is(err, models.ErrLinkInviteNotFound) {
			JSONError(w, "Invite not found or already revoked", http.StatusNotFound)
			return
		}
		JSONErrorWithErr(w, "Failed to revoke invite", err, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
