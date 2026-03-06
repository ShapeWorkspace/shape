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

// UserInviteHandlers handles user-to-user workspace invitations for existing accounts.
// This is separate from InviteHandlers which handles shareable invite links and email invites.
type UserInviteHandlers struct {
	userInviteService      *models.WorkspaceUserInviteService
	workspaceMemberService *models.WorkspaceMemberService
	workspaceChecker       *services.WorkspaceChecker
	userService            *models.UserService
}

// NewUserInviteHandlers creates a new user invite handlers instance.
func NewUserInviteHandlers(
	userInviteService *models.WorkspaceUserInviteService,
	workspaceMemberService *models.WorkspaceMemberService,
	workspaceChecker *services.WorkspaceChecker,
	userService *models.UserService,
) *UserInviteHandlers {
	return &UserInviteHandlers{
		userInviteService:      userInviteService,
		workspaceMemberService: workspaceMemberService,
		workspaceChecker:       workspaceChecker,
		userService:            userService,
	}
}

// CreateUserInviteRequest is the request body for creating a user invite.
type CreateUserInviteRequest struct {
	InviteeEmail string                     `json:"invitee_email"`
	Role         models.WorkspaceMemberRole `json:"role"`
}

// CreateUserInvite creates a new invite for an existing user to join a workspace.
// The inviter must be a workspace admin.
//
// POST /api/workspaces/{workspaceId}/user-invites
func (h *UserInviteHandlers) CreateUserInvite(w http.ResponseWriter, r *http.Request) {
	workspaceID := mux.Vars(r)["workspaceId"]
	if strings.TrimSpace(workspaceID) == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	// Verify user is a workspace admin
	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserWorkspaceAdmin(userID, workspaceID) {
		JSONError(w, "Only workspace admins can invite users", http.StatusForbidden)
		return
	}

	var req CreateUserInviteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	inviteeEmail := strings.TrimSpace(strings.ToLower(req.InviteeEmail))
	if inviteeEmail == "" {
		JSONError(w, "invitee_email is required", http.StatusBadRequest)
		return
	}

	// Validate role.
	if req.Role != models.WorkspaceMemberRoleAdmin &&
		req.Role != models.WorkspaceMemberRoleMember &&
		req.Role != models.WorkspaceMemberRoleSuperAdmin {
		JSONError(w, "Invalid role. Must be 'admin', 'member', or 'super_admin'", http.StatusBadRequest)
		return
	}

	// Resolve the invitee by email to retrieve their public keys.
	invitee, err := h.userService.GetByEmail(inviteeEmail)
	if err != nil {
		JSONError(w, "User not found", http.StatusNotFound)
		return
	}
	inviteeUserID := invitee.ID

	// Verify invitee has E2EE setup (has public keys)
	if invitee.BoxPublicKey == "" || invitee.SignPublicKey == "" {
		JSONError(w, "User does not have encryption enabled", http.StatusBadRequest)
		return
	}

	invite, err := h.userInviteService.Create(models.CreateWorkspaceUserInviteParams{
		WorkspaceID:   workspaceID,
		InviteeUserID: inviteeUserID,
		InviterUserID: userID,
		Role:          req.Role,
	})
	if err != nil {
		switch {
		case errors.Is(err, models.ErrUserInviteAlreadyExists):
			JSONError(w, "User already has a pending invite to this workspace", http.StatusConflict)
			return
		case errors.Is(err, models.ErrUserAlreadyMember):
			JSONError(w, "User is already a member of this workspace", http.StatusConflict)
			return
		case errors.Is(err, models.ErrCannotInviteSelf):
			JSONError(w, "Cannot invite yourself", http.StatusBadRequest)
			return
		case errors.Is(err, models.ErrWorkspaceReadOnly):
			JSONError(w, "Workspace is in read-only mode", http.StatusForbidden)
			return
		case errors.Is(err, models.ErrSeatLimitReached):
			JSONError(w, "Not enough seats. Please upgrade your subscription.", http.StatusPaymentRequired)
			return
		default:
			JSONErrorWithErr(w, "Failed to create invite", err, http.StatusInternalServerError)
			return
		}
	}

	// Load user info for response
	invite.InviteeUser = *invitee

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(invite.ToResponse())
}

// GetWorkspaceUserInvites returns all pending user invites for a workspace (admin view).
//
// GET /api/workspaces/{workspaceId}/user-invites
func (h *UserInviteHandlers) GetWorkspaceUserInvites(w http.ResponseWriter, r *http.Request) {
	workspaceID := mux.Vars(r)["workspaceId"]
	if strings.TrimSpace(workspaceID) == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	// Verify user is a workspace admin
	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserWorkspaceAdmin(userID, workspaceID) {
		JSONError(w, "Only workspace admins can view pending invites", http.StatusForbidden)
		return
	}

	invites, err := h.userInviteService.GetPendingInvitesForWorkspace(workspaceID)
	if err != nil {
		JSONErrorWithErr(w, "Failed to get pending invites", err, http.StatusInternalServerError)
		return
	}

	// Convert to response format
	responses := make([]*models.WorkspaceUserInviteResponse, 0, len(invites))
	for _, invite := range invites {
		responses = append(responses, invite.ToResponse())
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"invites": responses,
	})
}

// RevokeUserInvite allows admins to cancel an outstanding user invite.
//
// DELETE /api/workspaces/{workspaceId}/user-invites/{inviteId}
func (h *UserInviteHandlers) RevokeUserInvite(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["workspaceId"]
	inviteID := vars["inviteId"]

	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(inviteID) == "" {
		JSONError(w, "Workspace ID and Invite ID are required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	// Verify user is a workspace admin
	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserWorkspaceAdmin(userID, workspaceID) {
		JSONError(w, "Only workspace admins can revoke invites", http.StatusForbidden)
		return
	}

	if err := h.userInviteService.Revoke(inviteID, workspaceID); err != nil {
		if errors.Is(err, models.ErrUserInviteNotFound) {
			JSONError(w, "Invite not found", http.StatusNotFound)
			return
		}
		JSONErrorWithErr(w, "Failed to revoke invite", err, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GetMyPendingInvites returns all pending invites for the current user.
// These are invites the user can accept to join workspaces.
//
// GET /api/user/invites
func (h *UserInviteHandlers) GetMyPendingInvites(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	invites, err := h.userInviteService.GetPendingInvitesForUser(userID)
	if err != nil {
		JSONErrorWithErr(w, "Failed to get pending invites", err, http.StatusInternalServerError)
		return
	}

	// Convert to response format
	responses := make([]*models.WorkspaceUserInviteResponse, 0, len(invites))
	for _, invite := range invites {
		responses = append(responses, invite.ToResponse())
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"invites": responses,
	})
}

// AcceptUserInvite allows a user to accept an invite and join a workspace.
//
// POST /api/user/invites/{inviteId}/accept
func (h *UserInviteHandlers) AcceptUserInvite(w http.ResponseWriter, r *http.Request) {
	inviteID := mux.Vars(r)["inviteId"]
	if strings.TrimSpace(inviteID) == "" {
		JSONError(w, "Invite ID is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	// Load pending invite first so membership is created before invite acceptance is finalized.
	invite, err := h.userInviteService.GetPendingInviteByID(inviteID)
	if err != nil {
		if errors.Is(err, models.ErrUserInviteNotFound) {
			JSONError(w, "Invite not found or already accepted", http.StatusNotFound)
			return
		}
		JSONErrorWithErr(w, "Failed to load invite", err, http.StatusInternalServerError)
		return
	}
	if invite.InviteeUserID != userID {
		JSONError(w, "Invite not found or already accepted", http.StatusNotFound)
		return
	}

	// Add user as a workspace member (the invite's inviter is used as the actor for permission checks)
	_, err = h.workspaceMemberService.EnsureWorkspaceMember(invite.InviterUserID, invite.WorkspaceID, userID, invite.Role)
	if err != nil {
		switch {
		case errors.Is(err, models.ErrSeatLimitReached):
			JSONError(w, "Invite cannot be accepted because the workspace has no available seats", http.StatusPaymentRequired)
		case errors.Is(err, models.ErrWorkspaceReadOnly):
			JSONError(w, "Workspace is in read-only mode", http.StatusForbidden)
		default:
			// Note: The invite is already marked as accepted, but member creation failed.
			// This is acceptable as the invite state is correct and the member can be added separately.
			JSONErrorWithErr(w, "Failed to add user to workspace", err, http.StatusInternalServerError)
		}
		return
	}

	_, err = h.userInviteService.Accept(inviteID, userID)
	if err != nil && !errors.Is(err, models.ErrUserInviteNotFound) {
		JSONErrorWithErr(w, "Failed to accept invite", err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message":      "Invite accepted successfully",
		"workspace_id": invite.WorkspaceID,
	})
}

// DeclineUserInvite allows a user to decline an invite.
//
// POST /api/user/invites/{inviteId}/decline
func (h *UserInviteHandlers) DeclineUserInvite(w http.ResponseWriter, r *http.Request) {
	inviteID := mux.Vars(r)["inviteId"]
	if strings.TrimSpace(inviteID) == "" {
		JSONError(w, "Invite ID is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	if err := h.userInviteService.Decline(inviteID, userID); err != nil {
		if errors.Is(err, models.ErrUserInviteNotFound) {
			JSONError(w, "Invite not found", http.StatusNotFound)
			return
		}
		JSONErrorWithErr(w, "Failed to decline invite", err, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
