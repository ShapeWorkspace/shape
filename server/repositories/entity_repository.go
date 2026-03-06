// Package repositories provides data access abstractions for the Shape server.
// Repositories handle ONLY database operations - no business logic, validation, or ACL checks.
// Business logic belongs in the service layer (services package).
package repositories

import (
	"errors"

	"shape/models"

	"gorm.io/gorm"
)

// ---------------------------------------------------------------------------
// EntityRepository Interface
// ---------------------------------------------------------------------------

// EntityRepository defines the data access contract for unified entities.
type EntityRepository interface {
	// DB exposes the underlying database connection for transactional work.
	DB() *gorm.DB

	// CreateEntity persists a new entity row.
	CreateEntity(entity *models.Entity) error

	// FindEntityByID retrieves an entity by ID.
	FindEntityByID(id string) (*models.Entity, error)

	// FindEntityByIDInWorkspace retrieves an entity by ID within a workspace.
	FindEntityByIDInWorkspace(id, workspaceID string) (*models.Entity, error)

	// UpdateEntity performs an atomic update with optional optimistic locking.
	UpdateEntity(id string, updates map[string]interface{}, expectedHash string) (*models.Entity, error)

	// DeleteEntityByID removes an entity by ID.
	DeleteEntityByID(id string) error

	// QueryEntities executes a filtered query (workspace scoping handled by caller).
	QueryEntities(workspaceID string, whereClause string, args []interface{}) ([]*models.Entity, error)
}

// ---------------------------------------------------------------------------
// GormEntityRepository Implementation
// ---------------------------------------------------------------------------

// GormEntityRepository is the GORM-based implementation of EntityRepository.
type GormEntityRepository struct {
	RepositoryBase
}

// NewEntityRepository creates a new GormEntityRepository.
func NewEntityRepository(db *gorm.DB) *GormEntityRepository {
	return &GormEntityRepository{
		RepositoryBase: NewRepositoryBase(db),
	}
}

// CreateEntity inserts a new entity row.
func (r *GormEntityRepository) CreateEntity(entity *models.Entity) error {
	return r.db.Create(entity).Error
}

// FindEntityByID retrieves an entity by ID.
func (r *GormEntityRepository) FindEntityByID(id string) (*models.Entity, error) {
	var entity models.Entity
	if err := r.db.Where("id = ?", id).First(&entity).Error; err != nil {
		return nil, err
	}
	return &entity, nil
}

// FindEntityByIDInWorkspace retrieves an entity by ID within a workspace.
func (r *GormEntityRepository) FindEntityByIDInWorkspace(id, workspaceID string) (*models.Entity, error) {
	var entity models.Entity
	if err := r.db.Where("id = ? AND workspace_id = ?", id, workspaceID).First(&entity).Error; err != nil {
		return nil, err
	}
	return &entity, nil
}

// UpdateEntity performs an atomic update with optional optimistic locking.
//
// Returns:
//   - (*Entity, nil) on success
//   - (nil, models.ErrEntityConflict) if expectedHash doesn't match
//   - (nil, gorm.ErrRecordNotFound) if entity doesn't exist
func (r *GormEntityRepository) UpdateEntity(id string, updates map[string]interface{}, expectedHash string) (*models.Entity, error) {
	query := r.db.Model(&models.Entity{}).Where("id = ?", id)
	if expectedHash != "" {
		query = query.Where("content_hash = ?", expectedHash)
	}

	result := query.Updates(updates)
	if result.Error != nil {
		return nil, result.Error
	}

	if result.RowsAffected == 0 {
		var exists bool
		err := r.db.Model(&models.Entity{}).
			Select("1").
			Where("id = ?", id).
			Find(&exists).Error
		if err != nil {
			return nil, err
		}
		if !exists {
			return nil, gorm.ErrRecordNotFound
		}
		return nil, models.ErrEntityConflict
	}

	var entity models.Entity
	if err := r.db.Where("id = ?", id).First(&entity).Error; err != nil {
		return nil, err
	}

	return &entity, nil
}

// DeleteEntityByID removes an entity by ID.
func (r *GormEntityRepository) DeleteEntityByID(id string) error {
	return r.db.Where("id = ?", id).Delete(&models.Entity{}).Error
}

// QueryEntities executes a filtered query in the given workspace.
func (r *GormEntityRepository) QueryEntities(workspaceID string, whereClause string, args []interface{}) ([]*models.Entity, error) {
	if whereClause == "" {
		return nil, errors.New("whereClause is required")
	}

	var entities []*models.Entity
	query := r.db.Where("workspace_id = ?", workspaceID).Where(whereClause, args...)
	if err := query.Find(&entities).Error; err != nil {
		return nil, err
	}
	return entities, nil
}
