import { ServerEntity } from "../models/entity"
import { WorkspaceMemberRole } from "../models/workspace-member"
import { WorkspaceSubscriptionServerDto } from "../models/workspace-subscription"
import { EntityType } from "../utils/encryption-types"

/**
 * Event subscription interface for services to register interest in specific event types.
 */
export interface SSEEventSubscription {
  eventTypes: SSEEventType[]
  handler: SSEEventHandler
}

/**
 * Foundational SSE event types (no legacy app concepts like discussions/projects/tasks/etc).
 */
export enum SSEEventType {
  CONNECTED = "connected",
  CONNECTION_ERROR = "connection_error",

  WORKSPACE_MEMBER_ADDED = "workspace_member_added",
  WORKSPACE_MEMBER_REMOVED = "workspace_member_removed",
  WORKSPACE_MEMBER_UPDATED = "workspace_member_updated",
  WORKSPACE_SUBSCRIPTION_UPDATED = "workspace_subscription_updated",

  // Entity block realtime events (papers, notes, tasks, etc.)
  ENTITY_BLOCK_CREATED = "entity_block_created",

  // Entity creation events (new forum channels, discussions, replies)
  ENTITY_CREATED = "entity_created",
  // Entity metadata update events (title changes, etc.)
  ENTITY_UPDATED = "entity_updated",

  // Reaction events (emoji reactions on messages, tasks, etc.)
  REACTION_CREATED = "reaction_created",
  REACTION_DELETED = "reaction_deleted",

  // Notification updates (in-app inbox)
  NOTIFICATION_UPDATED = "notification_updated",
  NOTIFICATION_DELETED = "notification_deleted",
}

export type SSEEventData<T extends SSEEventType> = T extends SSEEventType.CONNECTED
  ? ConnectedEventData
  : T extends SSEEventType.CONNECTION_ERROR
    ? ConnectionErrorEventData
    : T extends SSEEventType.WORKSPACE_MEMBER_ADDED
      ? WorkspaceMemberEventData
      : T extends SSEEventType.WORKSPACE_MEMBER_REMOVED
        ? WorkspaceMemberEventData
        : T extends SSEEventType.WORKSPACE_MEMBER_UPDATED
          ? WorkspaceMemberEventData
          : T extends SSEEventType.WORKSPACE_SUBSCRIPTION_UPDATED
            ? WorkspaceSubscriptionUpdatedEventData
            : T extends SSEEventType.ENTITY_BLOCK_CREATED
              ? EntityBlockCreatedEventData
              : T extends SSEEventType.ENTITY_CREATED
                ? EntityCreatedOrUpdatedEventData
                : T extends SSEEventType.ENTITY_UPDATED
                  ? EntityCreatedOrUpdatedEventData
                  : T extends SSEEventType.REACTION_CREATED
                    ? EntityCreatedOrUpdatedEventData
                    : T extends SSEEventType.REACTION_DELETED
                      ? EntityCreatedOrUpdatedEventData
                      : T extends SSEEventType.NOTIFICATION_UPDATED
                        ? NotificationUpdatedEventData
                        : T extends SSEEventType.NOTIFICATION_DELETED
                          ? NotificationDeletedEventData
                          : Record<string, unknown>

export interface TypedSSEEvent<T extends SSEEventType = SSEEventType> {
  type: T
  data: SSEEventData<T>
}

export type TypedSSEEventUnion = {
  [K in SSEEventType]: { type: K; data: SSEEventData<K> }
}[SSEEventType]

export type SSEEventHandler = (event: TypedSSEEventUnion) => void

export interface ConnectedEventData {
  message: string
  clientId?: string
  error?: string
  reconnected?: boolean
}

export interface ConnectionErrorEventData {
  message: string
}

export type EntityCreatedOrUpdatedEventData = ServerEntity

export interface WorkspaceMemberEventData {
  workspace_id: string
  user_id: string
  role: WorkspaceMemberRole
  member_id: string
}

export interface EntityBlockCreatedEventData {
  entityId: string
  entityType: EntityType
  entityField: string
  blockId: string
  authorId: string
  encryptedData: string // base64-encoded Blocks protobuf
  dataVersion: string
  createdAt: string
}

export interface NotificationUpdatedEventData {
  id: string
  userId: string
  workspaceId: string
  actorUserId: string
  latestActorId: string
  actionType: string
  targetEntityId: string
  targetEntityType: string
  parentEntityId: string
  parentEntityType: string
  count: number
  readAt?: number
  createdAt: number
  updatedAt: number
}

// Minimal notification deletion payload for cache cleanup.
export interface NotificationDeletedEventData {
  id: string
  userId: string
  workspaceId: string
}

export interface WorkspaceSubscriptionUpdatedEventData {
  workspaceId: string
  subscription?: WorkspaceSubscriptionServerDto | null
}
