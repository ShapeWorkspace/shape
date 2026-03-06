package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"shape/middleware"
	"shape/models"
	"shape/services"

	"github.com/gorilla/mux"
	"gorm.io/gorm"
)

// WorkspaceMembersHandlers handles workspace membership operations like adding, removing, and updating members.
type WorkspaceMembersHandlers struct {
	workspaceMemberService *models.WorkspaceMemberService
	userService            *models.UserService
	workspaceService       *models.WorkspaceService
	subscriptions          *services.WorkspaceSubscriptionService
	emailInviteService     *models.WorkspaceEmailInviteService
	email                  services.EmailService
}

// Request/Response structs for member operations.
type AddMemberRequest struct {
	Email string                     `json:"email"`
	Role  models.WorkspaceMemberRole `json:"role"`
}

type UpdateMemberRoleRequest struct {
	Role models.WorkspaceMemberRole `json:"role"`
}

type UpdateOwnProfileRequest struct {
	ChainRootKeyID    string `json:"chainRootKeyId"`
	WrappingKeyID     string `json:"wrappingKeyId"`
	WrappingKeyType   string `json:"wrappingKeyType"`
	EntityKeyNonce    string `json:"entityKeyNonce"`
	WrappedEntityKey  string `json:"wrappedEntityKey"`
	ContentNonce      string `json:"contentNonce"`
	ContentCiphertext string `json:"contentCiphertext"`
	ContentHash       string `json:"contentHash"`
}

type AddMemberResponse struct {
	Status string                        `json:"status"`
	Member *models.WorkspaceMember       `json:"member,omitempty"`
	Invite *WorkspaceEmailInviteResponse `json:"invite,omitempty"`
}

type WorkspaceEmailInviteResponse struct {
	ID          string                     `json:"id"`
	WorkspaceID string                     `json:"workspace_id"`
	Email       string                     `json:"email"`
	Role        models.WorkspaceMemberRole `json:"role"`
	ExpiresAt   time.Time                  `json:"expires_at"`
	CreatedAt   time.Time                  `json:"created_at"`
	CreatedBy   string                     `json:"created_by"`
}

const workspaceInviteEmailSendTimeout = 15 * time.Second

// NewWorkspaceMembersHandlers creates a new workspace members handlers instance.
func NewWorkspaceMembersHandlers(
	workspaceMemberService *models.WorkspaceMemberService,
	userService *models.UserService,
	workspaceService *models.WorkspaceService,
	subscriptions *services.WorkspaceSubscriptionService,
	emailInviteService *models.WorkspaceEmailInviteService,
	email services.EmailService,
) *WorkspaceMembersHandlers {
	return &WorkspaceMembersHandlers{
		workspaceMemberService: workspaceMemberService,
		userService:            userService,
		workspaceService:       workspaceService,
		subscriptions:          subscriptions,
		emailInviteService:     emailInviteService,
		email:                  email,
	}
}

// GetWorkspaceMembers returns all members of a workspace.
// GET /workspace/{workspaceId}/members
func (h *WorkspaceMembersHandlers) GetWorkspaceMembers(w http.ResponseWriter, r *http.Request) {
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

	members, err := h.workspaceMemberService.GetWorkspaceMembers(userID, workspaceID)
	if err != nil {
		JSONError(w, "Failed to get workspace members", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(members)
}

// GetWorkspaceMember returns a single member of a workspace.
// GET /workspace/{workspaceId}/members/{userId}
func (h *WorkspaceMembersHandlers) GetWorkspaceMember(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["workspaceId"]
	memberUserID := vars["userId"]

	if workspaceID == "" || memberUserID == "" {
		JSONError(w, "Workspace ID and User ID are required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	member, err := h.workspaceMemberService.GetWorkspaceMember(userID, workspaceID, memberUserID)
	if err != nil {
		JSONError(w, "Failed to get workspace member", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(member)
}

// GetWorkspaceMembersBatch returns multiple workspace members by user IDs.
// POST /workspace/{workspaceId}/members/batch
func (h *WorkspaceMembersHandlers) GetWorkspaceMembersBatch(w http.ResponseWriter, r *http.Request) {
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

	var requestBody struct {
		UserIDs []string `json:"user_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if len(requestBody.UserIDs) == 0 {
		JSONError(w, "User IDs are required", http.StatusBadRequest)
		return
	}

	members, err := h.workspaceMemberService.GetWorkspaceMembersBatch(userID, workspaceID, requestBody.UserIDs)
	if err != nil {
		JSONError(w, "Failed to get workspace members", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(members)
}

// AddMemberToWorkspace adds a user to a workspace (admin only).
// POST /workspace/{workspaceId}/members
func (h *WorkspaceMembersHandlers) AddMemberToWorkspace(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["workspaceId"]

	if workspaceID == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return
	}

	var req AddMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Validate required fields.
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" {
		JSONError(w, "Email is required", http.StatusBadRequest)
		return
	}

	// Validate role.
	if req.Role != models.WorkspaceMemberRoleAdmin &&
		req.Role != models.WorkspaceMemberRoleMember &&
		req.Role != models.WorkspaceMemberRoleSuperAdmin {
		JSONError(w, "Invalid role. Must be 'admin', 'member', or 'super_admin'", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	if h.subscriptions != nil {
		if err := h.subscriptions.EnsureSeatCapacityForInviteReservation(workspaceID, 1); err != nil {
			switch {
			case errors.Is(err, models.ErrWorkspaceReadOnly):
				JSONError(w, "Workspace is in read-only mode", http.StatusForbidden)
			case errors.Is(err, models.ErrSeatLimitReached):
				JSONError(w, "Not enough seats. Please upgrade your subscription.", http.StatusPaymentRequired)
			default:
				JSONErrorWithErr(w, "Failed to validate seat availability", err, http.StatusInternalServerError)
			}
			return
		}
	}

	member, err := h.workspaceMemberService.AddMemberToWorkspace(userID, workspaceID, req.Email, req.Role)
	if err == nil {
		// Send an invite email if the account already exists (best-effort, async).
		if h.email != nil && h.userService != nil && h.workspaceService != nil {
			go func(inviteeEmail string, workspaceIdentifier string, inviterIdentifier string) {
				invitedUser, uErr := h.userService.GetByEmail(inviteeEmail)
				if uErr != nil {
					return
				}
				inviter, invErr := h.userService.GetByID(inviterIdentifier)
				if invErr != nil {
					return
				}
				ws, wsErr := h.workspaceService.GetByID(workspaceIdentifier)
				if wsErr != nil {
					return
				}
				appURL := getEnvOr("APP_URL", "https://app.conquer.local")
				workspaceURL := strings.TrimRight(appURL, "/") + "/workspaces/" + workspaceIdentifier

				emailSendCtx, emailSendCancel := newWorkspaceInviteEmailSendContext()
				defer emailSendCancel()

				inviteeDisplayName := deriveInviteeDisplayName(invitedUser.Email)
				inviterDisplayName := deriveInviteeDisplayName(inviter.Email)
				if err := h.email.SendWorkspaceInviteEmail(emailSendCtx, invitedUser.Email, inviteeDisplayName, inviterDisplayName, ws.Name, workspaceURL); err != nil {
					log.Printf("workspace members: failed to send existing-user invite email workspace_id=%s invitee=%s err=%v", workspaceIdentifier, invitedUser.Email, err)
				}
			}(req.Email, workspaceID, userID)
		}

		JSONResponse(w, AddMemberResponse{Status: "member_created", Member: member}, http.StatusOK)
		return
	}

	switch {
	case err.Error() == "forbidden":
		JSONError(w, "Only workspace admins can add members", http.StatusForbidden)
		return
	case errors.Is(err, models.ErrWorkspaceReadOnly):
		JSONError(w, "Workspace is in read-only mode", http.StatusForbidden)
		return
	case errors.Is(err, models.ErrSeatLimitReached):
		JSONError(w, "Not enough seats. Please upgrade your subscription.", http.StatusPaymentRequired)
		return
	case errors.Is(err, gorm.ErrDuplicatedKey):
		JSONError(w, "User is already a member of this workspace", http.StatusConflict)
		return
	case errors.Is(err, gorm.ErrRecordNotFound):
		// User not found - create email invite instead.
		if h.emailInviteService == nil {
			JSONError(w, "User not found", http.StatusNotFound)
			return
		}
		result, inviteErr := h.emailInviteService.CreateOrRefresh(models.CreateWorkspaceEmailInviteParams{
			WorkspaceID: workspaceID,
			Email:       req.Email,
			Role:        req.Role,
			CreatedBy:   userID,
		})
		if inviteErr != nil {
			switch {
			case errors.Is(inviteErr, models.ErrWorkspaceReadOnly):
				JSONError(w, "Workspace is in read-only mode", http.StatusForbidden)
				return
			case errors.Is(inviteErr, models.ErrSeatLimitReached):
				JSONError(w, "Not enough seats. Please upgrade your subscription.", http.StatusPaymentRequired)
				return
			case errors.Is(inviteErr, models.ErrWorkspaceEmailInviteRevoked):
				JSONError(w, "Invite has been revoked", http.StatusConflict)
				return
			default:
				JSONErrorWithErr(w, "Failed to create invite", inviteErr, http.StatusInternalServerError)
				return
			}
		}

		if result != nil && result.Invite != nil {
			if h.email != nil && h.workspaceService != nil && result.ShouldSend && result.Token != "" {
				go h.dispatchEmailInvite(result.Token, result.Invite, req.Email, userID)
			}

			payload := &WorkspaceEmailInviteResponse{
				ID:          result.Invite.ID,
				WorkspaceID: result.Invite.WorkspaceID,
				Email:       result.Invite.Email,
				Role:        result.Invite.Role,
				ExpiresAt:   result.Invite.ExpiresAt,
				CreatedAt:   result.Invite.CreatedAt,
				CreatedBy:   result.Invite.CreatedBy,
			}
			JSONResponse(w, AddMemberResponse{Status: "invite_pending", Invite: payload}, http.StatusAccepted)
			return
		}

		JSONError(w, "Failed to create invite", http.StatusInternalServerError)
		return
	default:
		JSONErrorWithErr(w, "Failed to add member to workspace", err, http.StatusInternalServerError)
		return
	}
}

// dispatchEmailInvite sends the email invite asynchronously.
func (h *WorkspaceMembersHandlers) dispatchEmailInvite(token string, invite *models.WorkspaceEmailInvite, email string, inviterID string) {
	dispatchWorkspaceInviteEmail(h.email, h.workspaceService, h.userService, invite, token, email, inviterID)
}

// newWorkspaceInviteEmailSendContext returns a background context with a short timeout so background email sends are not
// cut off when the request-scoped context is canceled once the handler responds.
func newWorkspaceInviteEmailSendContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), workspaceInviteEmailSendTimeout)
}

// deriveInviteeDisplayName extracts a friendly display name from an email address.
func deriveInviteeDisplayName(email string) string {
	trimmed := strings.TrimSpace(email)
	if trimmed == "" {
		return "there"
	}
	if idx := strings.Index(trimmed, "@"); idx > 0 {
		return trimmed[:idx]
	}
	return trimmed
}

// GetPendingInvites surfaces all active email-based invites for the workspace (admin only).
func (h *WorkspaceMembersHandlers) GetPendingInvites(w http.ResponseWriter, r *http.Request) {
	if h.emailInviteService == nil {
		JSONResponse(w, map[string]any{"invites": []WorkspaceEmailInviteResponse{}}, http.StatusOK)
		return
	}

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

	if !h.workspaceMemberService.IsUserWorkspaceAdmin(userID, workspaceID) {
		JSONError(w, "Only workspace admins can view pending invites", http.StatusForbidden)
		return
	}

	invites, err := h.emailInviteService.GetActiveInvitesForWorkspace(workspaceID)
	if err != nil {
		JSONErrorWithErr(w, "Failed to load pending invites", err, http.StatusInternalServerError)
		return
	}

	response := make([]WorkspaceEmailInviteResponse, 0, len(invites))
	for _, invite := range invites {
		response = append(response, WorkspaceEmailInviteResponse{
			ID:          invite.ID,
			WorkspaceID: invite.WorkspaceID,
			Email:       invite.Email,
			Role:        invite.Role,
			ExpiresAt:   invite.ExpiresAt,
			CreatedAt:   invite.CreatedAt,
			CreatedBy:   invite.CreatedBy,
		})
	}

	JSONResponse(w, map[string]any{"invites": response}, http.StatusOK)
}

// RevokePendingInvite allows admins to cancel an outstanding email invite.
func (h *WorkspaceMembersHandlers) RevokePendingInvite(w http.ResponseWriter, r *http.Request) {
	if h.emailInviteService == nil {
		JSONError(w, "Pending invite management is not enabled", http.StatusNotImplemented)
		return
	}

	vars := mux.Vars(r)
	workspaceID := vars["workspaceId"]
	inviteID := vars["inviteId"]

	if workspaceID == "" || inviteID == "" {
		JSONError(w, "Workspace ID and Invite ID are required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	if !h.workspaceMemberService.IsUserWorkspaceAdmin(userID, workspaceID) {
		JSONError(w, "Only workspace admins can revoke invites", http.StatusForbidden)
		return
	}

	invite, err := h.emailInviteService.GetActiveInviteByID(workspaceID, inviteID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			JSONError(w, "Invite not found", http.StatusNotFound)
			return
		}
		JSONErrorWithErr(w, "Failed to locate invite", err, http.StatusInternalServerError)
		return
	}

	if err := h.emailInviteService.RevokeInvite(invite.ID, time.Now().UTC()); err != nil {
		JSONErrorWithErr(w, "Failed to revoke invite", err, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// RemoveMemberFromWorkspace removes a user from a workspace (admin only).
// DELETE /workspace/{workspaceId}/members/{userId}
func (h *WorkspaceMembersHandlers) RemoveMemberFromWorkspace(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["workspaceId"]
	memberUserID := vars["userId"]

	if workspaceID == "" || memberUserID == "" {
		JSONError(w, "Workspace ID and User ID are required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	err := h.workspaceMemberService.RemoveMemberFromWorkspace(userID, workspaceID, memberUserID)
	if err != nil {
		switch {
		case errors.Is(err, models.ErrWorkspaceReadOnly):
			JSONError(w, "Workspace is in read-only mode", http.StatusForbidden)
			return
		case errors.Is(err, gorm.ErrRecordNotFound):
			JSONError(w, "Access denied or member not found", http.StatusNotFound)
			return
		case errors.Is(err, gorm.ErrInvalidData):
			JSONError(w, "Cannot remove yourself from the workspace", http.StatusBadRequest)
			return
		default:
			JSONErrorWithErr(w, "Failed to remove member from workspace", err, http.StatusInternalServerError)
			return
		}
	}

	// Notifications are intentionally excluded from the v2 server surface.

	json.NewEncoder(w).Encode(map[string]string{"message": "Member removed from workspace successfully"})
}

// UpdateMemberRole changes a user's role in a workspace (admin only).
// PUT /workspace/{workspaceId}/members/{userId}
func (h *WorkspaceMembersHandlers) UpdateMemberRole(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["workspaceId"]
	memberUserID := vars["userId"]

	if workspaceID == "" || memberUserID == "" {
		JSONError(w, "Workspace ID and User ID are required", http.StatusBadRequest)
		return
	}

	var req UpdateMemberRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Validate role.
	if req.Role != models.WorkspaceMemberRoleAdmin &&
		req.Role != models.WorkspaceMemberRoleMember &&
		req.Role != models.WorkspaceMemberRoleSuperAdmin {
		JSONError(w, "Invalid role. Must be 'admin', 'member', or 'super_admin'", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	member, err := h.workspaceMemberService.ChangeUserRole(userID, workspaceID, memberUserID, req.Role)
	if err != nil {
		switch {
		case errors.Is(err, models.ErrWorkspaceReadOnly):
			JSONError(w, "Workspace is in read-only mode", http.StatusForbidden)
			return
		case errors.Is(err, gorm.ErrRecordNotFound):
			JSONError(w, "Access denied or member not found", http.StatusNotFound)
			return
		default:
			JSONErrorWithErr(w, "Failed to update member role", err, http.StatusInternalServerError)
			return
		}
	}

	json.NewEncoder(w).Encode(member)
}

// UpdateOwnProfile updates the authenticated user's encrypted profile for the workspace.
// PUT /workspace/{workspaceId}/members/me
func (h *WorkspaceMembersHandlers) UpdateOwnProfile(w http.ResponseWriter, r *http.Request) {
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

	var req UpdateOwnProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.ChainRootKeyID) == "" {
		JSONError(w, "chainRootKeyId is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.WrappingKeyID) == "" {
		JSONError(w, "wrappingKeyId is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.WrappingKeyType) == "" {
		JSONError(w, "wrappingKeyType is required", http.StatusBadRequest)
		return
	}
	if req.WrappingKeyType != "workspace" {
		JSONError(w, "wrappingKeyType must be 'workspace'", http.StatusBadRequest)
		return
	}
	if req.WrappingKeyID != req.ChainRootKeyID {
		JSONError(w, "wrappingKeyId must match chainRootKeyId for workspace profiles", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.EntityKeyNonce) == "" ||
		strings.TrimSpace(req.WrappedEntityKey) == "" ||
		strings.TrimSpace(req.ContentNonce) == "" ||
		strings.TrimSpace(req.ContentCiphertext) == "" ||
		strings.TrimSpace(req.ContentHash) == "" {
		JSONError(w, "All encryption fields are required", http.StatusBadRequest)
		return
	}

	updated, err := h.workspaceMemberService.UpdateMemberProfile(userID, workspaceID, models.UpdateWorkspaceMemberProfileParams{
		ChainRootKeyID:    req.ChainRootKeyID,
		WrappingKeyID:     req.WrappingKeyID,
		WrappingKeyType:   req.WrappingKeyType,
		EntityKeyNonce:    req.EntityKeyNonce,
		WrappedEntityKey:  req.WrappedEntityKey,
		ContentNonce:      req.ContentNonce,
		ContentCiphertext: req.ContentCiphertext,
		ContentHash:       req.ContentHash,
	})
	if err != nil {
		JSONError(w, "Failed to update workspace profile", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(updated)
}
