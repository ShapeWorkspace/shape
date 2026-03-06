import type { EntityType } from "../utils/encryption-types"

export type NotificationActionType =
  | "task_assigned"
  | "task_created_in_subscribed_project"
  | "task_comment"
  | "task_mention"
  | "discussion_reply"
  | "discussion_mention"
  | "paper_comment"
  | "paper_comment_reply"
  | "paper_comment_mention"
  | "paper_mention"
  | "paper_shared"
  | "folder_shared"
  | "group_message"
  | "group_added"
  | "dm_received"
  | "reaction_added"

export type NotificationEntityReferenceType = EntityType | "user"

export type NotificationActionDefinition = {
  actionType: NotificationActionType
  label: string
}

export const NOTIFICATION_ACTION_DEFINITIONS: NotificationActionDefinition[] = [
  { actionType: "task_assigned", label: "Task assigned to me" },
  { actionType: "task_created_in_subscribed_project", label: "Task created in a subscribed project" },
  { actionType: "task_comment", label: "Task comment in a subscribed task" },
  { actionType: "task_mention", label: "Mentioned in a task" },
  { actionType: "discussion_reply", label: "Discussion reply in a subscribed discussion" },
  { actionType: "discussion_mention", label: "Mentioned in a discussion" },
  { actionType: "paper_comment", label: "Comment on a subscribed paper" },
  { actionType: "paper_comment_reply", label: "Reply in a paper comment thread" },
  { actionType: "paper_comment_mention", label: "Mentioned in a paper comment" },
  { actionType: "paper_mention", label: "Mentioned in a paper" },
  { actionType: "paper_shared", label: "Paper or file shared with me" },
  { actionType: "folder_shared", label: "Folder shared with me" },
  { actionType: "group_message", label: "New group message" },
  { actionType: "group_added", label: "Added to a group chat" },
  { actionType: "dm_received", label: "Direct message received" },
]

export interface InAppNotification {
  id: string
  userId: string
  workspaceId: string
  actorUserId: string
  latestActorId: string
  actionType: NotificationActionType
  targetEntityId: string
  targetEntityType: NotificationEntityReferenceType
  parentEntityId: string
  parentEntityType: NotificationEntityReferenceType
  count: number
  readAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface InAppNotificationDto {
  id: string
  user_id: string
  workspace_id: string
  actor_user_id: string
  latest_actor_id: string
  action_type: NotificationActionType
  target_entity_id: string
  target_entity_type: NotificationEntityReferenceType
  parent_entity_id: string
  parent_entity_type: NotificationEntityReferenceType
  count: number
  read_at?: string | null
  created_at: string
  updated_at: string
}

export interface EntitySubscription {
  id: string
  userId: string
  workspaceId: string
  entityId: string
  entityType: NotificationEntityReferenceType
  createdAt: Date
}

export interface EntitySubscriptionDto {
  id: string
  user_id: string
  workspace_id: string
  entity_id: string
  entity_type: NotificationEntityReferenceType
  created_at: string
}

export interface NotificationPreference {
  id: string
  userId: string
  workspaceId: string
  actionType: NotificationActionType
  pushEnabled: boolean
  createdAt: Date
  updatedAt: Date
}

export interface NotificationPreferenceDto {
  id: string
  user_id: string
  workspace_id: string
  action_type: NotificationActionType
  push_enabled: boolean
  created_at: string
  updated_at: string
}

export interface NotificationPreferenceState {
  actionType: NotificationActionType
  pushEnabled: boolean
}

export interface NotificationPreferenceSummary {
  action_type: NotificationActionType
  push_enabled: boolean
}

export type DeviceTokenPlatform = "ios" | "android"

export interface DeviceToken {
  id: string
  userId: string
  token: string
  platform: DeviceTokenPlatform
  createdAt?: Date
  updatedAt?: Date
}

export interface DeviceTokenDto {
  id: string
  user_id: string
  token: string
  platform: DeviceTokenPlatform
  created_at?: string
  updated_at?: string
}

export function inAppNotificationFromDto(dto: InAppNotificationDto): InAppNotification {
  return {
    id: dto.id,
    userId: dto.user_id,
    workspaceId: dto.workspace_id,
    actorUserId: dto.actor_user_id,
    latestActorId: dto.latest_actor_id,
    actionType: dto.action_type,
    targetEntityId: dto.target_entity_id,
    targetEntityType: dto.target_entity_type,
    parentEntityId: dto.parent_entity_id,
    parentEntityType: dto.parent_entity_type,
    count: dto.count,
    readAt: dto.read_at ? new Date(dto.read_at) : null,
    createdAt: new Date(dto.created_at),
    updatedAt: new Date(dto.updated_at),
  }
}

export function entitySubscriptionFromDto(dto: EntitySubscriptionDto): EntitySubscription {
  return {
    id: dto.id,
    userId: dto.user_id,
    workspaceId: dto.workspace_id,
    entityId: dto.entity_id,
    entityType: dto.entity_type,
    createdAt: new Date(dto.created_at),
  }
}

export function notificationPreferenceFromDto(dto: NotificationPreferenceDto): NotificationPreference {
  return {
    id: dto.id,
    userId: dto.user_id,
    workspaceId: dto.workspace_id,
    actionType: dto.action_type,
    pushEnabled: dto.push_enabled,
    createdAt: new Date(dto.created_at),
    updatedAt: new Date(dto.updated_at),
  }
}

export function deviceTokenFromDto(dto: DeviceTokenDto): DeviceToken {
  return {
    id: dto.id,
    userId: dto.user_id,
    token: dto.token,
    platform: dto.platform,
    createdAt: dto.created_at ? new Date(dto.created_at) : undefined,
    updatedAt: dto.updated_at ? new Date(dto.updated_at) : undefined,
  }
}
