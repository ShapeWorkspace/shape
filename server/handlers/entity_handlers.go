package handlers

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
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

// EntityHandlers handles unified entity CRUD + query + block endpoints.
type EntityHandlers struct {
	entityService          *services.EntityService
	entityBlockService     *services.EntityBlockService
	notificationService    *services.NotificationService
	aclService             *services.ACLService
	workspaceChecker       *services.WorkspaceChecker
	sseManager             *services.SSEManager
	aclRealtimeShareSvc    *services.ACLRealtimeShareService
	changeLogService       *services.ChangeLogService
	entityBroadcastUseCase *usecase.EntityBroadcastUseCase
}

// NewEntityHandlers creates a new EntityHandlers instance.
func NewEntityHandlers(
	entityService *services.EntityService,
	entityBlockService *services.EntityBlockService,
	notificationService *services.NotificationService,
	aclService *services.ACLService,
	workspaceChecker *services.WorkspaceChecker,
	sseManager *services.SSEManager,
	aclRealtimeShareSvc *services.ACLRealtimeShareService,
	changeLogService *services.ChangeLogService,
	entityBroadcastUseCase *usecase.EntityBroadcastUseCase,
) *EntityHandlers {
	return &EntityHandlers{
		entityService:          entityService,
		entityBlockService:     entityBlockService,
		notificationService:    notificationService,
		aclService:             aclService,
		workspaceChecker:       workspaceChecker,
		sseManager:             sseManager,
		aclRealtimeShareSvc:    aclRealtimeShareSvc,
		changeLogService:       changeLogService,
		entityBroadcastUseCase: entityBroadcastUseCase,
	}
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

// CreateEntityRequest is the request body for creating a unified entity.
type CreateEntityRequest struct {
	ID                string                 `json:"id"`
	EntityType        string                 `json:"entity_type"`
	ParentID          *string                `json:"parent_id,omitempty"`
	ParentType        *string                `json:"parent_type,omitempty"`
	ChainRootKeyID    string                 `json:"chain_root_key_id"`
	WrappingKeyID     string                 `json:"wrapping_key_id"`
	WrappingKeyType   string                 `json:"wrapping_key_type"`
	EntityKeyNonce    string                 `json:"entity_key_nonce"`
	WrappedEntityKey  string                 `json:"wrapped_entity_key"`
	ContentNonce      string                 `json:"content_nonce"`
	ContentCiphertext string                 `json:"content_ciphertext"`
	ContentHash       string                 `json:"content_hash"`
	MetaFields        map[string]interface{} `json:"meta_fields"`
	MentionedUserIDs  []string               `json:"mentioned_user_ids"`
}

// UpdateEntityRequest is the request body for updating a unified entity.
type UpdateEntityRequest struct {
	ChainRootKeyID    string                 `json:"chain_root_key_id"`
	WrappingKeyID     string                 `json:"wrapping_key_id"`
	WrappingKeyType   string                 `json:"wrapping_key_type"`
	EntityKeyNonce    string                 `json:"entity_key_nonce"`
	WrappedEntityKey  string                 `json:"wrapped_entity_key"`
	ContentNonce      string                 `json:"content_nonce"`
	ContentCiphertext string                 `json:"content_ciphertext"`
	ContentHash       string                 `json:"content_hash"`
	ExpectedHash      string                 `json:"expected_hash"`
	MetaFields        map[string]interface{} `json:"meta_fields,omitempty"`
	MentionedUserIDs  *[]string              `json:"mentioned_user_ids,omitempty"`
	ParentID          *string                `json:"parent_id,omitempty"`
	ParentType        *string                `json:"parent_type,omitempty"`
}

// EntityQueryRequest is the request body for predicate queries.
type EntityQueryRequest struct {
	Query services.EntityQueryNode `json:"query"`
}

// CreateEntityBlockRequest is the request body for creating an entity block.
type CreateEntityBlockRequest struct {
	EncryptedData string `json:"encrypted_data"`
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// HandleEntities handles POST /entities for both create and query.
// The request is treated as a query when "query" is present at the top level.
func (h *EntityHandlers) HandleEntities(w http.ResponseWriter, r *http.Request) {
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

	// Verify user is a workspace member.
	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserInWorkspace(userID, workspaceID) {
		JSONError(w, "Access denied: not a workspace member", http.StatusForbidden)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		JSONError(w, "Failed to read request body", http.StatusBadRequest)
		return
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if _, ok := raw["query"]; ok {
		h.queryEntities(w, r, workspaceID, userID, body)
		return
	}

	h.createEntity(w, r, workspaceID, userID, body)
}

// GetEntity handles GET /entities/{entityId}.
func (h *EntityHandlers) GetEntity(w http.ResponseWriter, r *http.Request) {
	workspaceID := mux.Vars(r)["workspaceId"]
	entityID := mux.Vars(r)["entityId"]
	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(entityID) == "" {
		JSONError(w, "Workspace ID and Entity ID are required", http.StatusBadRequest)
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

	entity, err := h.entityService.GetByIDInWorkspace(entityID, workspaceID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			JSONError(w, "Entity not found", http.StatusNotFound)
			return
		}
		JSONErrorWithErr(w, "Failed to load entity", err, http.StatusInternalServerError)
		return
	}

	hasAccess, err := h.entityService.UserHasAccess(userID, entity)
	if err != nil {
		JSONErrorWithErr(w, "Failed to verify entity permissions", err, http.StatusInternalServerError)
		return
	}
	if !hasAccess {
		JSONError(w, "Access denied", http.StatusForbidden)
		return
	}

	response, err := entity.ToResponse()
	if err != nil {
		JSONErrorWithErr(w, "Failed to serialize entity", err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// UpdateEntity handles PUT /entities/{entityId}.
func (h *EntityHandlers) UpdateEntity(w http.ResponseWriter, r *http.Request) {
	workspaceID := mux.Vars(r)["workspaceId"]
	entityID := mux.Vars(r)["entityId"]

	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(entityID) == "" {
		JSONError(w, "Workspace ID and Entity ID are required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	// Verify user is a workspace member.
	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserInWorkspace(userID, workspaceID) {
		JSONError(w, "Access denied: not a workspace member", http.StatusForbidden)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		JSONError(w, "Failed to read request body", http.StatusBadRequest)
		return
	}

	var req UpdateEntityRequest
	if err := json.Unmarshal(body, &req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	var raw map[string]json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	parentFieldsProvided := false
	if _, ok := raw["parent_id"]; ok {
		parentFieldsProvided = true
	}
	if _, ok := raw["parent_type"]; ok {
		parentFieldsProvided = true
	}
	metaFieldsProvided := false
	if _, ok := raw["meta_fields"]; ok {
		metaFieldsProvided = true
	}

	if strings.TrimSpace(req.ExpectedHash) == "" {
		JSONError(w, "expected_hash is required for updates", http.StatusBadRequest)
		return
	}

	entity, err := h.entityService.Update(entityID, workspaceID, userID, models.UpdateEntityParams{
		ChainRootKeyID:       req.ChainRootKeyID,
		WrappingKeyID:        req.WrappingKeyID,
		WrappingKeyType:      req.WrappingKeyType,
		EntityKeyNonce:       req.EntityKeyNonce,
		WrappedEntityKey:     req.WrappedEntityKey,
		ContentNonce:         req.ContentNonce,
		ContentCiphertext:    req.ContentCiphertext,
		ContentHash:          req.ContentHash,
		ExpectedHash:         req.ExpectedHash,
		MetaFields:           req.MetaFields,
		MetaFieldsProvided:   metaFieldsProvided,
		MentionedUserIDs:     req.MentionedUserIDs,
		ParentID:             req.ParentID,
		ParentType:           req.ParentType,
		ParentFieldsProvided: parentFieldsProvided,
		LastUpdatedByID:      userID,
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			JSONError(w, "Entity not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, models.ErrEntityConflict) {
			JSONError(w, "Conflict: entity has been modified", http.StatusConflict)
			return
		}
		if strings.Contains(err.Error(), "access denied") {
			JSONError(w, "Access denied", http.StatusForbidden)
			return
		}
		JSONErrorWithErr(w, "Failed to update entity", err, http.StatusInternalServerError)
		return
	}

	response, err := entity.ToResponse()
	if err != nil {
		JSONErrorWithErr(w, "Failed to serialize entity", err, http.StatusInternalServerError)
		return
	}

	if h.entityBroadcastUseCase != nil {
		h.entityBroadcastUseCase.Execute(
			workspaceID,
			userID,
			response,
			services.SSEEntityUpdated,
			r.Header.Get("X-SSE-Client-ID"),
		)
	}
	h.appendChangeLogEntry(r.Context(), workspaceID, entity.EntityType, entity.ID, models.ChangeLogOperationUpdate, userID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// DeleteEntity handles DELETE /entities/{entityId}.
func (h *EntityHandlers) DeleteEntity(w http.ResponseWriter, r *http.Request) {
	workspaceID := mux.Vars(r)["workspaceId"]
	entityID := mux.Vars(r)["entityId"]

	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(entityID) == "" {
		JSONError(w, "Workspace ID and Entity ID are required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	// Verify user is a workspace member.
	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserInWorkspace(userID, workspaceID) {
		JSONError(w, "Access denied: not a workspace member", http.StatusForbidden)
		return
	}

	entity, err := h.entityService.GetByIDInWorkspace(entityID, workspaceID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			JSONError(w, "Entity not found", http.StatusNotFound)
			return
		}
		JSONErrorWithErr(w, "Failed to load entity", err, http.StatusInternalServerError)
		return
	}

	canWrite, err := h.entityService.UserHasWriteAccess(userID, entity)
	if err != nil {
		JSONErrorWithErr(w, "Failed to authorize entity deletion", err, http.StatusInternalServerError)
		return
	}
	if !canWrite {
		JSONError(w, "Access denied", http.StatusForbidden)
		return
	}

	if err := h.entityService.DeleteByID(entityID); err != nil {
		JSONErrorWithErr(w, "Failed to delete entity", err, http.StatusInternalServerError)
		return
	}

	h.maybeDeleteReactionNotification(r.Context(), workspaceID, entity)
	h.appendChangeLogEntry(r.Context(), workspaceID, entity.EntityType, entity.ID, models.ChangeLogOperationDelete, userID)

	if h.entityBlockService != nil {
		if blockType, blockField, _, ok := resolveBlockMetadata(entity.EntityType); ok {
			_ = h.entityBlockService.DeleteForEntity(entity.ID, blockType, blockField)
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

// CreateEntityBlock handles POST /entities/{entityId}/blocks.
func (h *EntityHandlers) CreateEntityBlock(w http.ResponseWriter, r *http.Request) {
	workspaceID := mux.Vars(r)["workspaceId"]
	entityID := mux.Vars(r)["entityId"]

	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(entityID) == "" {
		JSONError(w, "Workspace ID and Entity ID are required", http.StatusBadRequest)
		return
	}

	userID := middleware.GetUserID(r)
	if userID == "" {
		JSONError(w, "User not authenticated", http.StatusUnauthorized)
		return
	}

	// Verify user is a workspace member.
	if h.workspaceChecker != nil && !h.workspaceChecker.IsUserInWorkspace(userID, workspaceID) {
		JSONError(w, "Access denied: not a workspace member", http.StatusForbidden)
		return
	}

	entity, err := h.entityService.GetByIDInWorkspace(entityID, workspaceID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			JSONError(w, "Entity not found", http.StatusNotFound)
			return
		}
		JSONErrorWithErr(w, "Failed to load entity", err, http.StatusInternalServerError)
		return
	}

	canWrite, err := h.entityService.UserHasWriteAccess(userID, entity)
	if err != nil {
		JSONErrorWithErr(w, "Failed to authorize entity block creation", err, http.StatusInternalServerError)
		return
	}
	if !canWrite {
		JSONError(w, "Access denied", http.StatusForbidden)
		return
	}

	var req CreateEntityBlockRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.EncryptedData) == "" {
		JSONError(w, "encrypted_data is required", http.StatusBadRequest)
		return
	}

	blockType, blockField, sseEntityType, ok := resolveBlockMetadata(entity.EntityType)
	if !ok {
		JSONError(w, "Entity type does not support blocks", http.StatusBadRequest)
		return
	}

	encryptedData, err := base64.StdEncoding.DecodeString(req.EncryptedData)
	if err != nil {
		JSONError(w, "Invalid encrypted_data: must be base64 encoded", http.StatusBadRequest)
		return
	}

	block, _, err := h.entityBlockService.Create(services.CreateEntityBlockParams{
		EntityID:      entity.ID,
		EntityType:    blockType,
		EntityField:   blockField,
		AuthorID:      userID,
		EncryptedData: encryptedData,
	})
	if err != nil {
		JSONErrorWithErr(w, "Failed to create entity block", err, http.StatusInternalServerError)
		return
	}

	h.broadcastEntityBlockEvent(workspaceID, userID, entity, block, sseEntityType, req.EncryptedData, r.Header.Get("X-SSE-Client-ID"))
	h.appendChangeLogEntry(r.Context(), workspaceID, "block", block.ID, models.ChangeLogOperationCreate, userID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(block.ToResponse(req.EncryptedData))
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

func (h *EntityHandlers) createEntity(w http.ResponseWriter, r *http.Request, workspaceID, userID string, body []byte) {
	var req CreateEntityRequest
	if err := json.Unmarshal(body, &req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	entity, err := h.entityService.Create(models.CreateEntityParams{
		ID:                req.ID,
		WorkspaceID:       workspaceID,
		EntityType:        req.EntityType,
		ParentID:          req.ParentID,
		ParentType:        req.ParentType,
		ChainRootKeyID:    req.ChainRootKeyID,
		WrappingKeyID:     req.WrappingKeyID,
		WrappingKeyType:   req.WrappingKeyType,
		EntityKeyNonce:    req.EntityKeyNonce,
		WrappedEntityKey:  req.WrappedEntityKey,
		ContentNonce:      req.ContentNonce,
		ContentCiphertext: req.ContentCiphertext,
		ContentHash:       req.ContentHash,
		MetaFields:        req.MetaFields,
		MentionedUserIDs:  req.MentionedUserIDs,
		CreatorID:         userID,
		LastUpdatedByID:   userID,
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			JSONError(w, "Parent entity not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, models.ErrUserProfileAlreadyExists) || errors.Is(err, gorm.ErrDuplicatedKey) {
			JSONError(w, "User profile already exists for this workspace user", http.StatusConflict)
			return
		}
		if isEntityValidationError(err) {
			JSONError(w, err.Error(), http.StatusBadRequest)
			return
		}
		JSONErrorWithErr(w, "Failed to create entity", err, http.StatusInternalServerError)
		return
	}

	response, err := entity.ToResponse()
	if err != nil {
		JSONErrorWithErr(w, "Failed to serialize entity", err, http.StatusInternalServerError)
		return
	}

	if h.entityBroadcastUseCase != nil {
		h.entityBroadcastUseCase.Execute(
			workspaceID,
			userID,
			response,
			services.SSEEntityCreated,
			r.Header.Get("X-SSE-Client-ID"),
		)
	}
	h.maybeCreateDirectMessageNotification(r.Context(), workspaceID, userID, entity)
	h.maybeCreateTaskCommentNotification(r.Context(), workspaceID, userID, entity)
	h.maybeCreateDiscussionReplyNotification(r.Context(), workspaceID, userID, entity)
	h.maybeCreateReactionNotification(r.Context(), workspaceID, entity)
	h.appendChangeLogEntry(r.Context(), workspaceID, entity.EntityType, entity.ID, models.ChangeLogOperationCreate, userID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(response)
}

func (h *EntityHandlers) maybeCreateDirectMessageNotification(
	ctx context.Context,
	workspaceID string,
	actorUserID string,
	entity *models.Entity,
) {
	if h.notificationService == nil || entity == nil {
		return
	}
	if entity.EntityType != "direct-message" {
		return
	}
	rawRecipientID, ok := entity.MetaFields["recipient_id"]
	if !ok {
		return
	}
	recipientID, ok := rawRecipientID.(string)
	if !ok {
		return
	}
	recipientID = strings.TrimSpace(recipientID)
	if recipientID == "" || recipientID == actorUserID {
		return
	}

	_, err := h.notificationService.CreateNotificationsForRecipients(
		ctx,
		services.NotificationEventDescriptor{
			WorkspaceID:      workspaceID,
			ActorUserID:      actorUserID,
			ActionType:       models.NotificationActionTypeDirectMessageReceived,
			TargetEntityID:   entity.ID,
			TargetEntityType: "direct-message",
			ParentEntityID:   actorUserID,
			ParentEntityType: "user",
		},
		[]string{recipientID},
	)
	if err != nil {
		log.Printf("notification: failed to create DM notification: %v", err)
	}
}

func (h *EntityHandlers) maybeCreateTaskCommentNotification(
	ctx context.Context,
	workspaceID string,
	actorUserID string,
	entity *models.Entity,
) {
	if h.notificationService == nil || h.entityService == nil || entity == nil {
		return
	}
	if entity.EntityType != "task-comment" || entity.ParentID == nil || entity.ParentType == nil {
		return
	}
	if *entity.ParentType != "task" || strings.TrimSpace(*entity.ParentID) == "" {
		return
	}

	parentTask, err := h.entityService.GetByIDInWorkspace(*entity.ParentID, workspaceID)
	if err != nil || parentTask == nil {
		return
	}
	recipientUserIDs, accessScope, ok := h.resolveNotificationRecipientsForEntity(workspaceID, parentTask)
	if !ok {
		return
	}

	_, err = h.notificationService.CreateNotificationsForRecipients(
		ctx,
		services.NotificationEventDescriptor{
			WorkspaceID:      workspaceID,
			ActorUserID:      actorUserID,
			ActionType:       models.NotificationActionTypeTaskComment,
			TargetEntityID:   entity.ID,
			TargetEntityType: entity.EntityType,
			ParentEntityID:   parentTask.ID,
			ParentEntityType: parentTask.EntityType,
			AccessScope:      accessScope,
		},
		recipientUserIDs,
	)
	if err != nil {
		log.Printf("notification: failed to create task-comment notification: %v", err)
	}
}

func (h *EntityHandlers) maybeCreateDiscussionReplyNotification(
	ctx context.Context,
	workspaceID string,
	actorUserID string,
	entity *models.Entity,
) {
	if h.notificationService == nil || h.entityService == nil || entity == nil {
		return
	}
	if entity.EntityType != "forum-reply" || entity.ParentID == nil || entity.ParentType == nil {
		return
	}
	if *entity.ParentType != "forum-discussion" || strings.TrimSpace(*entity.ParentID) == "" {
		return
	}

	parentDiscussion, err := h.entityService.GetByIDInWorkspace(*entity.ParentID, workspaceID)
	if err != nil || parentDiscussion == nil {
		return
	}
	recipientUserIDs, accessScope, ok := h.resolveNotificationRecipientsForEntity(workspaceID, parentDiscussion)
	if !ok {
		return
	}

	_, err = h.notificationService.CreateNotificationsForRecipients(
		ctx,
		services.NotificationEventDescriptor{
			WorkspaceID:      workspaceID,
			ActorUserID:      actorUserID,
			ActionType:       models.NotificationActionTypeDiscussionReply,
			TargetEntityID:   entity.ID,
			TargetEntityType: entity.EntityType,
			ParentEntityID:   parentDiscussion.ID,
			ParentEntityType: parentDiscussion.EntityType,
			AccessScope:      accessScope,
		},
		recipientUserIDs,
	)
	if err != nil {
		log.Printf("notification: failed to create discussion-reply notification: %v", err)
	}
}

func (h *EntityHandlers) resolveNotificationRecipientsForEntity(
	workspaceID string,
	entity *models.Entity,
) ([]string, *services.NotificationRecipientAccessScope, bool) {
	if h.entityService == nil || entity == nil {
		return nil, nil, false
	}

	accessContext, err := h.entityService.ResolveAccessContext(entity)
	if err != nil || accessContext == nil {
		return nil, nil, false
	}

	switch accessContext.AccessType {
	case services.EntityAccessTypeACL:
		if h.aclService == nil {
			return nil, nil, false
		}
		recipientUserIDs, err := h.aclService.ListUserIDsWithAccessForResource(
			workspaceID,
			accessContext.ACLResourceType,
			accessContext.ACLResourceID,
			accessContext.CreatorID,
		)
		if err != nil || len(recipientUserIDs) == 0 {
			return nil, nil, false
		}
		return recipientUserIDs, &services.NotificationRecipientAccessScope{
			ResourceType: accessContext.ACLResourceType,
			ResourceID:   accessContext.ACLResourceID,
			CreatorID:    accessContext.CreatorID,
		}, true
	case services.EntityAccessTypeDirectMessage:
		if len(accessContext.DirectMessageParticipantIDs) == 0 {
			return nil, nil, false
		}
		return accessContext.DirectMessageParticipantIDs, nil, true
	case services.EntityAccessTypeCreatorOnly:
		creatorID := strings.TrimSpace(accessContext.CreatorID)
		if creatorID == "" {
			return nil, nil, false
		}
		return []string{creatorID}, nil, true
	default:
		return nil, nil, false
	}
}

func (h *EntityHandlers) maybeCreateReactionNotification(
	ctx context.Context,
	workspaceID string,
	entity *models.Entity,
) {
	if h.notificationService == nil || h.entityService == nil || entity == nil {
		return
	}

	event, recipientID, ok := h.buildReactionNotificationDescriptor(workspaceID, entity)
	if !ok {
		return
	}

	if _, err := h.notificationService.CreateNotificationsForRecipients(ctx, event, []string{recipientID}); err != nil {
		log.Printf("notification: failed to create reaction notification: %v", err)
	}
}

func (h *EntityHandlers) maybeDeleteReactionNotification(
	ctx context.Context,
	workspaceID string,
	entity *models.Entity,
) {
	if h.notificationService == nil || h.entityService == nil || entity == nil {
		return
	}

	event, recipientID, ok := h.buildReactionNotificationDescriptor(workspaceID, entity)
	if !ok {
		return
	}

	if err := h.notificationService.DeleteLatestReactionNotificationForRecipient(ctx, event, recipientID); err != nil {
		log.Printf("notification: failed to delete reaction notification: %v", err)
	}
}

func (h *EntityHandlers) buildReactionNotificationDescriptor(
	workspaceID string,
	reactionEntity *models.Entity,
) (services.NotificationEventDescriptor, string, bool) {
	if reactionEntity == nil || reactionEntity.EntityType != "reaction" {
		return services.NotificationEventDescriptor{}, "", false
	}
	if reactionEntity.ParentID == nil || reactionEntity.ParentType == nil {
		return services.NotificationEventDescriptor{}, "", false
	}

	parentEntityID := strings.TrimSpace(*reactionEntity.ParentID)
	if parentEntityID == "" {
		return services.NotificationEventDescriptor{}, "", false
	}

	parentEntity, err := h.entityService.GetByIDInWorkspace(parentEntityID, workspaceID)
	if err != nil || parentEntity == nil {
		return services.NotificationEventDescriptor{}, "", false
	}

	recipientID := strings.TrimSpace(parentEntity.CreatorID)
	if recipientID == "" {
		return services.NotificationEventDescriptor{}, "", false
	}

	return services.NotificationEventDescriptor{
		WorkspaceID:      workspaceID,
		ActorUserID:      reactionEntity.CreatorID,
		ActionType:       models.NotificationActionTypeReactionAdded,
		TargetEntityID:   parentEntity.ID,
		TargetEntityType: parentEntity.EntityType,
		ParentEntityID:   parentEntity.ID,
		ParentEntityType: parentEntity.EntityType,
	}, recipientID, true
}

func (h *EntityHandlers) queryEntities(w http.ResponseWriter, r *http.Request, workspaceID, userID string, body []byte) {
	var req EntityQueryRequest
	if err := json.Unmarshal(body, &req); err != nil {
		JSONError(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	entities, err := h.entityService.QueryEntities(workspaceID, userID, req.Query)
	if err != nil {
		if isEntityValidationError(err) {
			JSONError(w, err.Error(), http.StatusBadRequest)
			return
		}
		JSONErrorWithErr(w, "Failed to query entities", err, http.StatusInternalServerError)
		return
	}

	responses := make([]*models.EntityResponse, 0, len(entities))
	for _, entity := range entities {
		response, err := entity.ToResponse()
		if err != nil {
			JSONErrorWithErr(w, "Failed to serialize entity", err, http.StatusInternalServerError)
			return
		}
		responses = append(responses, response)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(responses)
}

func (h *EntityHandlers) broadcastEntityBlockEvent(
	workspaceID string,
	userID string,
	entity *models.Entity,
	block *models.EntityBlock,
	entityType string,
	encryptedData string,
	sseClientID string,
) {
	if h.sseManager == nil || entity == nil {
		return
	}

	accessContext, err := h.entityService.ResolveAccessContext(entity)
	if err != nil {
		return
	}

	event := services.SSEEvent{
		Type: string(services.SSEEntityBlockCreated),
		Data: map[string]interface{}{
			"entityId":      entity.ID,
			"entityType":    entityType,
			"entityField":   block.EntityField,
			"blockId":       block.ID,
			"authorId":      userID,
			"encryptedData": encryptedData,
			"dataVersion":   block.DataVersion,
			"createdAt":     block.CreatedAt,
		},
	}

	switch accessContext.AccessType {
	case services.EntityAccessTypeACL:
		h.sseManager.BroadcastToUsersWithAccess(
			workspaceID,
			accessContext.ACLResourceType,
			accessContext.ACLResourceID,
			event,
			services.ACLBroadcastOptions{
				CreatorID:       accessContext.CreatorID,
				ExcludeClientID: sseClientID,
			},
		)
	case services.EntityAccessTypeDirectMessage:
		for _, recipientID := range accessContext.DirectMessageParticipantIDs {
			if strings.TrimSpace(recipientID) == "" {
				continue
			}
			h.sseManager.BroadcastToUserWithOptions(recipientID, workspaceID, event, services.UserBroadcastOptions{
				ExcludeClientID: sseClientID,
			})
		}
	case services.EntityAccessTypeCreatorOnly:
		h.sseManager.BroadcastToUserWithOptions(accessContext.CreatorID, workspaceID, event, services.UserBroadcastOptions{
			ExcludeClientID: sseClientID,
		})
	}
}

func resolveBlockMetadata(entityType string) (models.EntityBlockType, string, string, bool) {
	switch entityType {
	case "note":
		return models.EntityBlockTypeNote, "text", "note", true
	case "paper":
		return models.EntityBlockTypePaper, "text", "paper", true
	case "task":
		return models.EntityBlockTypeTask, "description", "task", true
	default:
		return "", "", "", false
	}
}

func isEntityValidationError(err error) bool {
	if err == nil {
		return false
	}
	lower := strings.ToLower(err.Error())
	return strings.Contains(lower, "required") ||
		strings.Contains(lower, "invalid") ||
		strings.Contains(lower, "cannot") ||
		strings.Contains(lower, "unsupported") ||
		strings.Contains(lower, "must") ||
		strings.Contains(lower, "does not match")
}

func (h *EntityHandlers) appendChangeLogEntry(
	ctx context.Context,
	workspaceID string,
	entityType string,
	entityID string,
	operation models.ChangeLogOperation,
	actorID string,
) {
	if h.changeLogService == nil {
		return
	}

	if _, err := h.changeLogService.AppendChange(ctx, services.AppendChangeParams{
		WorkspaceID: workspaceID,
		EntityType:  models.ChangeLogEntityType(entityType),
		EntityID:    entityID,
		Operation:   operation,
		ActorID:     actorID,
	}); err != nil {
		log.Printf(
			"entity change log: failed to append workspace=%s entity=%s type=%s op=%s err=%v",
			workspaceID,
			entityID,
			entityType,
			operation,
			err,
		)
	}
}
