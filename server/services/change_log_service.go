package services

import (
	"context"
	"errors"

	"shape/models"
)

// ChangeLogRepositoryEntry is a DTO used to transfer data between the service and repository layers.
// It uses plain string types for entity type and operation to avoid coupling the repository
// to model-specific types, enabling the repository to remain a pure data access layer.
type ChangeLogRepositoryEntry struct {
	ID          uint64
	WorkspaceID string
	Sequence    int64
	EntityType  string
	EntityID    string
	Operation   string
	ActorID     string
}

// ChangeLogRepository defines the data access interface for the workspace change log.
// The change log is an append-only infrastructure for sync - entries are never updated or deleted.
// This interface abstracts the database layer to allow for testing and potential future backends.
//
// Note: This interface is defined in the services package alongside the service implementation.
// The concrete implementation lives in the repositories package.
type ChangeLogRepository interface {
	// AppendChangeLogEntry inserts a new entry into the change log.
	// The sequence number is automatically assigned by the implementation.
	// The entry's Sequence field is populated with the assigned value after insertion.
	AppendChangeLogEntry(ctx context.Context, entry *ChangeLogRepositoryEntry) error

	// FindChangeLogEntriesSinceSequence retrieves deduplicated change log entries for a specific entity type.
	// Deduplication returns only the latest entry per entity_id - if an entity was updated 50 times,
	// only the most recent change is returned since we fetch current state from the entity table.
	// Entries are returned in ascending sequence order (oldest first) to ensure parent entities
	// arrive before children during sync.
	//
	// Parameters:
	//   - workspaceID: The workspace to query
	//   - entityType: Filter to a specific entity type (e.g., "note", "project")
	//   - sinceSequence: Return entries with sequence > sinceSequence (0 for all)
	//   - limit: Maximum number of entries to return
	//
	// Returns:
	//   - entries: The deduplicated change log entries
	//   - hasMore: True if there are more entries beyond the limit
	//   - err: Any database error
	FindChangeLogEntriesSinceSequence(
		ctx context.Context,
		workspaceID string,
		entityType string,
		sinceSequence int64,
		limit int,
	) (entries []ChangeLogRepositoryEntry, hasMore bool, err error)

	// FindAllChangeLogEntriesSinceSequence retrieves deduplicated change log entries for ALL entity types.
	// Similar to FindChangeLogEntriesSinceSequence but without entity type filtering.
	// Deduplication is per (entity_type, entity_id) pair.
	//
	// Parameters:
	//   - workspaceID: The workspace to query
	//   - sinceSequence: Return entries with sequence > sinceSequence (0 for all)
	//   - limit: Maximum number of entries to return
	//
	// Returns:
	//   - entries: The deduplicated change log entries
	//   - hasMore: True if there are more entries beyond the limit
	//   - err: Any database error
	FindAllChangeLogEntriesSinceSequence(
		ctx context.Context,
		workspaceID string,
		sinceSequence int64,
		limit int,
	) (entries []ChangeLogRepositoryEntry, hasMore bool, err error)

	// FindMaxSequenceForWorkspace returns the highest sequence number in a workspace's change log.
	// Returns 0 if the workspace has no change log entries.
	// Used by clients to check if they're behind without fetching actual changes.
	FindMaxSequenceForWorkspace(ctx context.Context, workspaceID string) (int64, error)
}

// ChangeLogService provides business logic for managing the workspace change log.
// This is the primary interface for other services to record entity mutations.
// The service delegates all database operations to the repository layer.
type ChangeLogService struct {
	repository ChangeLogRepository
}

// NewChangeLogService creates a new change log service with the given repository.
func NewChangeLogService(repository ChangeLogRepository) *ChangeLogService {
	return &ChangeLogService{repository: repository}
}

// AppendChangeParams holds parameters for appending a new change log entry.
// All fields are required - validation is performed by AppendChange.
type AppendChangeParams struct {
	// WorkspaceID is the workspace this change belongs to.
	WorkspaceID string

	// EntityType identifies what kind of entity changed (e.g., "note", "project").
	EntityType models.ChangeLogEntityType

	// EntityID is the UUID of the entity that was changed.
	EntityID string

	// Operation describes what happened (create, update, or delete).
	Operation models.ChangeLogOperation

	// ActorID is the user who initiated the change.
	ActorID string
}

// AppendChange records a new entry in the change log.
// This should be called by entity handlers after successful create/update/delete operations.
// The sequence number is automatically assigned by the repository layer.
//
// All parameters are required - returns an error if any are missing.
func (s *ChangeLogService) AppendChange(ctx context.Context, params AppendChangeParams) (*models.ChangeLogEntry, error) {
	// Validate all required parameters.
	if params.WorkspaceID == "" {
		return nil, errors.New("workspace_id is required")
	}
	if params.EntityType == "" {
		return nil, errors.New("entity_type is required")
	}
	if params.EntityID == "" {
		return nil, errors.New("entity_id is required")
	}
	if params.Operation == "" {
		return nil, errors.New("operation is required")
	}
	if params.ActorID == "" {
		return nil, errors.New("actor_id is required")
	}

	// Create repository entry (uses string types for entity type and operation).
	repoEntry := &ChangeLogRepositoryEntry{
		WorkspaceID: params.WorkspaceID,
		EntityType:  string(params.EntityType),
		EntityID:    params.EntityID,
		Operation:   string(params.Operation),
		ActorID:     params.ActorID,
	}

	// Delegate to repository for the actual insert.
	// The repository assigns the sequence number and populates it on the entry.
	if err := s.repository.AppendChangeLogEntry(ctx, repoEntry); err != nil {
		return nil, err
	}

	// Convert repository entry back to model entry with typed fields.
	entry := &models.ChangeLogEntry{
		ID:          repoEntry.ID,
		WorkspaceID: repoEntry.WorkspaceID,
		Sequence:    repoEntry.Sequence,
		EntityType:  models.ChangeLogEntityType(repoEntry.EntityType),
		EntityID:    repoEntry.EntityID,
		Operation:   models.ChangeLogOperation(repoEntry.Operation),
		ActorID:     repoEntry.ActorID,
	}

	return entry, nil
}

// GetChangesSinceResult holds the result of a GetChangesSince query.
// Includes the changes, pagination info, and the next sequence for subsequent requests.
type GetChangesSinceResult struct {
	// Entries contains the deduplicated change log entries.
	Entries []models.ChangeLogEntry

	// NextSequence is the sequence number to use for the next sync request.
	// If entries is empty, this equals sinceSequence.
	// Otherwise, it's the sequence of the last entry.
	NextSequence int64

	// HasMore indicates whether there are more entries beyond the current page.
	HasMore bool
}

// convertFromRepoChangeLogEntry converts a repository ChangeLogRepositoryEntry to a model ChangeLogEntry.
// This is necessary because the repository uses a DTO struct to avoid import cycles.
func convertFromRepoChangeLogEntry(repoEntry ChangeLogRepositoryEntry) models.ChangeLogEntry {
	return models.ChangeLogEntry{
		ID:          repoEntry.ID,
		WorkspaceID: repoEntry.WorkspaceID,
		Sequence:    repoEntry.Sequence,
		EntityType:  models.ChangeLogEntityType(repoEntry.EntityType),
		EntityID:    repoEntry.EntityID,
		Operation:   models.ChangeLogOperation(repoEntry.Operation),
		ActorID:     repoEntry.ActorID,
	}
}

// GetChangesSince retrieves change log entries for an entity type since a given sequence.
// Entries are deduplicated by entity_id, returning only the latest entry per entity.
// This avoids returning the same entity multiple times if it was updated repeatedly.
// Entries are returned in oldest-first order (ascending sequence) to ensure parents
// arrive before children during sync.
//
// Parameters:
//   - workspaceID: The workspace to query
//   - entityType: The type of entity to filter by
//   - sinceSequence: Return entries with sequence > sinceSequence (0 for initial sync)
//   - limit: Maximum number of entries to return (defaults to 100 if <= 0)
func (s *ChangeLogService) GetChangesSince(
	ctx context.Context,
	workspaceID string,
	entityType models.ChangeLogEntityType,
	sinceSequence int64,
	limit int,
) (*GetChangesSinceResult, error) {
	// Apply default limit.
	if limit <= 0 {
		limit = 100
	}

	// Delegate to repository (using string type for entityType).
	repoEntries, hasMore, err := s.repository.FindChangeLogEntriesSinceSequence(
		ctx,
		workspaceID,
		string(entityType),
		sinceSequence,
		limit,
	)
	if err != nil {
		return nil, err
	}

	// Convert repository entries to model entries with typed fields.
	entries := make([]models.ChangeLogEntry, len(repoEntries))
	for i, re := range repoEntries {
		entries[i] = convertFromRepoChangeLogEntry(re)
	}

	// Calculate next sequence for pagination.
	// If there are entries, use the last one's sequence.
	// Otherwise, return the original sinceSequence.
	var nextSequence int64
	if len(entries) > 0 {
		nextSequence = entries[len(entries)-1].Sequence
	} else {
		nextSequence = sinceSequence
	}

	return &GetChangesSinceResult{
		Entries:      entries,
		NextSequence: nextSequence,
		HasMore:      hasMore,
	}, nil
}

// GetAllChangesSince retrieves change log entries for ALL entity types since a given sequence.
// Entries are deduplicated by (entity_type, entity_id), returning only the latest entry per entity.
// This is useful for clients that want to sync everything in one call.
//
// Parameters:
//   - workspaceID: The workspace to query
//   - sinceSequence: Return entries with sequence > sinceSequence (0 for initial sync)
//   - limit: Maximum number of entries to return (defaults to 100 if <= 0)
func (s *ChangeLogService) GetAllChangesSince(
	ctx context.Context,
	workspaceID string,
	sinceSequence int64,
	limit int,
) (*GetChangesSinceResult, error) {
	// Apply default limit.
	if limit <= 0 {
		limit = 100
	}

	// Delegate to repository.
	repoEntries, hasMore, err := s.repository.FindAllChangeLogEntriesSinceSequence(
		ctx,
		workspaceID,
		sinceSequence,
		limit,
	)
	if err != nil {
		return nil, err
	}

	// Convert repository entries to model entries with typed fields.
	entries := make([]models.ChangeLogEntry, len(repoEntries))
	for i, re := range repoEntries {
		entries[i] = convertFromRepoChangeLogEntry(re)
	}

	// Calculate next sequence for pagination.
	var nextSequence int64
	if len(entries) > 0 {
		nextSequence = entries[len(entries)-1].Sequence
	} else {
		nextSequence = sinceSequence
	}

	return &GetChangesSinceResult{
		Entries:      entries,
		NextSequence: nextSequence,
		HasMore:      hasMore,
	}, nil
}

// GetLatestSequence returns the current maximum sequence number for a workspace.
// Returns 0 if the workspace has no change log entries.
// Useful for clients to check if they're behind without fetching actual changes.
func (s *ChangeLogService) GetLatestSequence(ctx context.Context, workspaceID string) (int64, error) {
	return s.repository.FindMaxSequenceForWorkspace(ctx, workspaceID)
}
