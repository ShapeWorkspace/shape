// service_interfaces.go defines interfaces for services that are implemented in the services package.
// This allows models to reference service functionality without creating import cycles.

package models

import "context"

// ACLServiceInterface defines the methods that models can use from ACLService.
// The actual implementation lives in services.ACLService.
type ACLServiceInterface interface {
	// UserHasAccessToResource checks if a user has any access to a resource.
	UserHasAccessToResource(userID string, resourceType ACLResourceType, resourceID string) (bool, error)
	// UserHasWriteAccessToResource checks if a user has write access to a resource.
	UserHasWriteAccessToResource(userID string, resourceType ACLResourceType, resourceID string) (bool, error)
	// GetUserPermissionOnResource returns the highest permission a user has on a resource.
	GetUserPermissionOnResource(userID string, resourceType ACLResourceType, resourceID string) (*ACLPermission, error)
}

// EffectiveAccessServiceInterface defines the methods that models can use from EffectiveAccessService.
// The actual implementation lives in services.EffectiveAccessService.
type EffectiveAccessServiceInterface interface {
	// RebuildForResource rebuilds the effective access cache for a specific resource.
	RebuildForResource(workspaceID, resourceType, resourceID string) error
	// OnEntityDeleted cleans up effective access entries when an entity is deleted.
	OnEntityDeleted(resourceType, resourceID string) error
	// OnACLEntryCreated handles updates when an ACL entry is created.
	OnACLEntryCreated(entry *ACLEntry) error
}

// WorkspaceSubscriptionServiceInterface defines the methods that models can use from WorkspaceSubscriptionService.
// The actual implementation lives in services.WorkspaceSubscriptionService.
type WorkspaceSubscriptionServiceInterface interface {
	// EnsureSeatCapacity checks if adding seats is allowed.
	EnsureSeatCapacity(workspaceID string, seatsToAdd int) error
	// EnsureSeatCapacityForInviteReservation checks if creating seat-reserving invites is allowed.
	EnsureSeatCapacityForInviteReservation(workspaceID string, seatsToAdd int) error
	// EnsureWorkspaceWritable checks if the workspace allows writes.
	EnsureWorkspaceWritable(workspaceID string) error
	// HasActiveSubscription checks if a workspace has an active subscription.
	HasActiveSubscription(workspaceID string) (bool, error)
	// SelfHostedEnabled returns whether self-hosted mode is enabled.
	SelfHostedEnabled() bool
	// EnsureSelfHostedSubscription ensures self-hosted workspaces have unlimited seats.
	EnsureSelfHostedSubscription(workspaceID string) (*WorkspaceSubscriptionSnapshot, error)
}

// ChangeLogAppendParams defines the data needed to append a change log entry.
type ChangeLogAppendParams struct {
	WorkspaceID string
	EntityType  ChangeLogEntityType
	EntityID    string
	Operation   ChangeLogOperation
	ActorID     string
}

// ChangeLogServiceInterface defines the change log methods used by models.
type ChangeLogServiceInterface interface {
	AppendChange(ctx context.Context, params ChangeLogAppendParams) (*ChangeLogEntry, error)
}

// WorkspaceCheckerInterface defines the methods that models can use from WorkspaceChecker.
// The actual implementation lives in services.WorkspaceChecker.
type WorkspaceCheckerInterface interface {
	// IsUserInWorkspace checks if a user is a member of a workspace.
	IsUserInWorkspace(userID, workspaceID string) bool
	// IsUserWorkspaceAdmin checks if a user is an admin of a workspace.
	IsUserWorkspaceAdmin(userID, workspaceID string) bool
	// IsUserWorkspaceSuperAdmin checks if a user is a super admin of a workspace.
	IsUserWorkspaceSuperAdmin(userID, workspaceID string) bool
}

// SSEBroadcasterInterface defines methods for broadcasting SSE events.
// The actual implementation lives in services.SSEManager.
type SSEBroadcasterInterface interface {
	// BroadcastWorkspaceMemberAdded broadcasts when a member is added to a workspace.
	BroadcastWorkspaceMemberAdded(member *WorkspaceMember)
	// BroadcastWorkspaceMemberRemoved broadcasts when a member is removed from a workspace.
	BroadcastWorkspaceMemberRemoved(workspaceID, userID string)
	// BroadcastWorkspaceMemberUpdated broadcasts when a member profile or role is updated.
	BroadcastWorkspaceMemberUpdated(member *WorkspaceMember)
}
