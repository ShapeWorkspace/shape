package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"shape/middleware"
	"shape/models"
	"shape/services"

	"github.com/gorilla/mux"
)

// EntityLinkHandlers handles entity link operations for unified entities.
type EntityLinkHandlers struct {
	entityLinkService *models.EntityLinkService
	workspaceChecker  *services.WorkspaceChecker
}

// NewEntityLinkHandlers creates a new entity link handlers instance.
func NewEntityLinkHandlers(
	entityLinkService *models.EntityLinkService,
	checker *services.WorkspaceChecker,
) *EntityLinkHandlers {
	return &EntityLinkHandlers{
		entityLinkService: entityLinkService,
		workspaceChecker:  checker,
	}
}

// GetEntityLinks returns all links for an entity (both outgoing and backlinks).
//
// GET /api/workspaces/{workspaceId}/entity-links/{entityId}?entity_type=paper
func (h *EntityLinkHandlers) GetEntityLinks(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["workspaceId"]
	entityID := vars["entityId"]

	entityType := r.URL.Query().Get("entity_type")

	if strings.TrimSpace(workspaceID) == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(entityID) == "" {
		JSONError(w, "Entity ID is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserInWorkspace(userID, workspaceID) {
		JSONError(w, "Access denied: not a workspace member", http.StatusForbidden)
		return
	}

	response, err := h.entityLinkService.GetEntityLinks(entityID, entityType)
	if err != nil {
		JSONError(w, "Failed to get entity links: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		JSONError(w, "Failed to encode response: "+err.Error(), http.StatusInternalServerError)
		return
	}
}

// SyncEntityLinks syncs all links for a source entity.
//
// POST /api/workspaces/{workspaceId}/entity-links/{entityId}/sync
func (h *EntityLinkHandlers) SyncEntityLinks(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["workspaceId"]
	entityID := vars["entityId"]

	if strings.TrimSpace(workspaceID) == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(entityID) == "" {
		JSONError(w, "Entity ID is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserInWorkspace(userID, workspaceID) {
		JSONError(w, "Access denied: not a workspace member", http.StatusForbidden)
		return
	}

	var req models.SyncEntityLinksRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(req.SourceEntityType) == "" {
		JSONError(w, "source_entity_type is required", http.StatusBadRequest)
		return
	}

	if err := h.entityLinkService.SyncLinks(
		workspaceID,
		entityID,
		req.SourceEntityType,
		userID,
		req.LinkedEntities,
	); err != nil {
		JSONError(w, "Failed to sync entity links: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
