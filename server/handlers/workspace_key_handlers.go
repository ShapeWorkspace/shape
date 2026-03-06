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
	"gorm.io/gorm"
)

// WorkspaceKeyHandlers handles workspace key CRUD operations for E2EE.
// Workspace keys are symmetric keys that encrypt entity keys. Each user
// receives an encrypted "share" of the workspace key, encrypted to their
// public key.
type WorkspaceKeyHandlers struct {
	keyService      *models.WorkspaceKeyService
	shareService    *models.WorkspaceKeyShareService
	workspaceChecker *services.WorkspaceChecker
}

// NewWorkspaceKeyHandlers creates a new workspace key handlers instance.
func NewWorkspaceKeyHandlers(
	keyService *models.WorkspaceKeyService,
	shareService *models.WorkspaceKeyShareService,
	checker *services.WorkspaceChecker,
) *WorkspaceKeyHandlers {
	return &WorkspaceKeyHandlers{
		keyService:      keyService,
		shareService:    shareService,
		workspaceChecker: checker,
	}
}

// CreateWorkspaceKeyRequest is the request body for creating a new workspace key.
type CreateWorkspaceKeyRequest struct {
	// ID is the client-generated UUID for the key (required for cryptographic binding).
	ID string `json:"id"`
}

// CreateWorkspaceKeyShareRequest is the request body for creating a key share.
type CreateWorkspaceKeyShareRequest struct {
	// ID is the client-generated UUID for the share.
	ID string `json:"id"`
	// RecipientUserID is the user who can decrypt this share.
	RecipientUserID string `json:"recipient_user_id"`
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

// GetWorkspaceKeys returns all workspace keys for a workspace with shares
// for the authenticated user. This is the primary endpoint clients call
// to get encrypted keys they can decrypt.
//
// GET /api/workspaces/{workspaceId}/keys
func (h *WorkspaceKeyHandlers) GetWorkspaceKeys(w http.ResponseWriter, r *http.Request) {
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

	// Verify user is a workspace member
	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserInWorkspace(userID, workspaceID) {
		JSONError(w, "Access denied: not a workspace member", http.StatusForbidden)
		return
	}

	keys, err := h.keyService.GetKeysWithSharesForUser(workspaceID, userID)
	if err != nil {
		JSONErrorWithErr(w, "Failed to get workspace keys", err, http.StatusInternalServerError)
		return
	}

	// Ensure we return an empty array instead of null
	if keys == nil {
		keys = make([]*models.WorkspaceKeyWithSharesResponse, 0)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"keys": keys,
	})
}

// CreateWorkspaceKey creates a new workspace key generation.
// Only admins can create new keys (for initial workspace setup or key rotation).
//
// POST /api/workspaces/{workspaceId}/keys
func (h *WorkspaceKeyHandlers) CreateWorkspaceKey(w http.ResponseWriter, r *http.Request) {
	workspaceID := mux.Vars(r)["workspaceId"]
	if strings.TrimSpace(workspaceID) == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return
	}

	var req CreateWorkspaceKeyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.ID) == "" {
		JSONError(w, "Key ID is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	// Verify user is a workspace member (allow any member to create first key, admin for subsequent)
	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserInWorkspace(userID, workspaceID) {
		JSONError(w, "Access denied: not a workspace member", http.StatusForbidden)
		return
	}

	key, err := h.keyService.Create(models.CreateKeyParams{
		ID:              req.ID,
		WorkspaceID:     workspaceID,
		CreatedByUserID: userID,
	})
	if err != nil {
		JSONErrorWithErr(w, "Failed to create workspace key", err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(key.ToResponse())
}

// CreateWorkspaceKeyShare creates a new share for a workspace key.
// This allows the sender to grant access to a workspace key to a recipient.
//
// POST /api/workspaces/{workspaceId}/keys/{keyId}/shares
func (h *WorkspaceKeyHandlers) CreateWorkspaceKeyShare(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["workspaceId"]
	keyID := vars["keyId"]

	if strings.TrimSpace(workspaceID) == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(keyID) == "" {
		JSONError(w, "Key ID is required", http.StatusBadRequest)
		return
	}

	var req CreateWorkspaceKeyShareRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	// Verify user is a workspace member
	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserInWorkspace(userID, workspaceID) {
		JSONError(w, "Access denied: not a workspace member", http.StatusForbidden)
		return
	}

	// Verify the key exists and belongs to this workspace
	key, err := h.keyService.GetByID(keyID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			JSONError(w, "Workspace key not found", http.StatusNotFound)
			return
		}
		JSONErrorWithErr(w, "Failed to verify workspace key", err, http.StatusInternalServerError)
		return
	}
	if key.WorkspaceID != workspaceID {
		JSONError(w, "Workspace key does not belong to this workspace", http.StatusForbidden)
		return
	}

	share, err := h.shareService.Create(models.CreateShareParams{
		ID:                  req.ID,
		WorkspaceID:         workspaceID,
		WorkspaceKeyID:      keyID,
		RecipientUserID:     req.RecipientUserID,
		SenderUserID:        userID,
		SenderBoxPublicKey:  req.SenderBoxPublicKey,
		SenderSignPublicKey: req.SenderSignPublicKey,
		Nonce:               req.Nonce,
		Ciphertext:          req.Ciphertext,
		ShareSignature:      req.ShareSignature,
	})
	if err != nil {
		JSONErrorWithErr(w, "Failed to create workspace key share", err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(share.ToResponse())
}

// GetWorkspaceKeySharesForKey returns all shares for a specific workspace key.
// Used by admins to see who has access to a key.
//
// GET /api/workspaces/{workspaceId}/keys/{keyId}/shares
func (h *WorkspaceKeyHandlers) GetWorkspaceKeySharesForKey(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["workspaceId"]
	keyID := vars["keyId"]

	if strings.TrimSpace(workspaceID) == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(keyID) == "" {
		JSONError(w, "Key ID is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	// Only admins can view all shares
	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserWorkspaceAdmin(userID, workspaceID) {
		JSONError(w, "Access denied: admin only", http.StatusForbidden)
		return
	}

	shares, err := h.shareService.GetSharesForKey(keyID)
	if err != nil {
		JSONErrorWithErr(w, "Failed to get shares", err, http.StatusInternalServerError)
		return
	}

	// Convert to response format
	responses := make([]*models.WorkspaceKeyShareResponse, len(shares))
	for i, share := range shares {
		responses[i] = share.ToResponse()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"shares": responses,
	})
}
