// Package repositories provides data access abstractions for the Shape server.
// Repositories handle ONLY database operations - no business logic, validation, or ACL checks.
// Business logic belongs in the service layer (services package).
package repositories

import (
	"context"
	"fmt"

	"shape/models"

	"gorm.io/gorm"
)

// ChangeLogRepository defines the data access interface for the workspace change log.
// The change log is an append-only infrastructure for sync - entries are never updated or deleted.
// This interface abstracts the database layer to allow for testing and potential future backends.
type ChangeLogRepository interface {
	// AppendChangeLogEntry inserts a new entry into the change log.
	// The sequence number is automatically assigned by the implementation.
	// The entry's Sequence field is populated with the assigned value after insertion.
	AppendChangeLogEntry(ctx context.Context, entry *models.ChangeLogEntry) error

	// FindChangeLogEntriesSinceSequence retrieves deduplicated change log entries for a specific entity type.
	// Deduplication returns only the latest entry per entity_id - if an entity was updated 50 times,
	// only the most recent change is returned since we fetch current state from the entity table.
	// Entries are returned in ascending sequence order (oldest first) to ensure parent entities
	// arrive before children during sync.
	FindChangeLogEntriesSinceSequence(
		ctx context.Context,
		workspaceID string,
		entityType string,
		sinceSequence int64,
		limit int,
	) (entries []models.ChangeLogEntry, hasMore bool, err error)

	// FindAllChangeLogEntriesSinceSequence retrieves deduplicated change log entries for ALL entity types.
	// Similar to FindChangeLogEntriesSinceSequence but without entity type filtering.
	// Deduplication is per (entity_type, entity_id) pair.
	FindAllChangeLogEntriesSinceSequence(
		ctx context.Context,
		workspaceID string,
		sinceSequence int64,
		limit int,
	) (entries []models.ChangeLogEntry, hasMore bool, err error)

	// FindMaxSequenceForWorkspace returns the highest sequence number in a workspace's change log.
	// Returns 0 if the workspace has no change log entries.
	FindMaxSequenceForWorkspace(ctx context.Context, workspaceID string) (int64, error)
}

// changeLogRepositoryImpl is the concrete GORM-based implementation of ChangeLogRepository.
type changeLogRepositoryImpl struct {
	RepositoryBase
}

// NewChangeLogRepository creates a new change log repository with the given database connection.
func NewChangeLogRepository(db *gorm.DB) ChangeLogRepository {
	return &changeLogRepositoryImpl{
		RepositoryBase: NewRepositoryBase(db),
	}
}

// AppendChangeLogEntry inserts a new entry into the change log.
// The sequence number is atomically assigned using a subquery to get the next sequence
// for the workspace. This ensures uniqueness even under concurrent inserts.
//
// After insertion, the entry's Sequence field is populated with the assigned value.
func (r *changeLogRepositoryImpl) AppendChangeLogEntry(ctx context.Context, entry *models.ChangeLogEntry) error {
	timestampExpr := "NOW()"
	if r.db.Dialector != nil && r.db.Dialector.Name() == "sqlite" {
		timestampExpr = "CURRENT_TIMESTAMP"
	}

	// We use raw SQL here to insert directly into the table and let the
	// database handle sequence assignment via a subquery.
	// This ensures atomicity and avoids race conditions.
	result := r.db.WithContext(ctx).Exec(fmt.Sprintf(`
			INSERT INTO workspace_change_log (workspace_id, sequence, entity_type, entity_id, operation, actor_id, created_at)
			VALUES (
				?,
				COALESCE((SELECT MAX(sequence) FROM workspace_change_log WHERE workspace_id = ?), 0) + 1,
				?,
				?,
				?,
				?,
				%s
			)
		`, timestampExpr), entry.WorkspaceID, entry.WorkspaceID, entry.EntityType, entry.EntityID, entry.Operation, entry.ActorID)

	if result.Error != nil {
		return result.Error
	}

	// Fetch the assigned sequence number for the caller.
	// We query the latest entry for this entity to get the sequence.
	// This is safe because we just inserted it and sequence is monotonically increasing.
	var seq int64
	if err := r.db.WithContext(ctx).Raw(`
		SELECT sequence FROM workspace_change_log
		WHERE workspace_id = ? AND entity_id = ?
		ORDER BY sequence DESC LIMIT 1
	`, entry.WorkspaceID, entry.EntityID).Scan(&seq).Error; err != nil {
		return err
	}
	entry.Sequence = seq

	return nil
}

// FindChangeLogEntriesSinceSequence retrieves deduplicated change log entries for a specific entity type.
// Uses a subquery to get only the latest entry per entity_id.
//
// The deduplication logic:
// 1. Inner subquery finds the max sequence per entity_id (latest change per entity)
// 2. Join back to get full entry data for those max sequences
// 3. Order by sequence ASC so parents arrive before children
func (r *changeLogRepositoryImpl) FindChangeLogEntriesSinceSequence(
	ctx context.Context,
	workspaceID string,
	entityType string,
	sinceSequence int64,
	limit int,
) (entries []models.ChangeLogEntry, hasMore bool, err error) {
	// Query limit+1 to detect if there are more entries.
	// The subquery finds the max sequence per entity_id, then we join to get full entry data.
	var results []models.ChangeLogEntry
	query := r.db.WithContext(ctx).Raw(`
		SELECT cl.id, cl.workspace_id, cl.sequence, cl.entity_type, cl.entity_id, cl.operation, cl.actor_id
		FROM workspace_change_log cl
		INNER JOIN (
			SELECT entity_id, MAX(sequence) as max_seq
			FROM workspace_change_log
			WHERE workspace_id = ? AND entity_type = ? AND sequence > ?
			GROUP BY entity_id
		) latest ON cl.entity_id = latest.entity_id AND cl.sequence = latest.max_seq
		WHERE cl.workspace_id = ? AND cl.entity_type = ?
		ORDER BY cl.sequence ASC
		LIMIT ?
	`, workspaceID, entityType, sinceSequence, workspaceID, entityType, limit+1).Scan(&results)

	if query.Error != nil {
		return nil, false, query.Error
	}

	// Check if there are more entries beyond the limit.
	hasMore = len(results) > limit
	if hasMore {
		// Remove the extra entry we fetched for pagination detection.
		results = results[:limit]
	}

	return results, hasMore, nil
}

// FindAllChangeLogEntriesSinceSequence retrieves deduplicated change log entries for ALL entity types.
// Uses a subquery to get only the latest entry per (entity_type, entity_id) pair.
//
// The deduplication logic groups by both entity_type and entity_id because different
// entity types may have overlapping IDs (though unlikely with UUIDs).
func (r *changeLogRepositoryImpl) FindAllChangeLogEntriesSinceSequence(
	ctx context.Context,
	workspaceID string,
	sinceSequence int64,
	limit int,
) (entries []models.ChangeLogEntry, hasMore bool, err error) {
	// Query limit+1 to detect if there are more entries.
	// The subquery finds the max sequence per (entity_type, entity_id) pair.
	var results []models.ChangeLogEntry
	query := r.db.WithContext(ctx).Raw(`
		SELECT cl.id, cl.workspace_id, cl.sequence, cl.entity_type, cl.entity_id, cl.operation, cl.actor_id
		FROM workspace_change_log cl
		INNER JOIN (
			SELECT entity_type, entity_id, MAX(sequence) as max_seq
			FROM workspace_change_log
			WHERE workspace_id = ? AND sequence > ?
			GROUP BY entity_type, entity_id
		) latest ON cl.entity_type = latest.entity_type
			AND cl.entity_id = latest.entity_id
			AND cl.sequence = latest.max_seq
		WHERE cl.workspace_id = ?
		ORDER BY cl.sequence ASC
		LIMIT ?
	`, workspaceID, sinceSequence, workspaceID, limit+1).Scan(&results)

	if query.Error != nil {
		return nil, false, query.Error
	}

	// Check if there are more entries beyond the limit.
	hasMore = len(results) > limit
	if hasMore {
		// Remove the extra entry we fetched for pagination detection.
		results = results[:limit]
	}

	return results, hasMore, nil
}

// FindMaxSequenceForWorkspace returns the highest sequence number in a workspace's change log.
// Uses COALESCE to return 0 if no entries exist, which is the correct starting point
// for a client that has never synced.
func (r *changeLogRepositoryImpl) FindMaxSequenceForWorkspace(ctx context.Context, workspaceID string) (int64, error) {
	var maxSequence int64
	result := r.db.WithContext(ctx).Raw(`
		SELECT COALESCE(MAX(sequence), 0) FROM workspace_change_log WHERE workspace_id = ?
	`, workspaceID).Scan(&maxSequence)

	if result.Error != nil {
		return 0, result.Error
	}

	return maxSequence, nil
}
