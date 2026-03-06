package services

import (
	"errors"

	"shape/models"
	"shape/repositories"

	"github.com/google/uuid"
)

// EntityBlockService provides business logic for managing entity blocks.
// It uses the EntityBlockRepository for data access and adds validation,
// business rules, and compaction threshold logic on top.
//
// Entity blocks store encrypted Yjs deltas that represent incremental
// changes to an entity's collaborative content. Access to blocks inherits
// from the parent entity's access control.
type EntityBlockService struct {
	repo repositories.EntityBlockRepository
}

// NewEntityBlockService creates a new entity block service with the given repository.
func NewEntityBlockService(repo repositories.EntityBlockRepository) *EntityBlockService {
	return &EntityBlockService{repo: repo}
}

// CreateEntityBlockParams holds parameters for creating a new entity block.
type CreateEntityBlockParams struct {
	// EntityID is the parent entity this block belongs to.
	EntityID string
	// EntityType identifies what kind of entity owns this block ("paper", "note", "task").
	EntityType models.EntityBlockType
	// EntityField identifies which field of the entity this block is for.
	// For papers this is always "text". For tasks it could be "description".
	EntityField string
	// AuthorID is the user creating this block.
	AuthorID string
	// EncryptedData is the serialized RealtimeBlock protobuf (raw bytes).
	EncryptedData []byte
}

// Create creates a new entity block with the given parameters.
// Returns the created block and the total block count for the entity.
// The block count can be used to determine if compaction should be triggered.
//
// Validation:
// - EntityID is required
// - EntityType is required
// - AuthorID is required
// - EncryptedData must not be empty
func (s *EntityBlockService) Create(params CreateEntityBlockParams) (*models.EntityBlock, int64, error) {
	// Validate required fields.
	if params.EntityID == "" {
		return nil, 0, errors.New("entity_id is required")
	}
	if params.EntityType == "" {
		return nil, 0, errors.New("entity_type is required")
	}
	if params.AuthorID == "" {
		return nil, 0, errors.New("author_id is required")
	}
	if len(params.EncryptedData) == 0 {
		return nil, 0, errors.New("encrypted_data is required")
	}

	// Default entity_field to "text" if not specified.
	entityField := params.EntityField
	if entityField == "" {
		entityField = "text"
	}

	// Create the block with a new UUID.
	block := &models.EntityBlock{
		ID:            uuid.NewString(),
		EntityID:      params.EntityID,
		EntityType:    params.EntityType,
		EntityField:   entityField,
		AuthorID:      params.AuthorID,
		EncryptedData: params.EncryptedData,
		DataVersion:   "yjs-v1",
	}

	if err := s.repo.CreateEntityBlock(block); err != nil {
		return nil, 0, err
	}

	// Get block count for potential compaction trigger.
	// Don't fail if count retrieval fails - just return 0.
	count, err := s.repo.CountEntityBlocksForEntity(params.EntityID, params.EntityType, entityField)
	if err != nil {
		count = 0
	}

	return block, count, nil
}

// GetByID loads a single entity block by ID.
// This is used by unified sync to hydrate block payloads after change log lookup.
func (s *EntityBlockService) GetByID(blockID string) (*models.EntityBlock, error) {
	if blockID == "" {
		return nil, errors.New("block_id is required")
	}
	return s.repo.FindEntityBlockByID(blockID)
}

// GetBlocksForEntity returns all blocks for an entity, ordered by creation time.
// This is used when loading an entity to reconstruct the document state
// by applying all deltas in chronological order.
func (s *EntityBlockService) GetBlocksForEntity(entityID string, entityType models.EntityBlockType, entityField string) ([]*models.EntityBlock, error) {
	// Default entity_field to "text" if not specified.
	if entityField == "" {
		entityField = "text"
	}
	return s.repo.FindEntityBlocksByEntityID(entityID, entityType, entityField)
}

// GetBlockCount returns the number of blocks for an entity.
// Used to check if compaction is needed (>EntityBlockCompactionThreshold blocks).
func (s *EntityBlockService) GetBlockCount(entityID string, entityType models.EntityBlockType, entityField string) (int64, error) {
	// Default entity_field to "text" if not specified.
	if entityField == "" {
		entityField = "text"
	}
	return s.repo.CountEntityBlocksForEntity(entityID, entityType, entityField)
}

// CompactBlocks merges all blocks for an entity into a single block.
// This is called asynchronously when an entity exceeds EntityBlockCompactionThreshold blocks.
//
// The compaction process:
// 1. Begins a database transaction
// 2. Deletes all existing blocks for the entity
// 3. Creates a new block containing the merged encrypted data
// 4. Commits the transaction
//
// Note: The actual delta merging (combining Yjs updates) happens client-side.
// The server receives the already-merged encrypted data and performs the
// atomic replacement in the database.
//
// Parameters:
// - entityID: The entity whose blocks should be compacted
// - entityType: The type of entity ("paper", "note", "task")
// - entityField: The field within the entity (usually "text")
// - authorID: The user performing the compaction (becomes the author of the compacted block)
// - mergedData: The pre-merged encrypted data from the client
func (s *EntityBlockService) CompactBlocks(entityID string, entityType models.EntityBlockType, entityField string, authorID string, mergedData []byte) error {
	// Default entity_field to "text" if not specified.
	if entityField == "" {
		entityField = "text"
	}

	compactedBlock := &models.EntityBlock{
		ID:            uuid.NewString(),
		EntityID:      entityID,
		EntityType:    entityType,
		EntityField:   entityField,
		AuthorID:      authorID,
		EncryptedData: mergedData,
		DataVersion:   "yjs-v1",
	}

	return s.repo.ReplaceAllEntityBlocksWithCompactedBlock(entityID, entityType, entityField, compactedBlock)
}

// DeleteForEntity deletes all blocks for an entity.
// Used when deleting an entity to clean up associated block data.
func (s *EntityBlockService) DeleteForEntity(entityID string, entityType models.EntityBlockType, entityField string) error {
	// Default entity_field to "text" if not specified.
	if entityField == "" {
		entityField = "text"
	}
	return s.repo.DeleteAllEntityBlocksForEntity(entityID, entityType, entityField)
}

// GetByIDsForUser fetches multiple entity blocks by ID, filtered to those the user has access to.
// Block access follows entity access - user needs access to the parent entity.
// Uses effective_resource_access on the parent entity for ACL filtering.
//
// This method is used by sync handlers to batch-fetch entities and avoid N+1 queries.
// It joins with the appropriate parent table to verify access through either:
// - Direct ownership (entity's creator_id = userID)
// - Explicit access grant (effective_resource_access entry exists)
func (s *EntityBlockService) GetByIDsForUser(ids []string, userID string, entityType models.EntityBlockType) ([]*models.EntityBlock, error) {
	if len(ids) == 0 {
		return []*models.EntityBlock{}, nil
	}

	return s.repo.FindEntityBlocksByIDsWithParentAccess(ids, userID, entityType)
}
