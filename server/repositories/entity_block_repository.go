// Package repositories provides data access abstractions for the Shape server.
// Repositories handle ONLY database operations - no business logic, validation, or ACL checks.
// Business logic belongs in the service layer (services package).
package repositories

import (
	"fmt"

	"shape/models"

	"gorm.io/gorm"
)

// EntityBlockRepository defines the data access interface for entity blocks.
// Entity blocks are a generic mechanism for storing collaborative content (Yjs deltas)
// for any entity type (papers, notes, tasks, etc.).
//
// All methods are low-level database operations without business logic.
// Access control and validation are handled by the service layer.
type EntityBlockRepository interface {
	// CreateEntityBlock inserts a new entity block into the database.
	// The block must have all required fields populated (ID, EntityID, EntityType, AuthorID, EncryptedData).
	CreateEntityBlock(block *models.EntityBlock) error

	// FindEntityBlockByID retrieves a single entity block by its unique identifier.
	// Returns nil and no error if the block does not exist.
	FindEntityBlockByID(id string) (*models.EntityBlock, error)

	// FindEntityBlocksByEntityID retrieves all blocks for a specific entity.
	// Results are ordered by creation time ascending (oldest first) to allow
	// proper reconstruction of the document state by applying deltas in order.
	FindEntityBlocksByEntityID(entityID string, entityType models.EntityBlockType, entityField string) ([]*models.EntityBlock, error)

	// FindEntityBlocksByIDsWithParentAccess fetches entity blocks by IDs, filtered by access.
	// This method joins with the appropriate parent table (based on entityType) to verify
	// that the user has access to the parent entity.
	//
	// Access is granted if:
	// - The user is the entity's creator (creator_id = userID), OR
	// - The user has an entry in effective_resource_access for the parent entity.
	//
	// This is the primary method used by sync handlers to batch-fetch blocks efficiently.
	FindEntityBlocksByIDsWithParentAccess(ids []string, userID string, entityType models.EntityBlockType) ([]*models.EntityBlock, error)

	// CountEntityBlocksForEntity returns the total number of blocks for an entity.
	// Used to determine if compaction is needed (typically at >1000 blocks).
	CountEntityBlocksForEntity(entityID string, entityType models.EntityBlockType, entityField string) (int64, error)

	// DeleteAllEntityBlocksForEntity removes all blocks associated with an entity.
	// Used when deleting an entity or during compaction.
	DeleteAllEntityBlocksForEntity(entityID string, entityType models.EntityBlockType, entityField string) error

	// ReplaceAllEntityBlocksWithCompactedBlock atomically replaces all blocks for an entity
	// with a single compacted block. This operation:
	// 1. Begins a transaction
	// 2. Deletes all existing blocks for the entity
	// 3. Inserts the new compacted block
	// 4. Commits the transaction
	// If any step fails, the entire operation is rolled back.
	ReplaceAllEntityBlocksWithCompactedBlock(entityID string, entityType models.EntityBlockType, entityField string, compactedBlock *models.EntityBlock) error
}

// entityBlockRepositoryImpl is the concrete implementation of EntityBlockRepository.
// It uses GORM for database operations.
type entityBlockRepositoryImpl struct {
	RepositoryBase
}

// NewEntityBlockRepository creates a new entity block repository with the given database connection.
func NewEntityBlockRepository(db *gorm.DB) EntityBlockRepository {
	return &entityBlockRepositoryImpl{
		RepositoryBase: NewRepositoryBase(db),
	}
}

// CreateEntityBlock inserts a new entity block into the database.
func (r *entityBlockRepositoryImpl) CreateEntityBlock(block *models.EntityBlock) error {
	return r.db.Create(block).Error
}

// FindEntityBlockByID retrieves a single entity block by its unique identifier.
// Returns nil and gorm.ErrRecordNotFound if the block does not exist.
func (r *entityBlockRepositoryImpl) FindEntityBlockByID(id string) (*models.EntityBlock, error) {
	var block models.EntityBlock
	if err := r.db.Where("id = ?", id).First(&block).Error; err != nil {
		return nil, err
	}
	return &block, nil
}

// FindEntityBlocksByEntityID retrieves all blocks for an entity, ordered by creation time.
// Blocks are returned in ascending order (oldest first) so they can be applied
// sequentially to reconstruct the document state.
func (r *entityBlockRepositoryImpl) FindEntityBlocksByEntityID(entityID string, entityType models.EntityBlockType, entityField string) ([]*models.EntityBlock, error) {
	var blocks []*models.EntityBlock
	err := r.db.Where("entity_id = ? AND entity_type = ? AND entity_field = ?", entityID, entityType, entityField).
		Order("created_at ASC").
		Find(&blocks).Error
	if err != nil {
		return nil, err
	}
	return blocks, nil
}

// FindEntityBlocksByIDsWithParentAccess fetches entity blocks by IDs, verifying parent entity access.
// In the v2 model, all access is derived from the unified entities table:
// - Creator always has access.
// - ACL-backed entities check effective_resource_access against the ACL root.
//
// The ACL root type is derived from entity.acl_from_type using a CASE mapping so
// we never trust raw entity types as resource_type values.
func (r *entityBlockRepositoryImpl) FindEntityBlocksByIDsWithParentAccess(ids []string, userID string, entityType models.EntityBlockType) ([]*models.EntityBlock, error) {
	// Handle empty input gracefully - return empty slice, not nil.
	if len(ids) == 0 {
		return []*models.EntityBlock{}, nil
	}

	var blocks []*models.EntityBlock
	expectedEntityType, err := mapBlockEntityTypeToEntityType(entityType)
	if err != nil {
		return nil, err
	}

	query := `
		SELECT eb.*
		FROM entity_blocks eb
		INNER JOIN entities e ON e.id = eb.entity_id
		LEFT JOIN effective_resource_access era
			ON era.user_id = ?
			AND era.resource_id = e.acl_from_id
			AND era.resource_type = CASE e.acl_from_type
				WHEN 'project' THEN 'project'
				WHEN 'group-chat' THEN 'group_chat'
				WHEN 'folder' THEN 'folder'
				WHEN 'file' THEN 'file'
				WHEN 'paper' THEN 'paper'
				WHEN 'forum-channel' THEN 'forum_channel'
				ELSE ''
			END
		WHERE eb.id IN ?
			AND eb.entity_type = ?
			AND e.entity_type = ?
			AND (
				e.creator_id = ?
				OR (e.acl_from_id IS NOT NULL AND era.user_id IS NOT NULL)
			)
	`

	err = r.db.Raw(query, userID, ids, entityType, expectedEntityType, userID).Scan(&blocks).Error
	if err != nil {
		return nil, err
	}
	return blocks, nil
}

func mapBlockEntityTypeToEntityType(entityType models.EntityBlockType) (string, error) {
	switch entityType {
	case models.EntityBlockTypePaper:
		return "paper", nil
	case models.EntityBlockTypeNote:
		return "note", nil
	case models.EntityBlockTypeTask:
		return "task", nil
	default:
		return "", fmt.Errorf("unsupported entity type for access check: %s", entityType)
	}
}

// CountEntityBlocksForEntity returns the number of blocks for an entity.
// This count is used to determine when compaction should be triggered.
func (r *entityBlockRepositoryImpl) CountEntityBlocksForEntity(entityID string, entityType models.EntityBlockType, entityField string) (int64, error) {
	var count int64
	err := r.db.Model(&models.EntityBlock{}).
		Where("entity_id = ? AND entity_type = ? AND entity_field = ?", entityID, entityType, entityField).
		Count(&count).Error
	if err != nil {
		return 0, err
	}
	return count, nil
}

// DeleteAllEntityBlocksForEntity removes all blocks for a given entity.
// This is used when:
// - Deleting an entity entirely
// - As part of the compaction process (within a transaction)
func (r *entityBlockRepositoryImpl) DeleteAllEntityBlocksForEntity(entityID string, entityType models.EntityBlockType, entityField string) error {
	return r.db.Where("entity_id = ? AND entity_type = ? AND entity_field = ?", entityID, entityType, entityField).
		Delete(&models.EntityBlock{}).Error
}

// ReplaceAllEntityBlocksWithCompactedBlock atomically replaces all blocks with a single compacted block.
// This is the core compaction operation that:
// 1. Starts a database transaction
// 2. Deletes all existing blocks for the entity
// 3. Creates the new compacted block
// 4. Commits the transaction (or rolls back on any error)
//
// The atomicity ensures that clients never see a partial state where some blocks
// are deleted but the compacted block doesn't exist yet.
func (r *entityBlockRepositoryImpl) ReplaceAllEntityBlocksWithCompactedBlock(entityID string, entityType models.EntityBlockType, entityField string, compactedBlock *models.EntityBlock) error {
	tx := r.db.Begin()
	if err := tx.Error; err != nil {
		return err
	}

	// Check if there are any existing blocks to compact.
	// If not, we don't need to do anything.
	var existingCount int64
	err := tx.Model(&models.EntityBlock{}).
		Where("entity_id = ? AND entity_type = ? AND entity_field = ?", entityID, entityType, entityField).
		Count(&existingCount).Error
	if err != nil {
		tx.Rollback()
		return err
	}

	// If no blocks exist, nothing to compact - rollback (no-op) and return.
	if existingCount == 0 {
		tx.Rollback()
		return nil
	}

	// Delete all existing blocks for this entity.
	err = tx.Where("entity_id = ? AND entity_type = ? AND entity_field = ?", entityID, entityType, entityField).
		Delete(&models.EntityBlock{}).Error
	if err != nil {
		tx.Rollback()
		return err
	}

	// Insert the new compacted block.
	if err := tx.Create(compactedBlock).Error; err != nil {
		tx.Rollback()
		return err
	}

	// Commit the transaction.
	return tx.Commit().Error
}
