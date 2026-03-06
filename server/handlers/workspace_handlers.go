package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"shape/middleware"
	"shape/models"
	"shape/services"

	"github.com/gorilla/mux"
	"gorm.io/gorm"
)

// WorkspaceHandlers handles workspace CRUD operations.
type WorkspaceHandlers struct {
	workspaceService  *models.WorkspaceService
	subscriptions     *services.WorkspaceSubscriptionService
	workspaceChecker  *services.WorkspaceChecker
	workspaceMembers  *models.WorkspaceMemberService
	changeLogService  *services.ChangeLogService
	selfHostedEnabled bool
}

// InitialWorkspaceKeyRequest contains parameters for creating the initial workspace key
// and a self-share during workspace creation. This ensures workspaces always have
// a current_workspace_key_id set from creation.
type InitialWorkspaceKeyRequest struct {
	// ID is the client-generated UUID for the key (required for cryptographic binding).
	ID string `json:"id"`
	// Share contains the encrypted key share for the workspace creator.
	Share InitialWorkspaceKeyShareRequest `json:"share"`
}

// InitialWorkspaceKeyShareRequest contains the encrypted share for the creator.
type InitialWorkspaceKeyShareRequest struct {
	// ID is the client-generated UUID for the share.
	ID string `json:"id"`
	// SenderBoxPublicKey is the sender's X25519 public key (64 hex chars).
	SenderBoxPublicKey string `json:"sender_box_public_key"`
	// SenderSignPublicKey is the sender's Ed25519 public key (64 hex chars).
	SenderSignPublicKey string `json:"sender_sign_public_key"`
	// Nonce is the crypto_box nonce (48 hex chars / 24 bytes).
	Nonce string `json:"nonce"`
	// Ciphertext is the encrypted workspace key (base64).
	Ciphertext string `json:"ciphertext"`
	// ShareSignature is the Ed25519 signature (base64).
	ShareSignature string `json:"share_signature"`
}

type CreateWorkspaceRequest struct {
	// ID is the client-generated UUID for the workspace.
	// This is cryptographically bound in the initial key share signature.
	ID   string `json:"id"`
	Name string `json:"name"`
	// InitialKey contains parameters for creating the initial workspace key and share.
	// This is required to ensure workspaces always have a current_workspace_key_id.
	InitialKey InitialWorkspaceKeyRequest `json:"initial_key"`
}

type UpdateWorkspaceRequest struct {
	Name string `json:"name"`
}

// NewWorkspaceHandlers creates a new workspace handlers instance with required dependencies.
func NewWorkspaceHandlers(
	workspaceService *models.WorkspaceService,
	subscriptions *services.WorkspaceSubscriptionService,
	checker *services.WorkspaceChecker,
	workspaceMembers *models.WorkspaceMemberService,
	changeLogService *services.ChangeLogService,
	selfHostedEnabled bool,
) *WorkspaceHandlers {
	return &WorkspaceHandlers{
		workspaceService:  workspaceService,
		subscriptions:     subscriptions,
		workspaceChecker:  checker,
		workspaceMembers:  workspaceMembers,
		changeLogService:  changeLogService,
		selfHostedEnabled: selfHostedEnabled,
	}
}

// SetOnboardingSeeder exposes the workspace service hook so bootstrap logic can seed default content.
func (h *WorkspaceHandlers) SetOnboardingSeeder(seeder models.WorkspaceOnboardingSeeder) {
	if h.workspaceService == nil || seeder == nil {
		return
	}
	h.workspaceService.SetOnboardingSeeder(seeder)
}

// CreateWorkspace creates a new workspace for the authenticated user.
// Requires initial_key parameters to create the workspace with its first encryption key.
func (h *WorkspaceHandlers) CreateWorkspace(w http.ResponseWriter, r *http.Request) {
	var req CreateWorkspaceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Validate workspace ID - client-generated UUID for cryptographic binding
	req.ID = strings.TrimSpace(req.ID)
	if req.ID == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		JSONError(w, "Workspace name is required", http.StatusBadRequest)
		return
	}

	// Validate initial key parameters - required to ensure workspaces always have a key
	if strings.TrimSpace(req.InitialKey.ID) == "" {
		JSONError(w, "Initial key ID is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.InitialKey.Share.ID) == "" {
		JSONError(w, "Initial key share ID is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.InitialKey.Share.SenderBoxPublicKey) == "" {
		JSONError(w, "Initial key share sender_box_public_key is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.InitialKey.Share.SenderSignPublicKey) == "" {
		JSONError(w, "Initial key share sender_sign_public_key is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.InitialKey.Share.Nonce) == "" {
		JSONError(w, "Initial key share nonce is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.InitialKey.Share.Ciphertext) == "" {
		JSONError(w, "Initial key share ciphertext is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.InitialKey.Share.ShareSignature) == "" {
		JSONError(w, "Initial key share share_signature is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	// Build initial key params from request
	initialKeyParams := models.InitialWorkspaceKeyParams{
		KeyID: req.InitialKey.ID,
		Share: models.InitialWorkspaceKeyShareParams{
			ShareID:             req.InitialKey.Share.ID,
			SenderBoxPublicKey:  req.InitialKey.Share.SenderBoxPublicKey,
			SenderSignPublicKey: req.InitialKey.Share.SenderSignPublicKey,
			Nonce:               req.InitialKey.Share.Nonce,
			Ciphertext:          req.InitialKey.Share.Ciphertext,
			ShareSignature:      req.InitialKey.Share.ShareSignature,
		},
	}

	response, err := h.workspaceService.CreateWorkspace(req.ID, req.Name, userID, initialKeyParams)
	if err != nil {
		JSONError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if h.workspaceMembers != nil && h.changeLogService != nil && response != nil && response.Workspace != nil {
		if member, err := h.workspaceMembers.GetWorkspaceMember(userID, response.Workspace.ID, userID); err == nil {
			if _, appendErr := h.changeLogService.AppendChange(r.Context(), services.AppendChangeParams{
				WorkspaceID: response.Workspace.ID,
				EntityType:  models.ChangeLogEntityTypeWorkspaceMember,
				EntityID:    member.ID,
				Operation:   models.ChangeLogOperationCreate,
				ActorID:     userID,
			}); appendErr != nil {
				log.Printf("workspace create: failed to append membership change log workspace_id=%s err=%v", response.Workspace.ID, appendErr)
			}
		} else {
			log.Printf("workspace create: failed to load creator membership for change log workspace_id=%s err=%v", response.Workspace.ID, err)
		}
	}

	subscriptionPopulated := false

	// Self-hosted deployments bypass billing entirely with a durable subscription snapshot.
	if h.selfHostedEnabled && h.subscriptions != nil && response != nil && response.Workspace != nil {
		if snapshot, ensureErr := h.subscriptions.EnsureSelfHostedSubscription(response.Workspace.ID); ensureErr != nil {
			log.Printf("workspace self hosted subscription: ensure failed for %s: %v", response.Workspace.ID, ensureErr)
		} else if snapshot != nil {
			response.Subscription = snapshot
			response.Workspace.Subscription = snapshot
			subscriptionPopulated = true
		} else {
			log.Printf("workspace self hosted subscription: snapshot missing for %s", response.Workspace.ID)
		}
	}

	// Check for auto-activate test subscription flag from session.
	session, sessErr := middleware.GetSession(r)
	autoActivate := middleware.ConsumeAutoTestSubscriptionFlag(session)

	// Automatically provision the test subscription when the session flag is set.
	if !subscriptionPopulated && autoActivate && h.subscriptions != nil && response != nil && response.Workspace != nil {
		log.Printf("workspace auto subscription: attempting to create test subscription for %s", response.Workspace.ID)
		if snapshot, ensureErr := h.subscriptions.EnsureTestSubscription(response.Workspace.ID, 0); ensureErr == nil {
			if snapshot != nil {
				log.Printf("workspace auto subscription: test subscription created successfully for %s", response.Workspace.ID)
				response.Subscription = snapshot
				response.Workspace.Subscription = snapshot
				subscriptionPopulated = true
				// Always mark onboarding as complete for auto-activated test subscriptions.
				if err := h.workspaceService.SetOnboardingCompleted(response.Workspace.ID, true); err != nil {
					log.Printf("workspace auto subscription: failed to mark onboarding complete for %s: %v", response.Workspace.ID, err)
				} else {
					log.Printf("workspace auto subscription: successfully marked onboarding complete for %s", response.Workspace.ID)
					response.Workspace.OnboardingCompleted = true
				}
			} else {
				log.Printf("workspace auto subscription: snapshot is nil for %s", response.Workspace.ID)
			}
		} else {
			log.Printf("workspace auto subscription: ensure failed for %s: %v", response.Workspace.ID, ensureErr)
		}
	} else if !subscriptionPopulated {
		log.Printf("workspace auto subscription: skipped - autoActivate=%v, subscriptions=%v, response=%v, workspace=%v",
			autoActivate, h.subscriptions != nil, response != nil, response != nil && response.Workspace != nil)
	}

	// Persist session changes if auto-activate flag was consumed.
	if autoActivate && sessErr == nil {
		if err := middleware.SaveSession(session, r, w); err != nil {
			log.Printf("workspace auto subscription: failed to persist session changes: %v", err)
		}
	}

	// Fall back to fetching a subscription snapshot if one wasn't already populated.
	if !subscriptionPopulated && h.subscriptions != nil && response != nil && response.Workspace != nil {
		if snapshot, snapErr := h.subscriptions.Snapshot(response.Workspace.ID); snapErr == nil {
			response.Subscription = snapshot
			response.Workspace.Subscription = snapshot
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// GetWorkspacesWithMembership returns all workspaces the user is a member of.
func (h *WorkspaceHandlers) GetWorkspacesWithMembership(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	workspaces, err := h.workspaceService.GetWorkspacesWithMembership(userID)
	if err != nil {
		JSONError(w, "Failed to get workspaces", http.StatusInternalServerError)
		return
	}

	// Attach subscription snapshots to each workspace.
	if h.subscriptions != nil {
		for _, ws := range workspaces {
			snapshot, snapErr := h.subscriptions.Snapshot(ws.ID)
			if snapErr != nil {
				JSONErrorWithErr(w, "Failed to get workspace subscription", snapErr, http.StatusInternalServerError)
				return
			}
			ws.Subscription = snapshot
		}
	}

	json.NewEncoder(w).Encode(workspaces)
}

// CompleteOnboarding marks the workspace's onboarding process as finished.
func (h *WorkspaceHandlers) CompleteOnboarding(w http.ResponseWriter, r *http.Request) {
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

	// Only workspace admins can complete onboarding.
	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserWorkspaceAdmin(userID, workspaceID) {
		JSONError(w, "Only workspace admins can complete onboarding", http.StatusForbidden)
		return
	}

	if err := h.workspaceService.SetOnboardingCompleted(workspaceID, true); err != nil {
		JSONErrorWithErr(w, "Failed to update onboarding status", err, http.StatusInternalServerError)
		return
	}

	JSONResponse(w, map[string]bool{"onboarding_completed": true}, http.StatusOK)
}

// UpdateWorkspace renames a workspace (super admins only).
func (h *WorkspaceHandlers) UpdateWorkspace(w http.ResponseWriter, r *http.Request) {
	workspaceID := mux.Vars(r)["workspaceId"]
	if strings.TrimSpace(workspaceID) == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return
	}

	var req UpdateWorkspaceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		JSONError(w, "Workspace name is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	// Only super admins can rename workspaces.
	if h.workspaceChecker == nil || !h.workspaceChecker.IsUserWorkspaceSuperAdmin(userID, workspaceID) {
		JSONError(w, "Only workspace super admins can rename the workspace", http.StatusForbidden)
		return
	}

	workspace, err := h.workspaceService.RenameWorkspace(workspaceID, req.Name)
	if err != nil {
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			JSONError(w, "Workspace not found", http.StatusNotFound)
			return
		default:
			JSONErrorWithErr(w, "Failed to rename workspace", err, http.StatusInternalServerError)
			return
		}
	}

	response := models.WorkspaceResponse{
		ID:                  workspace.ID,
		UserID:              userID,
		Name:                workspace.Name,
		Subdomain:           workspace.Subdomain,
		OnboardingCompleted: workspace.OnboardingCompleted,
		ReadonlySince:       workspace.ReadonlySince,
		CreatedAt:           workspace.CreatedAt,
		UpdatedAt:           workspace.UpdatedAt,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// DeleteWorkspace deletes a workspace (super admins only).
func (h *WorkspaceHandlers) DeleteWorkspace(w http.ResponseWriter, r *http.Request) {
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

	// Only super admins can delete workspaces.
	if h.workspaceChecker == nil || !h.workspaceChecker.IsUserWorkspaceSuperAdmin(userID, workspaceID) {
		JSONError(w, "Only workspace super admins can delete the workspace", http.StatusForbidden)
		return
	}

	if err := h.workspaceService.DeleteWorkspace(workspaceID); err != nil {
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			JSONError(w, "Workspace not found", http.StatusNotFound)
			return
		default:
			JSONErrorWithErr(w, "Failed to delete workspace", err, http.StatusInternalServerError)
			return
		}
	}

	w.WriteHeader(http.StatusNoContent)
}
