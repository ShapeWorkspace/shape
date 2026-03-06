package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/gorilla/mux"
	"gorm.io/gorm"

	"shape/middleware"
	"shape/models"
	"shape/services"
	"shape/usecase"
)

var (
	errEntityACLNotSupported   = errors.New("entity does not support acl")
	errEntityACLRootMisaligned = errors.New("entity acl root is misaligned")
)

type entityACLResolution struct {
	entity       *models.Entity
	aclRoot      *models.Entity
	resourceType models.ACLResourceType
	resourceID   string
}

// resolveEntityACLRoot loads the entity and resolves its ACL root resource.
// This always returns the ACL root even when the entity is a child, since ACL
// overrides are intentionally not supported in the unified entity model.
func (h *EntityHandlers) resolveEntityACLRoot(workspaceID string, entityID string) (*entityACLResolution, error) {
	if h.entityService == nil {
		return nil, errors.New("entity service is not configured")
	}

	entity, err := h.entityService.GetByIDInWorkspace(entityID, workspaceID)
	if err != nil {
		return nil, err
	}

	if entity.ACLFromID == nil || entity.ACLFromType == nil {
		return nil, errEntityACLNotSupported
	}

	resourceType, ok := h.entityService.ResolveACLResourceTypeForEntityType(*entity.ACLFromType)
	if !ok {
		return nil, fmt.Errorf("unsupported acl_from_type %q", *entity.ACLFromType)
	}

	aclRoot := entity
	if *entity.ACLFromID != entity.ID || *entity.ACLFromType != entity.EntityType {
		aclRoot, err = h.entityService.GetByIDInWorkspace(*entity.ACLFromID, workspaceID)
		if err != nil {
			return nil, err
		}
	}

	if aclRoot.EntityType != *entity.ACLFromType {
		return nil, errEntityACLRootMisaligned
	}
	if aclRoot.ACLFromID == nil || aclRoot.ACLFromType == nil ||
		*aclRoot.ACLFromID != aclRoot.ID || *aclRoot.ACLFromType != aclRoot.EntityType {
		return nil, errEntityACLRootMisaligned
	}

	return &entityACLResolution{
		entity:       entity,
		aclRoot:      aclRoot,
		resourceType: resourceType,
		resourceID:   *entity.ACLFromID,
	}, nil
}

// GetEntityACLEntries returns ACL entries for the ACL root of an entity.
//
// GET /api/workspaces/{workspaceId}/entities/{entityId}/acl
func (h *EntityHandlers) GetEntityACLEntries(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["workspaceId"]
	entityID := vars["entityId"]

	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(entityID) == "" {
		JSONError(w, "Workspace ID and Entity ID are required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	// Verify user is a workspace member before listing ACL entries.
	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserInWorkspace(userID, workspaceID) {
		JSONError(w, "Access denied: not a workspace member", http.StatusForbidden)
		return
	}

	resolution, err := h.resolveEntityACLRoot(workspaceID, entityID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			JSONError(w, "Entity not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, errEntityACLNotSupported) {
			JSONError(w, "Entity does not support ACL", http.StatusBadRequest)
			return
		}
		if errors.Is(err, errEntityACLRootMisaligned) {
			JSONError(w, "Entity ACL root is misconfigured", http.StatusConflict)
			return
		}
		JSONErrorWithErr(w, "Failed to resolve entity ACL root", err, http.StatusInternalServerError)
		return
	}

	// Check access against the entity's ACL root.
	hasAccess, err := h.entityService.UserHasReadAccess(userID, resolution.entity)
	if err != nil {
		JSONErrorWithErr(w, "Failed to check access", err, http.StatusInternalServerError)
		return
	}
	if !hasAccess {
		JSONError(w, "Access denied", http.StatusForbidden)
		return
	}

	entries, err := h.aclService.GetACLEntriesForResource(workspaceID, resolution.resourceType, resolution.resourceID)
	if err != nil {
		JSONErrorWithErr(w, "Failed to get ACL entries", err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"entries": entries,
	})
}

// CreateEntityACLEntry creates an ACL entry for the ACL root of an entity.
//
// POST /api/workspaces/{workspaceId}/entities/{entityId}/acl
func (h *EntityHandlers) CreateEntityACLEntry(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["workspaceId"]
	entityID := vars["entityId"]

	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(entityID) == "" {
		JSONError(w, "Workspace ID and Entity ID are required", http.StatusBadRequest)
		return
	}

	var req CreateACLEntryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if req.SubjectType == "" {
		JSONError(w, "subject_type is required", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.SubjectID) == "" {
		JSONError(w, "subject_id is required", http.StatusBadRequest)
		return
	}
	if req.Permission == "" {
		JSONError(w, "permission is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	// Verify user is a workspace member before allowing ACL updates.
	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserInWorkspace(userID, workspaceID) {
		JSONError(w, "Access denied: not a workspace member", http.StatusForbidden)
		return
	}

	resolution, err := h.resolveEntityACLRoot(workspaceID, entityID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			JSONError(w, "Entity not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, errEntityACLNotSupported) {
			JSONError(w, "Entity does not support ACL", http.StatusBadRequest)
			return
		}
		if errors.Is(err, errEntityACLRootMisaligned) {
			JSONError(w, "Entity ACL root is misconfigured", http.StatusConflict)
			return
		}
		JSONErrorWithErr(w, "Failed to resolve entity ACL root", err, http.StatusInternalServerError)
		return
	}

	// Check if user can manage ACL (creator or admin on the ACL root).
	canManage, err := h.aclService.CanUserManageACL(userID, resolution.resourceType, resolution.resourceID)
	if err != nil {
		JSONErrorWithErr(w, "Failed to check permissions", err, http.StatusInternalServerError)
		return
	}
	if !canManage && resolution.aclRoot.CreatorID != userID {
		JSONError(w, "Access denied: cannot manage ACL", http.StatusForbidden)
		return
	}

	entry, err := h.aclService.CreateACLEntry(services.CreateACLEntryParams{
		WorkspaceID:  workspaceID,
		ResourceType: resolution.resourceType,
		ResourceID:   resolution.resourceID,
		SubjectType:  req.SubjectType,
		SubjectID:    req.SubjectID,
		Permission:   req.Permission,
	})
	if err != nil {
		JSONErrorWithErr(w, "Failed to create ACL entry", err, http.StatusInternalServerError)
		return
	}

	h.broadcastEntityACLShare(resolution.aclRoot, workspaceID, userID, req.SubjectType, req.SubjectID)
	h.maybeCreateEntityACLShareNotification(r.Context(), resolution.aclRoot, workspaceID, userID, req.SubjectType, req.SubjectID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(services.ToACLEntryResponse(entry))
}

// UpdateEntityACLEntry updates an ACL entry for the ACL root of an entity.
//
// PUT /api/workspaces/{workspaceId}/entities/{entityId}/acl/{entryId}
func (h *EntityHandlers) UpdateEntityACLEntry(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["workspaceId"]
	entityID := vars["entityId"]
	entryID := vars["entryId"]

	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(entityID) == "" || strings.TrimSpace(entryID) == "" {
		JSONError(w, "Workspace ID, Entity ID, and Entry ID are required", http.StatusBadRequest)
		return
	}

	var req UpdateACLEntryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if req.Permission == "" {
		JSONError(w, "permission is required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	// Verify user is a workspace member before allowing ACL updates.
	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserInWorkspace(userID, workspaceID) {
		JSONError(w, "Access denied: not a workspace member", http.StatusForbidden)
		return
	}

	resolution, err := h.resolveEntityACLRoot(workspaceID, entityID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			JSONError(w, "Entity not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, errEntityACLNotSupported) {
			JSONError(w, "Entity does not support ACL", http.StatusBadRequest)
			return
		}
		if errors.Is(err, errEntityACLRootMisaligned) {
			JSONError(w, "Entity ACL root is misconfigured", http.StatusConflict)
			return
		}
		JSONErrorWithErr(w, "Failed to resolve entity ACL root", err, http.StatusInternalServerError)
		return
	}

	existingEntry, err := h.aclService.GetACLEntryByID(entryID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			JSONError(w, "ACL entry not found", http.StatusNotFound)
			return
		}
		JSONErrorWithErr(w, "Failed to get ACL entry", err, http.StatusInternalServerError)
		return
	}
	if existingEntry.ResourceID != resolution.resourceID || existingEntry.ResourceType != resolution.resourceType {
		JSONError(w, "ACL entry not found for this entity", http.StatusNotFound)
		return
	}

	// Check if user can manage ACL (creator or admin on the ACL root).
	canManage, err := h.aclService.CanUserManageACL(userID, resolution.resourceType, resolution.resourceID)
	if err != nil {
		JSONErrorWithErr(w, "Failed to check permissions", err, http.StatusInternalServerError)
		return
	}
	if !canManage && resolution.aclRoot.CreatorID != userID {
		JSONError(w, "Access denied: cannot manage ACL", http.StatusForbidden)
		return
	}

	entry, err := h.aclService.UpdateACLEntry(entryID, req.Permission)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			JSONError(w, "ACL entry not found", http.StatusNotFound)
			return
		}
		JSONErrorWithErr(w, "Failed to update ACL entry", err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(services.ToACLEntryResponse(entry))
}

// DeleteEntityACLEntry deletes an ACL entry for the ACL root of an entity.
//
// DELETE /api/workspaces/{workspaceId}/entities/{entityId}/acl/{entryId}
func (h *EntityHandlers) DeleteEntityACLEntry(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["workspaceId"]
	entityID := vars["entityId"]
	entryID := vars["entryId"]

	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(entityID) == "" || strings.TrimSpace(entryID) == "" {
		JSONError(w, "Workspace ID, Entity ID, and Entry ID are required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	// Verify user is a workspace member before allowing ACL updates.
	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserInWorkspace(userID, workspaceID) {
		JSONError(w, "Access denied: not a workspace member", http.StatusForbidden)
		return
	}

	resolution, err := h.resolveEntityACLRoot(workspaceID, entityID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			JSONError(w, "Entity not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, errEntityACLNotSupported) {
			JSONError(w, "Entity does not support ACL", http.StatusBadRequest)
			return
		}
		if errors.Is(err, errEntityACLRootMisaligned) {
			JSONError(w, "Entity ACL root is misconfigured", http.StatusConflict)
			return
		}
		JSONErrorWithErr(w, "Failed to resolve entity ACL root", err, http.StatusInternalServerError)
		return
	}

	existingEntry, err := h.aclService.GetACLEntryByID(entryID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			JSONError(w, "ACL entry not found", http.StatusNotFound)
			return
		}
		JSONErrorWithErr(w, "Failed to get ACL entry", err, http.StatusInternalServerError)
		return
	}
	if existingEntry.ResourceID != resolution.resourceID || existingEntry.ResourceType != resolution.resourceType {
		JSONError(w, "ACL entry not found for this entity", http.StatusNotFound)
		return
	}

	// Check if user can manage ACL (creator or admin on the ACL root).
	canManage, err := h.aclService.CanUserManageACL(userID, resolution.resourceType, resolution.resourceID)
	if err != nil {
		JSONErrorWithErr(w, "Failed to check permissions", err, http.StatusInternalServerError)
		return
	}
	if !canManage && resolution.aclRoot.CreatorID != userID {
		JSONError(w, "Access denied: cannot manage ACL", http.StatusForbidden)
		return
	}

	if err := h.aclService.DeleteACLEntry(entryID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			JSONError(w, "ACL entry not found", http.StatusNotFound)
			return
		}
		JSONErrorWithErr(w, "Failed to delete ACL entry", err, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GetEntityACLMemberCount returns the member count for the ACL root of an entity.
//
// GET /api/workspaces/{workspaceId}/entities/{entityId}/acl/count
func (h *EntityHandlers) GetEntityACLMemberCount(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["workspaceId"]
	entityID := vars["entityId"]

	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(entityID) == "" {
		JSONError(w, "Workspace ID and Entity ID are required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	// Verify user is a workspace member before revealing member counts.
	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserInWorkspace(userID, workspaceID) {
		JSONError(w, "Access denied: not a workspace member", http.StatusForbidden)
		return
	}

	resolution, err := h.resolveEntityACLRoot(workspaceID, entityID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			JSONError(w, "Entity not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, errEntityACLNotSupported) {
			JSONError(w, "Entity does not support ACL", http.StatusBadRequest)
			return
		}
		if errors.Is(err, errEntityACLRootMisaligned) {
			JSONError(w, "Entity ACL root is misconfigured", http.StatusConflict)
			return
		}
		JSONErrorWithErr(w, "Failed to resolve entity ACL root", err, http.StatusInternalServerError)
		return
	}

	count, err := h.aclService.GetACLMemberCountForResource(
		workspaceID,
		resolution.resourceType,
		resolution.resourceID,
		resolution.aclRoot.CreatorID,
	)
	if err != nil {
		JSONErrorWithErr(w, "Failed to get member count", err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"count": count,
	})
}

// GetAvailableSubjectsForEntity returns subjects that can be granted access to an entity.
//
// GET /api/workspaces/{workspaceId}/entities/{entityId}/acl/available-subjects
func (h *EntityHandlers) GetAvailableSubjectsForEntity(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	workspaceID := vars["workspaceId"]
	entityID := vars["entityId"]

	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(entityID) == "" {
		JSONError(w, "Workspace ID and Entity ID are required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	// Verify user is a workspace member before listing available subjects.
	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserInWorkspace(userID, workspaceID) {
		JSONError(w, "Access denied: not a workspace member", http.StatusForbidden)
		return
	}

	resolution, err := h.resolveEntityACLRoot(workspaceID, entityID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			JSONError(w, "Entity not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, errEntityACLNotSupported) {
			JSONError(w, "Entity does not support ACL", http.StatusBadRequest)
			return
		}
		if errors.Is(err, errEntityACLRootMisaligned) {
			JSONError(w, "Entity ACL root is misconfigured", http.StatusConflict)
			return
		}
		JSONErrorWithErr(w, "Failed to resolve entity ACL root", err, http.StatusInternalServerError)
		return
	}

	subjects, err := h.aclService.GetAvailableSubjectsForResource(
		workspaceID,
		resolution.resourceType,
		resolution.resourceID,
		userID,
	)
	if err != nil {
		JSONErrorWithErr(w, "Failed to get available subjects", err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(subjects)
}

func (h *EntityHandlers) broadcastEntityACLShare(
	aclRoot *models.Entity,
	workspaceID string,
	actorUserID string,
	subjectType models.ACLSubjectType,
	subjectID string,
) {
	if h.aclRealtimeShareSvc == nil || aclRoot == nil {
		return
	}

	response, err := aclRoot.ToResponse()
	if err != nil {
		return
	}

	event := services.SSEEvent{
		Type: string(services.SSEEntityCreated),
		Data: usecase.BuildEntityResponsePayload(response),
	}

	h.aclRealtimeShareSvc.BroadcastEntityCreatedToACLSubject(
		workspaceID,
		subjectType,
		subjectID,
		event,
		actorUserID,
	)
}

func notificationActionTypeForACLShare(entityType string) (models.NotificationActionType, bool) {
	switch entityType {
	case "folder":
		return models.NotificationActionTypeFolderShared, true
	case "paper", "file":
		return models.NotificationActionTypePaperShared, true
	default:
		return "", false
	}
}

func (h *EntityHandlers) maybeCreateEntityACLShareNotification(
	ctx context.Context,
	aclRoot *models.Entity,
	workspaceID string,
	actorUserID string,
	subjectType models.ACLSubjectType,
	subjectID string,
) {
	if h.notificationService == nil || aclRoot == nil {
		return
	}
	if subjectType != models.ACLSubjectTypeUser {
		return
	}
	recipientUserID := strings.TrimSpace(subjectID)
	if recipientUserID == "" || recipientUserID == actorUserID {
		return
	}

	actionType, ok := notificationActionTypeForACLShare(aclRoot.EntityType)
	if !ok {
		return
	}

	_, err := h.notificationService.CreateNotificationsForRecipients(
		ctx,
		services.NotificationEventDescriptor{
			WorkspaceID:      workspaceID,
			ActorUserID:      actorUserID,
			ActionType:       actionType,
			TargetEntityID:   aclRoot.ID,
			TargetEntityType: aclRoot.EntityType,
			ParentEntityID:   aclRoot.ID,
			ParentEntityType: aclRoot.EntityType,
		},
		[]string{recipientUserID},
	)
	if err != nil {
		log.Printf("notification: failed to create ACL share notification: %v", err)
	}
}
