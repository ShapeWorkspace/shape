package services

import (
	"shape/models"

	"gorm.io/gorm"
)

// EntityClosureService provides methods for managing entity closure relationships.
// Used for ACL inheritance between entities (e.g., files inheriting from folders).
type EntityClosureService struct {
	db *gorm.DB
}

// NewEntityClosureService creates a new EntityClosureService instance.
func NewEntityClosureService(db *gorm.DB) *EntityClosureService {
	return &EntityClosureService{db: db}
}

// CreateParentEntity adds a self-reference entry for an entity that can be a parent.
// This is called when creating folders, projects, forum channels, etc.
// If the entity has a parent, also adds inheritance entries from the parent's ancestors.
func (s *EntityClosureService) CreateParentEntity(
	workspaceID string,
	entityType string,
	entityID string,
	parentType string,
	parentID string,
) error {
	if parentID == "" {
		// Root entity - just self-reference
		return s.db.Create(&models.EntityClosure{
			WorkspaceID:    workspaceID,
			AncestorType:   entityType,
			AncestorID:     entityID,
			DescendantType: entityType,
			DescendantID:   entityID,
			Depth:          0,
		}).Error
	}

	// Has parent - self-reference + parent's ancestry
	// Use explicit UUID casts for PostgreSQL type compatibility in UNION ALL.
	query := `
		INSERT INTO entity_closure (workspace_id, ancestor_type, ancestor_id, descendant_type, descendant_id, depth, created_at)
		-- Self reference
		SELECT ?::uuid, ?, ?::uuid, ?, ?::uuid, 0, NOW()
		UNION ALL
		-- Parent's ancestors with depth+1
		SELECT ?::uuid, ancestor_type, ancestor_id, ?, ?::uuid, depth + 1, NOW()
		FROM entity_closure
		WHERE descendant_type = ? AND descendant_id = ?::uuid
	`
	if s.db.Dialector.Name() != "postgres" {
		// SQLite (and others) don't support ::uuid casts or NOW().
		query = `
			INSERT INTO entity_closure (workspace_id, ancestor_type, ancestor_id, descendant_type, descendant_id, depth, created_at)
			-- Self reference
			SELECT ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP
			UNION ALL
			-- Parent's ancestors with depth+1
			SELECT ?, ancestor_type, ancestor_id, ?, ?, depth + 1, CURRENT_TIMESTAMP
			FROM entity_closure
			WHERE descendant_type = ? AND descendant_id = ?
		`
	}
	return s.db.Exec(query,
		workspaceID, entityType, entityID, entityType, entityID,
		workspaceID, entityType, entityID, parentType, parentID,
	).Error
}

// CreateChildEntity adds closure entries for an entity that inherits from a parent.
// This is called when creating files, tasks, forum messages, etc.
// The entity does NOT get a self-reference (only parent entities do).
func (s *EntityClosureService) CreateChildEntity(
	workspaceID string,
	entityType string,
	entityID string,
	parentType string,
	parentID string,
) error {
	if parentID == "" {
		// No parent - no closure entries needed for child entities
		return nil
	}

	// Copy all parent's ancestors with depth+1
	// Use explicit UUID casts for PostgreSQL type compatibility.
	query := `
		INSERT INTO entity_closure (workspace_id, ancestor_type, ancestor_id, descendant_type, descendant_id, depth, created_at)
		SELECT ?::uuid, ancestor_type, ancestor_id, ?, ?::uuid, depth + 1, NOW()
		FROM entity_closure
		WHERE descendant_type = ? AND descendant_id = ?::uuid
	`
	if s.db.Dialector.Name() != "postgres" {
		query = `
			INSERT INTO entity_closure (workspace_id, ancestor_type, ancestor_id, descendant_type, descendant_id, depth, created_at)
			SELECT ?, ancestor_type, ancestor_id, ?, ?, depth + 1, CURRENT_TIMESTAMP
			FROM entity_closure
			WHERE descendant_type = ? AND descendant_id = ?
		`
	}
	return s.db.Exec(query, workspaceID, entityType, entityID, parentType, parentID).Error
}

// DeleteEntity removes all closure entries where the entity is an ancestor or descendant.
// This should be called when deleting any entity.
func (s *EntityClosureService) DeleteEntity(entityType, entityID string) error {
	return s.db.Exec(`
		DELETE FROM entity_closure
		WHERE (ancestor_type = ? AND ancestor_id = ?)
		   OR (descendant_type = ? AND descendant_id = ?)
	`, entityType, entityID, entityType, entityID).Error
}

// GetAncestors returns all ancestors of an entity, ordered by depth (closest first).
// Used for permission checks - to find all entities that might grant access.
func (s *EntityClosureService) GetAncestors(entityType, entityID string) ([]models.EntityClosure, error) {
	var ancestors []models.EntityClosure
	err := s.db.Where("descendant_type = ? AND descendant_id = ? AND depth > 0", entityType, entityID).
		Order("depth ASC").
		Find(&ancestors).Error
	return ancestors, err
}

// GetDescendants returns all descendants of an entity, ordered by depth (closest first).
// Used for cache invalidation - to find all entities affected by an ACL change.
func (s *EntityClosureService) GetDescendants(entityType, entityID string) ([]models.EntityClosure, error) {
	var descendants []models.EntityClosure
	err := s.db.Where("ancestor_type = ? AND ancestor_id = ? AND depth > 0", entityType, entityID).
		Order("depth ASC").
		Find(&descendants).Error
	return descendants, err
}

// GetDescendantIDs returns just the type and ID of all descendants.
// This is a lighter-weight version of GetDescendants for cache invalidation.
func (s *EntityClosureService) GetDescendantIDs(entityType, entityID string) ([]struct {
	Type string
	ID   string
}, error) {
	var results []struct {
		Type string
		ID   string
	}
	err := s.db.Raw(`
		SELECT descendant_type as Type, descendant_id as ID
		FROM entity_closure
		WHERE ancestor_type = ? AND ancestor_id = ? AND depth > 0
	`, entityType, entityID).Scan(&results).Error
	return results, err
}

// MoveEntity updates closure entries when an entity is moved to a new parent.
// This is a complex operation that requires:
// 1. Finding all descendants of the moved entity
// 2. Removing old ancestor relationships for all descendants
// 3. Adding new ancestor relationships based on new parent
func (s *EntityClosureService) MoveEntity(
	workspaceID string,
	entityType string,
	entityID string,
	newParentType string,
	newParentID string,
) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		// Get all descendants (including self if it's a parent entity)
		var descendantIDs []string
		var descendantTypes []string

		if err := tx.Raw(`
			SELECT descendant_type, descendant_id
			FROM entity_closure
			WHERE ancestor_type = ? AND ancestor_id = ?
		`, entityType, entityID).Scan(&struct {
			Types []string
			IDs   []string
		}{descendantTypes, descendantIDs}).Error; err != nil {
			return err
		}

		// For the entity itself: delete all ancestor relationships except self-reference
		if err := tx.Exec(`
			DELETE FROM entity_closure
			WHERE descendant_type = ? AND descendant_id = ? AND depth > 0
		`, entityType, entityID).Error; err != nil {
			return err
		}

		// For each descendant: recalculate based on new parent
		// This is complex - for now, we'll delete all and recreate
		// A more efficient implementation could update depths

		if newParentID == "" {
			// Moved to root - no ancestors
			return nil
		}

		// Add new ancestor relationships from new parent
		// Use explicit UUID casts for PostgreSQL type compatibility.
		query := `
			INSERT INTO entity_closure (workspace_id, ancestor_type, ancestor_id, descendant_type, descendant_id, depth, created_at)
			SELECT ?::uuid, ancestor_type, ancestor_id, ?, ?::uuid, depth + 1, NOW()
			FROM entity_closure
			WHERE descendant_type = ? AND descendant_id = ?::uuid
		`
		if s.db.Dialector.Name() != "postgres" {
			query = `
				INSERT INTO entity_closure (workspace_id, ancestor_type, ancestor_id, descendant_type, descendant_id, depth, created_at)
				SELECT ?, ancestor_type, ancestor_id, ?, ?, depth + 1, CURRENT_TIMESTAMP
				FROM entity_closure
				WHERE descendant_type = ? AND descendant_id = ?
			`
		}
		return tx.Exec(query, workspaceID, entityType, entityID, newParentType, newParentID).Error
	})
}

// HasAncestor checks if an entity has a specific ancestor.
func (s *EntityClosureService) HasAncestor(entityType, entityID, ancestorType, ancestorID string) (bool, error) {
	var count int64
	err := s.db.Model(&models.EntityClosure{}).
		Where("descendant_type = ? AND descendant_id = ? AND ancestor_type = ? AND ancestor_id = ?",
			entityType, entityID, ancestorType, ancestorID).
		Count(&count).Error
	return count > 0, err
}
