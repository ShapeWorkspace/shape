// Package repositories provides data access abstractions for the Shape server.
// Repositories handle ONLY database operations - no business logic, validation, or ACL checks.
// Business logic belongs in the service layer (models package).
package repositories

import "gorm.io/gorm"

// RepositoryBase provides common database access functionality for all repositories.
// Embed this struct in concrete repository implementations.
type RepositoryBase struct {
	db *gorm.DB
}

// NewRepositoryBase creates a new repository base with the given database connection.
func NewRepositoryBase(db *gorm.DB) RepositoryBase {
	return RepositoryBase{db: db}
}

// DB returns the underlying database connection for custom queries.
// Use this sparingly - prefer defining explicit repository methods.
func (r *RepositoryBase) DB() *gorm.DB {
	return r.db
}
