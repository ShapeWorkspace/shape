package usecase

import (
	"encoding/json"
	"strings"

	"gorm.io/datatypes"

	"shape/models"
	"shape/services"
)

// EntityBroadcastUseCase centralizes SSE emission for entity-shaped payloads.
// This keeps ACL-aware broadcast logic out of handlers while still reusable
// across entity CRUD, file uploads, and ACL share workflows.
type EntityBroadcastUseCase struct {
	sseManager    *services.SSEManager
	entityService *services.EntityService
}

// NewEntityBroadcastUseCase constructs a new broadcast use case.
func NewEntityBroadcastUseCase(sseManager *services.SSEManager, entityService *services.EntityService) *EntityBroadcastUseCase {
	return &EntityBroadcastUseCase{
		sseManager:    sseManager,
		entityService: entityService,
	}
}

// Execute broadcasts the given entity payload to all users who should receive it.
// It resolves access rules using the unified entity service and emits via SSE.
func (u *EntityBroadcastUseCase) Execute(
	workspaceID string,
	userID string,
	entity *models.EntityResponse,
	eventType services.SSEEventType,
	sseClientID string,
) {
	if u == nil || u.sseManager == nil || u.entityService == nil || entity == nil {
		return
	}

	accessContext, err := u.entityService.ResolveAccessContext(&models.Entity{
		ID:          entity.ID,
		WorkspaceID: entity.WorkspaceID,
		EntityType:  entity.EntityType,
		ACLFromID:   entity.ACLFromID,
		ACLFromType: entity.ACLFromType,
		ParentID:    entity.ParentID,
		ParentType:  entity.ParentType,
		CreatorID:   entity.CreatorID,
		MetaFields:  datatypes.JSONMap(entity.MetaFields),
	})
	if err != nil {
		return
	}

	event := services.SSEEvent{
		Type: string(eventType),
		Data: BuildEntityResponsePayload(entity),
	}

	switch accessContext.AccessType {
	case services.EntityAccessTypeACL:
		u.sseManager.BroadcastToUsersWithAccess(
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
		for _, participantID := range accessContext.DirectMessageParticipantIDs {
			if strings.TrimSpace(participantID) == "" {
				continue
			}
			u.sseManager.BroadcastToUserWithOptions(participantID, workspaceID, event, services.UserBroadcastOptions{
				ExcludeClientID: sseClientID,
			})
		}
	case services.EntityAccessTypeCreatorOnly:
		u.sseManager.BroadcastToUserWithOptions(accessContext.CreatorID, workspaceID, event, services.UserBroadcastOptions{
			ExcludeClientID: sseClientID,
		})
	}
}

// BuildEntityResponsePayload converts an entity response into a map payload for SSE.
// This keeps JSON key formatting consistent with API responses.
func BuildEntityResponsePayload(entity *models.EntityResponse) map[string]interface{} {
	if entity == nil {
		return map[string]interface{}{}
	}
	serialized, err := json.Marshal(entity)
	if err != nil {
		return map[string]interface{}{}
	}
	var payload map[string]interface{}
	if err := json.Unmarshal(serialized, &payload); err != nil {
		return map[string]interface{}{}
	}
	return payload
}
