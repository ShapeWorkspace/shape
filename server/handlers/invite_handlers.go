package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"shape/middleware"
	"shape/models"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"gorm.io/gorm"
)

// InviteHandlers handles workspace invite operations including creation and acceptance.
type InviteHandlers struct {
	inviteService          *models.InviteService
	emailInviteService     *models.WorkspaceEmailInviteService
	workspaceMemberService *models.WorkspaceMemberService
	workspaceService       *models.WorkspaceService
	userService            *models.UserService
}

// NewInviteHandlers creates a new invite handlers instance with required dependencies.
func NewInviteHandlers(
	inviteService *models.InviteService,
	emailInviteService *models.WorkspaceEmailInviteService,
	workspaceMemberService *models.WorkspaceMemberService,
	workspaceService *models.WorkspaceService,
	userService *models.UserService,
) *InviteHandlers {
	return &InviteHandlers{
		inviteService:          inviteService,
		emailInviteService:     emailInviteService,
		workspaceMemberService: workspaceMemberService,
		workspaceService:       workspaceService,
		userService:            userService,
	}
}

// GetInviteStatus returns metadata about an invite token so the client can display invite details.
// GET /api/invites/{token}
func (h *InviteHandlers) GetInviteStatus(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	token := strings.TrimSpace(vars["token"])

	if token == "" {
		JSONError(w, "Token is required", http.StatusBadRequest)
		return
	}

	// Workspace invite tokens are UUIDs; only hit this path when parsing succeeds.
	if _, err := uuid.Parse(token); err == nil {
		invite, err := h.inviteService.GetInviteByToken(token)
		if err != nil {
			JSONError(w, "Invite not found or expired", http.StatusNotFound)
			return
		}
		if invite.RevokedAt != nil || invite.AcceptedAt != nil || (invite.ExpiresAt != nil && invite.ExpiresAt.Before(time.Now())) {
			JSONError(w, "Invite not found or expired", http.StatusNotFound)
			return
		}
		workspaceName := h.lookupWorkspaceName(invite.WorkspaceID)

		JSONResponse(w, map[string]any{
			"workspace_id":   invite.WorkspaceID,
			"workspace_name": workspaceName,
			"role":           invite.Role,
			"type":           "workspace",
			"expires_at":     invite.ExpiresAt,
		}, http.StatusOK)
		return
	}

	// Try email invite token lookup.
	if h.emailInviteService != nil {
		invite, err := h.emailInviteService.GetInviteByToken(token)
		if err == nil {
			if invite.RevokedAt != nil || invite.AcceptedAt != nil || (invite.ExpiresAt.Before(time.Now())) {
				JSONError(w, "Invite not found or expired", http.StatusNotFound)
				return
			}

			workspaceName := h.lookupWorkspaceName(invite.WorkspaceID)

			JSONResponse(w, map[string]any{
				"workspace_id":   invite.WorkspaceID,
				"workspace_name": workspaceName,
				"role":           invite.Role,
				"email":          invite.Email,
				"type":           "email",
				"expires_at":     invite.ExpiresAt,
			}, http.StatusOK)
			return
		}
	}

	JSONError(w, "Invite not found or expired", http.StatusNotFound)
}

// CreateWorkspaceInvite creates a shareable invite link for a workspace.
// POST /api/workspaces/{workspaceId}/invites
func (h *InviteHandlers) CreateWorkspaceInvite(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["workspaceId"]

	if workspaceID == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	invite, err := h.inviteService.CreateWorkspaceInvite(models.CreateInviteParams{
		WorkspaceID: workspaceID,
		CreatedBy:   userID,
	})
	if err != nil {
		switch {
		case err.Error() == "forbidden":
			JSONError(w, "Only workspace admins can create invite links", http.StatusForbidden)
		case errors.Is(err, models.ErrWorkspaceReadOnly):
			JSONError(w, "Workspace is in read-only mode", http.StatusForbidden)
		case errors.Is(err, models.ErrSeatLimitReached):
			JSONError(w, "Not enough seats. Please upgrade your subscription.", http.StatusPaymentRequired)
		default:
			JSONErrorWithErr(w, "Failed to create invite", err, http.StatusInternalServerError)
		}
		return
	}

	json.NewEncoder(w).Encode(invite)
}

// AcceptInvite allows an authenticated user to join a workspace via an invite token.
// POST /api/invites/{token}/accept
func (h *InviteHandlers) AcceptInvite(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	token := vars["token"]

	if token == "" {
		JSONError(w, "Token is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	// Try workspace invite first (UUID tokens).
	if _, uuidErr := uuid.Parse(token); uuidErr == nil {
		if workspaceInvite, err := h.inviteService.GetInviteByToken(token); err == nil {
			h.acceptWorkspaceInvite(w, workspaceInvite, userID)
			return
		} else {
			switch {
			case errors.Is(err, models.ErrWorkspaceInviteNotFound):
				JSONError(w, "Invite not found or expired", http.StatusNotFound)
				return
			default:
				JSONErrorWithErr(w, "Failed to resolve invite", err, http.StatusInternalServerError)
				return
			}
		}
	}

	// Try email invite token.
	if h.emailInviteService != nil {
		if emailInvite, err := h.emailInviteService.GetInviteByToken(token); err == nil {
			h.acceptEmailInvite(w, emailInvite, userID)
			return
		}
	}

	JSONError(w, "Invite not found or expired", http.StatusNotFound)
}

// acceptWorkspaceInvite handles acceptance of workspace invite links.
func (h *InviteHandlers) acceptWorkspaceInvite(w http.ResponseWriter, invite *models.WorkspaceInvite, userID string) {
	currentUser, err := h.userService.GetByID(userID)
	if err != nil {
		JSONError(w, "User not found", http.StatusNotFound)
		return
	}

	if err := h.inviteService.MarkAccepted(invite.ID, currentUser.ID); err != nil {
		switch {
		case errors.Is(err, models.ErrWorkspaceInviteNotFound), errors.Is(err, models.ErrWorkspaceInviteExpired):
			JSONError(w, "Invite not found or expired", http.StatusNotFound)
		case errors.Is(err, models.ErrWorkspaceInviteRevoked), errors.Is(err, models.ErrWorkspaceInviteAlreadyAccepted):
			JSONError(w, "Invite not found or expired", http.StatusNotFound)
		default:
			JSONErrorWithErr(w, "Failed to accept invite", err, http.StatusInternalServerError)
		}
		return
	}

	// If user is already a member, just return success.
	if h.workspaceMemberService != nil && h.workspaceMemberService.IsUserInWorkspace(currentUser.ID, invite.WorkspaceID) {
		JSONResponse(w, map[string]string{"message": "Invite accepted"}, http.StatusOK)
		return
	}

	_, err = h.workspaceMemberService.AddMemberToWorkspace(invite.CreatedBy, invite.WorkspaceID, currentUser.Email, invite.Role)
	if err != nil {
		switch {
		case errors.Is(err, gorm.ErrDuplicatedKey):
			JSONResponse(w, map[string]string{"message": "Already a member or invite accepted"}, http.StatusOK)
		case err.Error() == "forbidden":
			_ = h.inviteService.ReopenAcceptedInvite(invite.ID, currentUser.ID)
			JSONError(w, "Invite cannot be accepted at this time", http.StatusForbidden)
		case errors.Is(err, models.ErrSeatLimitReached):
			_ = h.inviteService.ReopenAcceptedInvite(invite.ID, currentUser.ID)
			JSONError(w, "Invite cannot be accepted because the workspace has no available seats", http.StatusPaymentRequired)
		case errors.Is(err, models.ErrWorkspaceReadOnly):
			_ = h.inviteService.ReopenAcceptedInvite(invite.ID, currentUser.ID)
			JSONError(w, "Workspace is in read-only mode", http.StatusForbidden)
		default:
			_ = h.inviteService.ReopenAcceptedInvite(invite.ID, currentUser.ID)
			JSONErrorWithErr(w, "Failed to accept invite", err, http.StatusInternalServerError)
		}
		return
	}

	JSONResponse(w, map[string]string{"message": "Invite accepted"}, http.StatusOK)
}

// GetWorkspaceInvites returns active token invites for a workspace (admin only).
// GET /api/workspaces/{workspaceId}/invites
func (h *InviteHandlers) GetWorkspaceInvites(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := strings.TrimSpace(vars["workspaceId"])
	if workspaceID == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	if h.workspaceMemberService != nil && !h.workspaceMemberService.IsUserWorkspaceAdmin(userID, workspaceID) {
		JSONError(w, "Only workspace admins can view invite links", http.StatusForbidden)
		return
	}

	invites, err := h.inviteService.GetActiveInvitesForWorkspace(workspaceID)
	if err != nil {
		JSONErrorWithErr(w, "Failed to get invites", err, http.StatusInternalServerError)
		return
	}

	JSONResponse(w, map[string]any{"invites": invites}, http.StatusOK)
}

// RevokeWorkspaceInvite revokes an active token invite (admin only).
// DELETE /api/workspaces/{workspaceId}/invites/{inviteId}
func (h *InviteHandlers) RevokeWorkspaceInvite(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := strings.TrimSpace(vars["workspaceId"])
	inviteID := strings.TrimSpace(vars["inviteId"])
	if workspaceID == "" || inviteID == "" {
		JSONError(w, "Workspace ID and Invite ID are required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	if h.workspaceMemberService != nil && !h.workspaceMemberService.IsUserWorkspaceAdmin(userID, workspaceID) {
		JSONError(w, "Only workspace admins can revoke invite links", http.StatusForbidden)
		return
	}

	if err := h.inviteService.RevokeInvite(workspaceID, inviteID); err != nil {
		if errors.Is(err, models.ErrWorkspaceInviteNotFound) {
			JSONError(w, "Invite not found", http.StatusNotFound)
			return
		}
		JSONErrorWithErr(w, "Failed to revoke invite", err, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// lookupWorkspaceName retrieves the workspace name for display purposes.
func (h *InviteHandlers) lookupWorkspaceName(workspaceID string) string {
	if h.workspaceService == nil || strings.TrimSpace(workspaceID) == "" {
		return ""
	}
	ws, err := h.workspaceService.GetByID(workspaceID)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(ws.Name)
}

// acceptEmailInvite handles acceptance of email-based invites.
func (h *InviteHandlers) acceptEmailInvite(w http.ResponseWriter, invite *models.WorkspaceEmailInvite, userID string) {
	if invite == nil {
		JSONError(w, "Invite not found or expired", http.StatusNotFound)
		return
	}

	if invite.AcceptedAt != nil {
		JSONError(w, "Invite not found or expired", http.StatusNotFound)
		return
	}

	if invite.RevokedAt != nil {
		JSONError(w, "Invite has been revoked", http.StatusGone)
		return
	}

	if invite.ExpiresAt.Before(time.Now()) && invite.AcceptedAt == nil {
		JSONError(w, "Invite not found or expired", http.StatusNotFound)
		return
	}

	currentUser, err := h.userService.GetByID(userID)
	if err != nil {
		JSONError(w, "User not found", http.StatusNotFound)
		return
	}

	// If user is already a member, just mark invite as accepted.
	if h.workspaceMemberService != nil && h.workspaceMemberService.IsUserInWorkspace(currentUser.ID, invite.WorkspaceID) {
		if h.emailInviteService != nil {
			if err := h.emailInviteService.MarkAccepted(invite.ID, currentUser.ID); err != nil {
				JSONErrorWithErr(w, "Failed to mark invite accepted", err, http.StatusInternalServerError)
				return
			}
		}
		JSONResponse(w, map[string]string{"message": "Invite accepted"}, http.StatusOK)
		return
	}

	_, addErr := h.workspaceMemberService.AddMemberToWorkspace(invite.CreatedBy, invite.WorkspaceID, currentUser.Email, invite.Role)
	if addErr != nil && !errors.Is(addErr, gorm.ErrDuplicatedKey) {
		switch {
		case errors.Is(addErr, models.ErrSeatLimitReached):
			JSONError(w, "Invite cannot be accepted because the workspace has no available seats", http.StatusPaymentRequired)
		case errors.Is(addErr, models.ErrWorkspaceReadOnly):
			JSONError(w, "Workspace is in read-only mode", http.StatusForbidden)
		default:
			JSONErrorWithErr(w, "Failed to accept invite", addErr, http.StatusInternalServerError)
		}
		return
	}

	if h.emailInviteService != nil {
		if err := h.emailInviteService.MarkAccepted(invite.ID, currentUser.ID); err != nil {
			JSONErrorWithErr(w, "Failed to mark invite accepted", err, http.StatusInternalServerError)
			return
		}
	}

	JSONResponse(w, map[string]string{"message": "Invite accepted"}, http.StatusOK)
}
