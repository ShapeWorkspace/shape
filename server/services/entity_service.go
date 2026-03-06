package services

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"shape/models"
	"shape/repositories"
)

// ---------------------------------------------------------------------------
// Entity Access Types
// ---------------------------------------------------------------------------

// EntityAccessType describes how access is enforced for an entity.
type EntityAccessType string

const (
	EntityAccessTypeACL           EntityAccessType = "acl"
	EntityAccessTypeDirectMessage EntityAccessType = "direct_message"
	EntityAccessTypeCreatorOnly   EntityAccessType = "creator_only"
)

// EntityAccessContext captures access routing details for SSE and permissions.
type EntityAccessContext struct {
	AccessType EntityAccessType

	// ACLResourceType/ID identify the resource used for ACL checks/broadcasts.
	ACLResourceType models.ACLResourceType
	ACLResourceID   string

	// CreatorID is the entity creator (implicit access).
	CreatorID string

	// DirectMessageParticipantIDs are sender/recipient IDs for direct messages.
	DirectMessageParticipantIDs []string
}

// ---------------------------------------------------------------------------
// Entity Service
// ---------------------------------------------------------------------------

// EntityService provides business logic for unified entities.
type EntityService struct {
	repository             repositories.EntityRepository
	aclService             *ACLService
	effectiveAccessService *EffectiveAccessService
	createValidatorsByType map[string][]EntityCreateValidator
	updateValidatorsByType map[string][]EntityUpdateValidator
}

// NewEntityService creates a new EntityService.
func NewEntityService(
	repository repositories.EntityRepository,
	aclService *ACLService,
	effectiveAccessService *EffectiveAccessService,
) *EntityService {
	return &EntityService{
		repository:             repository,
		aclService:             aclService,
		effectiveAccessService: effectiveAccessService,
		createValidatorsByType: buildEntityCreateValidators(repository),
		updateValidatorsByType: buildEntityUpdateValidators(),
	}
}

// GetByIDInWorkspace retrieves an entity scoped to a workspace.
func (s *EntityService) GetByIDInWorkspace(entityID string, workspaceID string) (*models.Entity, error) {
	return s.repository.FindEntityByIDInWorkspace(entityID, workspaceID)
}

// DeleteByID removes an entity by ID.
func (s *EntityService) DeleteByID(entityID string) error {
	return s.repository.DeleteEntityByID(entityID)
}

// ---------------------------------------------------------------------------
// Entity Type Maps
// ---------------------------------------------------------------------------

var supportedEntityTypes = map[string]struct{}{
	"note":                {},
	"direct-message":      {},
	"group-chat":          {},
	"group-message":       {},
	"project":             {},
	"task":                {},
	"project-tag":         {},
	"task-comment":        {},
	"folder":              {},
	"file":                {},
	"paper":               {},
	"paper-comment":       {},
	"paper-comment-reply": {},
	"forum-channel":       {},
	"forum-discussion":    {},
	"forum-reply":         {},
	"reaction":            {},
	"user-profile":        {},
}

var entityTypesRequiringParent = map[string]struct{}{
	"group-message":       {},
	"task":                {},
	"project-tag":         {},
	"task-comment":        {},
	"forum-discussion":    {},
	"forum-reply":         {},
	"paper-comment":       {},
	"paper-comment-reply": {},
	"reaction":            {},
}

var entityTypesAllowingParentChange = map[string]struct{}{
	"paper":  {},
	"file":   {},
	"folder": {},
}

var aclRootEntityTypes = map[string]models.ACLResourceType{
	"project":       models.ACLResourceTypeProject,
	"group-chat":    models.ACLResourceTypeGroupChat,
	"folder":        models.ACLResourceTypeFolder,
	"file":          models.ACLResourceTypeFile,
	"paper":         models.ACLResourceTypePaper,
	"forum-channel": models.ACLResourceTypeForumChannel,
}

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

func isSupportedEntityType(entityType string) bool {
	_, ok := supportedEntityTypes[entityType]
	return ok
}

func entityTypeRequiresParent(entityType string) bool {
	_, ok := entityTypesRequiringParent[entityType]
	return ok
}

func entityTypeAllowsParentChange(entityType string) bool {
	_, ok := entityTypesAllowingParentChange[entityType]
	return ok
}

func resolveACLResourceTypeForEntityType(entityType string) (models.ACLResourceType, bool) {
	resourceType, ok := aclRootEntityTypes[entityType]
	return resourceType, ok
}

// ResolveACLResourceTypeForEntityType exposes the ACL resource mapping for handlers.
// This keeps ACL type logic centralized in the entity service.
func (s *EntityService) ResolveACLResourceTypeForEntityType(entityType string) (models.ACLResourceType, bool) {
	return resolveACLResourceTypeForEntityType(entityType)
}

// IsSupportedEntityType exposes the supported entity type map for sync filtering.
func (s *EntityService) IsSupportedEntityType(entityType string) bool {
	return isSupportedEntityType(entityType)
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

// Create creates a new unified entity after validating inputs.
func (s *EntityService) Create(params models.CreateEntityParams) (*models.Entity, error) {
	// Validate IDs and required fields.
	if strings.TrimSpace(params.ID) == "" {
		return nil, errors.New("entity id is required")
	}
	if _, err := uuid.Parse(params.ID); err != nil {
		return nil, errors.New("entity id must be a valid UUID")
	}
	if strings.TrimSpace(params.WorkspaceID) == "" {
		return nil, errors.New("workspace_id is required")
	}
	if strings.TrimSpace(params.CreatorID) == "" {
		return nil, errors.New("creator_id is required")
	}
	if strings.TrimSpace(params.LastUpdatedByID) == "" {
		return nil, errors.New("last_updated_by_id is required")
	}
	if strings.TrimSpace(params.EntityType) == "" {
		return nil, errors.New("entity_type is required")
	}
	if !isSupportedEntityType(params.EntityType) {
		return nil, fmt.Errorf("entity_type %q is not supported", params.EntityType)
	}

	// Validate encryption envelope (generic requirements).
	if strings.TrimSpace(params.ChainRootKeyID) == "" {
		return nil, errors.New("chain_root_key_id is required")
	}
	if strings.TrimSpace(params.WrappingKeyID) == "" {
		return nil, errors.New("wrapping_key_id is required")
	}
	if strings.TrimSpace(params.WrappingKeyType) == "" {
		return nil, errors.New("wrapping_key_type is required")
	}
	if params.WrappingKeyType == "workspace" && params.WrappingKeyID != params.ChainRootKeyID {
		return nil, errors.New("wrapping_key_id must match chain_root_key_id for workspace wrapping")
	}
	if strings.TrimSpace(params.EntityKeyNonce) == "" {
		return nil, errors.New("entity_key_nonce is required")
	}
	if strings.TrimSpace(params.WrappedEntityKey) == "" {
		return nil, errors.New("wrapped_entity_key is required")
	}
	if strings.TrimSpace(params.ContentNonce) == "" {
		return nil, errors.New("content_nonce is required")
	}
	if strings.TrimSpace(params.ContentCiphertext) == "" {
		return nil, errors.New("content_ciphertext is required")
	}
	if strings.TrimSpace(params.ContentHash) == "" {
		return nil, errors.New("content_hash is required")
	}

	if err := s.validateCreateByEntityType(params); err != nil {
		return nil, err
	}

	// Resolve parent + ACL inheritance.
	var resolvedParentID *string
	var resolvedParentType *string
	var resolvedACLFromID *string
	var resolvedACLFromType *string

	if params.ParentID != nil && strings.TrimSpace(*params.ParentID) != "" {
		parent, err := s.repository.FindEntityByIDInWorkspace(*params.ParentID, params.WorkspaceID)
		if err != nil {
			return nil, err
		}

		if params.ParentType != nil && strings.TrimSpace(*params.ParentType) != "" && *params.ParentType != parent.EntityType {
			return nil, errors.New("parent_type does not match parent entity type")
		}

		parentID := parent.ID
		parentType := parent.EntityType
		resolvedParentID = &parentID
		resolvedParentType = &parentType

		if parent.ACLFromID == nil || parent.ACLFromType == nil {
			if parent.EntityType == "direct-message" {
				// Children of direct-message entities do not inherit ACL roots.
				// Access is derived from DM participants.
			} else {
				return nil, errors.New("parent entity is missing acl_from metadata")
			}
		} else {
			resolvedACLFromID = parent.ACLFromID
			resolvedACLFromType = parent.ACLFromType
		}
	} else if entityTypeRequiresParent(params.EntityType) {
		return nil, fmt.Errorf("entity_type %q requires a parent", params.EntityType)
	} else {
		if _, ok := resolveACLResourceTypeForEntityType(params.EntityType); ok {
			entityType := params.EntityType
			entityID := params.ID
			resolvedACLFromID = &entityID
			resolvedACLFromType = &entityType
		}
	}

	metaFields := params.MetaFields
	if metaFields == nil {
		metaFields = map[string]interface{}{}
	}

	mentions := params.MentionedUserIDs
	if mentions == nil {
		mentions = []string{}
	}

	entity := &models.Entity{
		ID:                params.ID,
		WorkspaceID:       params.WorkspaceID,
		EntityType:        params.EntityType,
		ACLFromID:         resolvedACLFromID,
		ACLFromType:       resolvedACLFromType,
		ParentID:          resolvedParentID,
		ParentType:        resolvedParentType,
		CreatorID:         params.CreatorID,
		LastUpdatedByID:   params.LastUpdatedByID,
		ChainRootKeyID:    params.ChainRootKeyID,
		WrappingKeyID:     params.WrappingKeyID,
		WrappingKeyType:   params.WrappingKeyType,
		EntityKeyNonce:    params.EntityKeyNonce,
		WrappedEntityKey:  params.WrappedEntityKey,
		ContentNonce:      params.ContentNonce,
		ContentCiphertext: params.ContentCiphertext,
		ContentHash:       params.ContentHash,
		MetaFields:        datatypes.JSONMap(metaFields),
	}

	if err := entity.SetMentionedUserIDs(mentions); err != nil {
		return nil, fmt.Errorf("failed to encode mentioned_user_ids: %w", err)
	}

	now := time.Now().UTC()
	entity.CreatedAt = now
	entity.UpdatedAt = now

	var creatorACLEntry *models.ACLEntry
	if entity.ACLFromID != nil && entity.ACLFromType != nil &&
		*entity.ACLFromID == entity.ID && *entity.ACLFromType == entity.EntityType {
		if aclResourceType, ok := resolveACLResourceTypeForEntityType(entity.EntityType); ok {
			creatorACLEntry = models.NewACLEntry(
				entity.WorkspaceID,
				aclResourceType,
				entity.ID,
				models.ACLSubjectTypeUser,
				entity.CreatorID,
				models.ACLPermissionAdmin,
			)
		}
	}

	db := s.repository.DB()
	if err := db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(entity).Error; err != nil {
			return err
		}
		if creatorACLEntry != nil {
			if err := tx.Create(creatorACLEntry).Error; err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return nil, err
	}

	if creatorACLEntry != nil && s.effectiveAccessService != nil {
		_ = s.effectiveAccessService.OnACLEntryCreated(creatorACLEntry)
	}

	return entity, nil
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

// Update updates an entity with optimistic locking.
func (s *EntityService) Update(entityID string, workspaceID string, userID string, params models.UpdateEntityParams) (*models.Entity, error) {
	if strings.TrimSpace(entityID) == "" {
		return nil, errors.New("entity id is required")
	}
	if strings.TrimSpace(workspaceID) == "" {
		return nil, errors.New("workspace_id is required")
	}
	if strings.TrimSpace(userID) == "" {
		return nil, errors.New("user id is required")
	}
	if strings.TrimSpace(params.ExpectedHash) == "" {
		return nil, errors.New("expected_hash is required")
	}

	entity, err := s.repository.FindEntityByIDInWorkspace(entityID, workspaceID)
	if err != nil {
		return nil, err
	}

	canWrite, err := s.UserHasWriteAccess(userID, entity)
	if err != nil {
		return nil, err
	}
	if !canWrite {
		return nil, errors.New("access denied: write permission required")
	}

	// Validate encryption envelope (generic requirements).
	if strings.TrimSpace(params.ChainRootKeyID) == "" {
		return nil, errors.New("chain_root_key_id is required")
	}
	if strings.TrimSpace(params.WrappingKeyID) == "" {
		return nil, errors.New("wrapping_key_id is required")
	}
	if strings.TrimSpace(params.WrappingKeyType) == "" {
		return nil, errors.New("wrapping_key_type is required")
	}
	if params.WrappingKeyType == "workspace" && params.WrappingKeyID != params.ChainRootKeyID {
		return nil, errors.New("wrapping_key_id must match chain_root_key_id for workspace wrapping")
	}
	if strings.TrimSpace(params.EntityKeyNonce) == "" {
		return nil, errors.New("entity_key_nonce is required")
	}
	if strings.TrimSpace(params.WrappedEntityKey) == "" {
		return nil, errors.New("wrapped_entity_key is required")
	}
	if strings.TrimSpace(params.ContentNonce) == "" {
		return nil, errors.New("content_nonce is required")
	}
	if strings.TrimSpace(params.ContentCiphertext) == "" {
		return nil, errors.New("content_ciphertext is required")
	}
	if strings.TrimSpace(params.ContentHash) == "" {
		return nil, errors.New("content_hash is required")
	}
	if err := s.validateUpdateByEntityType(entity, params); err != nil {
		return nil, err
	}

	updates := map[string]interface{}{
		"chain_root_key_id":  params.ChainRootKeyID,
		"wrapping_key_id":    params.WrappingKeyID,
		"wrapping_key_type":  params.WrappingKeyType,
		"entity_key_nonce":   params.EntityKeyNonce,
		"wrapped_entity_key": params.WrappedEntityKey,
		"content_nonce":      params.ContentNonce,
		"content_ciphertext": params.ContentCiphertext,
		"content_hash":       params.ContentHash,
		"last_updated_by_id": params.LastUpdatedByID,
		"updated_at":         time.Now().UTC(),
	}

	if params.MetaFieldsProvided {
		metaFields := params.MetaFields
		if metaFields == nil {
			metaFields = map[string]interface{}{}
		}
		updates["meta_fields"] = datatypes.JSONMap(metaFields)
	}

	if params.ParentFieldsProvided {
		// Parent changes are restricted to explicit allowlist types only.
		if !entityTypeAllowsParentChange(entity.EntityType) {
			return nil, errors.New("parent changes are not allowed for this entity type")
		}

		var resolvedParentID *string
		var resolvedParentType *string
		var resolvedACLFromID *string
		var resolvedACLFromType *string

		if params.ParentID != nil && strings.TrimSpace(*params.ParentID) != "" {
			if *params.ParentID == entity.ID {
				return nil, errors.New("parent_id cannot be the entity itself")
			}

			parent, err := s.repository.FindEntityByIDInWorkspace(*params.ParentID, workspaceID)
			if err != nil {
				return nil, err
			}

			canWriteParent, err := s.UserHasWriteAccess(userID, parent)
			if err != nil {
				return nil, err
			}
			if !canWriteParent {
				return nil, errors.New("access denied: write permission required for parent")
			}

			if params.ParentType != nil && strings.TrimSpace(*params.ParentType) != "" && *params.ParentType != parent.EntityType {
				return nil, errors.New("parent_type does not match parent entity type")
			}

			parentID := parent.ID
			parentType := parent.EntityType
			resolvedParentID = &parentID
			resolvedParentType = &parentType

			if parent.ACLFromID == nil || parent.ACLFromType == nil {
				return nil, errors.New("parent entity is missing acl_from metadata")
			}
			resolvedACLFromID = parent.ACLFromID
			resolvedACLFromType = parent.ACLFromType
		} else {
			if params.ParentType != nil && strings.TrimSpace(*params.ParentType) != "" {
				return nil, errors.New("parent_type cannot be set without parent_id")
			}

			// Clearing the parent resets ACL roots back to the entity itself.
			if _, ok := resolveACLResourceTypeForEntityType(entity.EntityType); ok {
				entityID := entity.ID
				entityType := entity.EntityType
				resolvedACLFromID = &entityID
				resolvedACLFromType = &entityType
			}
		}

		updates["parent_id"] = resolvedParentID
		updates["parent_type"] = resolvedParentType
		updates["acl_from_id"] = resolvedACLFromID
		updates["acl_from_type"] = resolvedACLFromType
	}

	if params.MentionedUserIDs != nil {
		tempEntity := &models.Entity{}
		if err := tempEntity.SetMentionedUserIDs(*params.MentionedUserIDs); err != nil {
			return nil, fmt.Errorf("failed to encode mentioned_user_ids: %w", err)
		}
		updates["mentioned_user_ids"] = tempEntity.MentionedUserIDsJSON
	}

	return s.repository.UpdateEntity(entityID, updates, params.ExpectedHash)
}

// ---------------------------------------------------------------------------
// Access Control
// ---------------------------------------------------------------------------

// UserHasReadAccess checks if a user can read the entity.
func (s *EntityService) UserHasReadAccess(userID string, entity *models.Entity) (bool, error) {
	accessCache := make(map[string]bool)
	return s.userHasReadAccessWithCache(userID, entity, accessCache)
}

// UserHasWriteAccess checks if a user can write/update the entity.
func (s *EntityService) UserHasWriteAccess(userID string, entity *models.Entity) (bool, error) {
	if entity == nil {
		return false, errors.New("entity is required")
	}

	// Creator has write access by default.
	if entity.CreatorID == userID {
		return true, nil
	}

	switch entity.EntityType {
	case "note":
		return false, nil
	case "direct-message":
		// Only sender (creator) can modify direct messages.
		return false, nil
	case "user-profile":
		// Only the creator may update their profile (handled by creator check above).
		return false, nil
	}

	if entity.ACLFromID != nil && entity.ACLFromType != nil {
		resourceType, ok := resolveACLResourceTypeForEntityType(*entity.ACLFromType)
		if !ok {
			return false, nil
		}
		if s.aclService == nil {
			return false, errors.New("acl service is not configured")
		}
		return s.aclService.UserHasWriteAccessToResource(userID, resourceType, *entity.ACLFromID)
	}

	return false, nil
}

// UserHasAccess checks if a user can read an entity.
// This mirrors the access rules used for entity queries (creator-only, direct messages, ACL).
func (s *EntityService) UserHasAccess(userID string, entity *models.Entity) (bool, error) {
	accessCache := make(map[string]bool)
	return s.userHasReadAccessWithCache(userID, entity, accessCache)
}

// UpdateMetaFields updates only the meta_fields payload for an entity.
// This is used by server-owned workflows like file upload completion.
func (s *EntityService) UpdateMetaFields(entityID string, metaFields map[string]interface{}) (*models.Entity, error) {
	if strings.TrimSpace(entityID) == "" {
		return nil, errors.New("entity id is required")
	}
	if metaFields == nil {
		metaFields = map[string]interface{}{}
	}

	updates := map[string]interface{}{
		"meta_fields": datatypes.JSONMap(metaFields),
		"updated_at":  time.Now().UTC(),
	}

	return s.repository.UpdateEntity(entityID, updates, "")
}

// ResolveAccessContext builds the access context used for SSE broadcasts.
func (s *EntityService) ResolveAccessContext(entity *models.Entity) (*EntityAccessContext, error) {
	if entity == nil {
		return nil, errors.New("entity is required")
	}

	switch entity.EntityType {
	case "note":
		return &EntityAccessContext{
			AccessType: EntityAccessTypeCreatorOnly,
			CreatorID:  entity.CreatorID,
		}, nil
	case "user-profile":
		return &EntityAccessContext{
			AccessType: EntityAccessTypeCreatorOnly,
			CreatorID:  entity.CreatorID,
		}, nil
	}

	if participantIDs, hasDirectMessageAccess, err := s.resolveDirectMessageParticipantIDs(entity); err != nil {
		return nil, err
	} else if hasDirectMessageAccess {
		return &EntityAccessContext{
			AccessType:                  EntityAccessTypeDirectMessage,
			CreatorID:                   entity.CreatorID,
			DirectMessageParticipantIDs: participantIDs,
		}, nil
	}

	if entity.ACLFromID != nil && entity.ACLFromType != nil {
		resourceType, ok := resolveACLResourceTypeForEntityType(*entity.ACLFromType)
		if !ok {
			return nil, fmt.Errorf("unsupported acl_from_type %q", *entity.ACLFromType)
		}
		return &EntityAccessContext{
			AccessType:      EntityAccessTypeACL,
			ACLResourceType: resourceType,
			ACLResourceID:   *entity.ACLFromID,
			CreatorID:       entity.CreatorID,
		}, nil
	}

	return &EntityAccessContext{
		AccessType: EntityAccessTypeCreatorOnly,
		CreatorID:  entity.CreatorID,
	}, nil
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

// EntityQueryNode represents a logical query tree for entities.
type EntityQueryNode struct {
	Type     string            `json:"type"`
	Field    string            `json:"field,omitempty"`
	Operator string            `json:"operator,omitempty"`
	Value    interface{}       `json:"value,omitempty"`
	Children []EntityQueryNode `json:"children,omitempty"`
}

// QueryEntities executes a predicate query and filters by access.
func (s *EntityService) QueryEntities(workspaceID string, userID string, query EntityQueryNode) ([]*models.Entity, error) {
	whereClause, args, err := buildEntityQueryClause(query)
	if err != nil {
		return nil, err
	}

	entities, err := s.repository.QueryEntities(workspaceID, whereClause, args)
	if err != nil {
		return nil, err
	}

	aclCache := make(map[string]bool)
	filtered := make([]*models.Entity, 0, len(entities))
	for _, entity := range entities {
		hasAccess, err := s.userHasReadAccessWithCache(userID, entity, aclCache)
		if err != nil {
			return nil, err
		}
		if hasAccess {
			filtered = append(filtered, entity)
		}
	}

	return filtered, nil
}

// ---------------------------------------------------------------------------
// Query Builder
// ---------------------------------------------------------------------------

var entityQueryFieldToColumn = map[string]string{
	"id":                 "id",
	"workspace_id":       "workspace_id",
	"entity_type":        "entity_type",
	"acl_from_id":        "acl_from_id",
	"acl_from_type":      "acl_from_type",
	"parent_id":          "parent_id",
	"parent_type":        "parent_type",
	"creator_id":         "creator_id",
	"last_updated_by_id": "last_updated_by_id",
	"chain_root_key_id":  "chain_root_key_id",
	"wrapping_key_id":    "wrapping_key_id",
	"wrapping_key_type":  "wrapping_key_type",
	"entity_key_nonce":   "entity_key_nonce",
	"wrapped_entity_key": "wrapped_entity_key",
	"content_nonce":      "content_nonce",
	"content_ciphertext": "content_ciphertext",
	"content_hash":       "content_hash",
	"created_at":         "created_at",
	"updated_at":         "updated_at",
}

func buildEntityQueryClause(node EntityQueryNode) (string, []interface{}, error) {
	if strings.TrimSpace(node.Type) == "" {
		return "", nil, errors.New("query type is required")
	}

	switch node.Type {
	case "predicate":
		column, ok := entityQueryFieldToColumn[node.Field]
		if !ok {
			return "", nil, fmt.Errorf("unsupported query field %q", node.Field)
		}

		switch node.Operator {
		case "eq":
			return fmt.Sprintf("%s = ?", column), []interface{}{node.Value}, nil
		case "ne":
			return fmt.Sprintf("%s <> ?", column), []interface{}{node.Value}, nil
		case "in":
			values, err := normalizeQuerySlice(node.Value)
			if err != nil {
				return "", nil, err
			}
			return fmt.Sprintf("%s IN ?", column), []interface{}{values}, nil
		case "not_in":
			values, err := normalizeQuerySlice(node.Value)
			if err != nil {
				return "", nil, err
			}
			return fmt.Sprintf("%s NOT IN ?", column), []interface{}{values}, nil
		case "is_null":
			return fmt.Sprintf("%s IS NULL", column), nil, nil
		case "is_not_null":
			return fmt.Sprintf("%s IS NOT NULL", column), nil, nil
		default:
			return "", nil, fmt.Errorf("unsupported operator %q", node.Operator)
		}

	case "group":
		if len(node.Children) == 0 {
			return "", nil, errors.New("group query requires children")
		}
		logicalOperator := strings.ToUpper(strings.TrimSpace(node.Operator))
		if logicalOperator != "AND" && logicalOperator != "OR" {
			return "", nil, fmt.Errorf("unsupported group operator %q", node.Operator)
		}

		clauses := make([]string, 0, len(node.Children))
		args := make([]interface{}, 0)
		for _, child := range node.Children {
			childClause, childArgs, err := buildEntityQueryClause(child)
			if err != nil {
				return "", nil, err
			}
			clauses = append(clauses, fmt.Sprintf("(%s)", childClause))
			args = append(args, childArgs...)
		}
		return strings.Join(clauses, fmt.Sprintf(" %s ", logicalOperator)), args, nil
	default:
		return "", nil, fmt.Errorf("unsupported query type %q", node.Type)
	}
}

func normalizeQuerySlice(value interface{}) ([]interface{}, error) {
	if rawSlice, ok := value.([]interface{}); ok {
		return rawSlice, nil
	}
	if stringSlice, ok := value.([]string); ok {
		values := make([]interface{}, 0, len(stringSlice))
		for _, item := range stringSlice {
			values = append(values, item)
		}
		return values, nil
	}
	return nil, errors.New("value must be an array for in/not_in operators")
}

// ---------------------------------------------------------------------------
// Access Helpers
// ---------------------------------------------------------------------------

func (s *EntityService) userHasReadAccessWithCache(userID string, entity *models.Entity, cache map[string]bool) (bool, error) {
	if entity == nil {
		return false, errors.New("entity is required")
	}

	if entity.CreatorID == userID {
		return true, nil
	}

	switch entity.EntityType {
	case "note":
		return false, nil
	case "user-profile":
		return true, nil
	}

	if entity.ParentType != nil && *entity.ParentType == "direct-message" && entity.ParentID != nil {
		parentID := strings.TrimSpace(*entity.ParentID)
		if parentID != "" {
			cacheKey := fmt.Sprintf("dm:%s:%s", userID, parentID)
			if cached, ok := cache[cacheKey]; ok {
				return cached, nil
			}
			participantIDs, hasDirectMessageAccess, err := s.resolveDirectMessageParticipantIDs(entity)
			if err != nil {
				return false, err
			}
			if hasDirectMessageAccess {
				hasAccess := includesParticipantID(participantIDs, userID)
				cache[cacheKey] = hasAccess
				return hasAccess, nil
			}
		}
	}

	if participantIDs, hasDirectMessageAccess, err := s.resolveDirectMessageParticipantIDs(entity); err != nil {
		return false, err
	} else if hasDirectMessageAccess {
		return includesParticipantID(participantIDs, userID), nil
	}

	if entity.ACLFromID != nil && entity.ACLFromType != nil {
		resourceType, ok := resolveACLResourceTypeForEntityType(*entity.ACLFromType)
		if !ok {
			return false, nil
		}
		if s.aclService == nil {
			return false, errors.New("acl service is not configured")
		}

		cacheKey := fmt.Sprintf("%s:%s:%s", userID, resourceType, *entity.ACLFromID)
		if cached, ok := cache[cacheKey]; ok {
			return cached, nil
		}
		hasAccess, err := s.aclService.UserHasAccessToResource(userID, resourceType, *entity.ACLFromID)
		if err != nil {
			return false, err
		}
		cache[cacheKey] = hasAccess
		return hasAccess, nil
	}

	return false, nil
}

func (s *EntityService) resolveDirectMessageParticipantIDs(entity *models.Entity) ([]string, bool, error) {
	if entity == nil {
		return nil, false, errors.New("entity is required")
	}

	if entity.EntityType == "direct-message" {
		recipientID, err := resolveDirectMessageRecipientID(entity.MetaFields)
		if err != nil {
			return nil, false, err
		}
		return []string{entity.CreatorID, recipientID}, true, nil
	}

	if entity.ParentType == nil || *entity.ParentType != "direct-message" || entity.ParentID == nil {
		return nil, false, nil
	}
	parentID := strings.TrimSpace(*entity.ParentID)
	if parentID == "" {
		return nil, false, nil
	}
	if strings.TrimSpace(entity.WorkspaceID) == "" {
		return nil, false, errors.New("workspace_id is required to resolve direct-message parent access")
	}

	parent, err := s.repository.FindEntityByIDInWorkspace(parentID, entity.WorkspaceID)
	if err != nil {
		return nil, false, err
	}
	recipientID, err := resolveDirectMessageRecipientID(parent.MetaFields)
	if err != nil {
		return nil, false, err
	}
	return []string{parent.CreatorID, recipientID}, true, nil
}

func includesParticipantID(participantIDs []string, userID string) bool {
	for _, participantID := range participantIDs {
		if participantID == userID {
			return true
		}
	}
	return false
}

func resolveDirectMessageRecipientID(metaFields datatypes.JSONMap) (string, error) {
	rawRecipient, ok := metaFields["recipient_id"]
	if !ok {
		return "", errors.New("direct-message meta_fields.recipient_id is required")
	}
	recipientID, ok := rawRecipient.(string)
	if !ok || strings.TrimSpace(recipientID) == "" {
		return "", errors.New("direct-message meta_fields.recipient_id must be a string")
	}
	return recipientID, nil
}
