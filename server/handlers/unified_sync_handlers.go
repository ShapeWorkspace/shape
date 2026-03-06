package handlers

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/gorilla/mux"

	"shape/middleware"
	"shape/models"
	"shape/services"
)

// UnifiedSyncHandlers provides a single sync endpoint for unified entities + entity blocks.
// It replaces the legacy per-model sync endpoints.
type UnifiedSyncHandlers struct {
	changeLogService  *services.ChangeLogService
	workspaceChecker  *services.WorkspaceChecker
	entityService     *services.EntityService
	entityBlockService *services.EntityBlockService
}

// NewUnifiedSyncHandlers constructs a sync handler for the unified entity model.
func NewUnifiedSyncHandlers(
	changeLogService *services.ChangeLogService,
	workspaceChecker *services.WorkspaceChecker,
	entityService *services.EntityService,
	entityBlockService *services.EntityBlockService,
) *UnifiedSyncHandlers {
	return &UnifiedSyncHandlers{
		changeLogService:  changeLogService,
		workspaceChecker:  workspaceChecker,
		entityService:     entityService,
		entityBlockService: entityBlockService,
	}
}

// UnifiedSyncChange represents a single change in the unified sync response.
type UnifiedSyncChange struct {
	Sequence  int64       `json:"sequence"`
	Operation string      `json:"operation"`
	EntityID  string      `json:"entityId"`
	EntityType string     `json:"entityType"`
	Entity    interface{} `json:"entity"`
}

// UnifiedSyncResponse is the response format for the unified sync endpoint.
type UnifiedSyncResponse struct {
	Changes      []UnifiedSyncChange `json:"changes"`
	NextSequence int64              `json:"nextSequence"`
	HasMore      bool               `json:"hasMore"`
}

// GetUnifiedChanges returns unified entity + block changes since the given sequence.
// GET /api/workspaces/{workspaceId}/sync?since=0&limit=100
func (h *UnifiedSyncHandlers) GetUnifiedChanges(w http.ResponseWriter, r *http.Request) {
	workspaceID, userID, ok := h.verifySyncAccess(w, r)
	if !ok {
		return
	}

	since, limit := parseSyncParams(r)

	result, err := h.changeLogService.GetAllChangesSince(r.Context(), workspaceID, since, limit)
	if err != nil {
		JSONErrorWithErr(w, "Failed to get changes", err, http.StatusInternalServerError)
		return
	}

	changes := make([]UnifiedSyncChange, 0, len(result.Entries))
	for _, entry := range result.Entries {
		entityType := string(entry.EntityType)

		if entityType == "block" {
			change, ok := h.buildBlockChange(entry, workspaceID, userID)
			if ok {
				changes = append(changes, change)
			}
			continue
		}

		if h.entityService != nil && !h.entityService.IsSupportedEntityType(entityType) {
			// Skip non-entity changes (e.g., workspace member changes) in unified sync.
			continue
		}

		change, ok := h.buildEntityChange(entry, workspaceID, userID, entityType)
		if ok {
			changes = append(changes, change)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(UnifiedSyncResponse{
		Changes:      changes,
		NextSequence: result.NextSequence,
		HasMore:      result.HasMore,
	})
}

// GetLatestSequence returns the most recent sequence number for the workspace.
// GET /api/workspaces/{workspaceId}/sync/sequence
func (h *UnifiedSyncHandlers) GetLatestSequence(w http.ResponseWriter, r *http.Request) {
	workspaceID, _, ok := h.verifySyncAccess(w, r)
	if !ok {
		return
	}

	latest, err := h.changeLogService.GetLatestSequence(r.Context(), workspaceID)
	if err != nil {
		JSONErrorWithErr(w, "Failed to get latest sequence", err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int64{"sequence": latest})
}

func (h *UnifiedSyncHandlers) buildEntityChange(
	entry models.ChangeLogEntry,
	workspaceID string,
	userID string,
	entityType string,
) (UnifiedSyncChange, bool) {
	change := UnifiedSyncChange{
		Sequence:   entry.Sequence,
		Operation: string(entry.Operation),
		EntityID:   entry.EntityID,
		EntityType: entityType,
		Entity:     nil,
	}

	if entry.Operation == models.ChangeLogOperationDelete {
		return change, true
	}

	entity, err := h.entityService.GetByIDInWorkspace(entry.EntityID, workspaceID)
	if err != nil || entity == nil {
		return UnifiedSyncChange{}, false
	}

	hasAccess, err := h.entityService.UserHasReadAccess(userID, entity)
	if err != nil || !hasAccess {
		return UnifiedSyncChange{}, false
	}

	response, err := entity.ToResponse()
	if err != nil {
		return UnifiedSyncChange{}, false
	}
	change.Entity = response
	return change, true
}

func (h *UnifiedSyncHandlers) buildBlockChange(
	entry models.ChangeLogEntry,
	workspaceID string,
	userID string,
) (UnifiedSyncChange, bool) {
	change := UnifiedSyncChange{
		Sequence:   entry.Sequence,
		Operation: string(entry.Operation),
		EntityID:   entry.EntityID,
		EntityType: "block",
		Entity:     nil,
	}

	if entry.Operation == models.ChangeLogOperationDelete {
		return change, true
	}

	block, err := h.entityBlockService.GetByID(entry.EntityID)
	if err != nil || block == nil {
		return UnifiedSyncChange{}, false
	}

	parentEntity, err := h.entityService.GetByIDInWorkspace(block.EntityID, workspaceID)
	if err != nil || parentEntity == nil {
		return UnifiedSyncChange{}, false
	}

	hasAccess, err := h.entityService.UserHasReadAccess(userID, parentEntity)
	if err != nil || !hasAccess {
		return UnifiedSyncChange{}, false
	}

	encodedData := base64.StdEncoding.EncodeToString(block.EncryptedData)
	change.Entity = block.ToResponse(encodedData)
	return change, true
}

func (h *UnifiedSyncHandlers) verifySyncAccess(w http.ResponseWriter, r *http.Request) (workspaceID string, userID string, ok bool) {
	workspaceID = mux.Vars(r)["workspaceId"]
	if strings.TrimSpace(workspaceID) == "" {
		JSONError(w, "Workspace ID is required", http.StatusBadRequest)
		return "", "", false
	}

	userID = middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return "", "", false
	}

	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserInWorkspace(userID, workspaceID) {
		JSONError(w, "Access denied: not a workspace member", http.StatusForbidden)
		return "", "", false
	}

	return workspaceID, userID, true
}

func parseSyncParams(r *http.Request) (since int64, limit int) {
	since = 0
	limit = 100

	rawSince := strings.TrimSpace(r.URL.Query().Get("since"))
	if rawSince != "" {
		if parsed, err := strconv.ParseInt(rawSince, 10, 64); err == nil && parsed >= 0 {
			since = parsed
		}
	}

	rawLimit := strings.TrimSpace(r.URL.Query().Get("limit"))
	if rawLimit != "" {
		if parsed, err := strconv.Atoi(rawLimit); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	return since, limit
}
