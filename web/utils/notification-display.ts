import type {
  NotificationActionType,
  NotificationEntityReferenceType,
} from "@shape/engine/models/notification"

// Notification display copy structure used by both InboxTool and desktop notifications.
export interface NotificationDisplayCopy {
  title: string
  description: string
}

// Entity type to human-readable description mapping.
const ENTITY_TYPE_DESCRIPTIONS: Partial<Record<NotificationEntityReferenceType, string>> = {
  project: "Project",
  "task": "Task",
  "project-tag": "Project",
  "task-comment": "Task",
  "forum-channel": "Channel",
  "forum-discussion": "Discussion",
  "forum-reply": "Discussion",
  "group-chat": "Group chat",
  "group-message": "Group chat",
  note: "Note",
  paper: "Paper",
  "paper-comment": "Paper",
  "paper-comment-reply": "Paper",
  file: "File",
  folder: "Folder",
  user: "Contact",
  "direct-message": "Direct message",
  "workspace-member": "Member",
  block: "Block",
  "entity-link": "Link",
  reaction: "Reaction",
}

// Get the description label for an entity type (e.g., "Task", "Paper").
export const getEntityTypeDescription = (entityType: NotificationEntityReferenceType): string => {
  return ENTITY_TYPE_DESCRIPTIONS[entityType] ?? "Item"
}

// Configuration for building notification verbs. Each action type maps to:
// - fallbackVerb: Used when no entity name is available (also used for desktop notifications)
// - buildVerb: Function that builds the verb with an optional entity name
// - description: The entity type description to show
interface NotificationVerbConfig {
  fallbackVerb: string
  buildVerb: (entityName: string | null) => string
  description: string
}

// Build verb configs for each action type. The buildVerb function receives the resolved
// entity name (or null) and returns the appropriate verb phrase.
const getNotificationVerbConfig = (
  actionType: NotificationActionType,
  targetEntityType?: NotificationEntityReferenceType
): NotificationVerbConfig => {
  switch (actionType) {
    case "task_assigned":
      return {
        fallbackVerb: "assigned you a task",
        buildVerb: name => (name ? `assigned you ${name}` : "assigned you a task"),
        description: "Task",
      }

    case "task_created_in_subscribed_project":
      return {
        fallbackVerb: "created a task in a project you follow",
        buildVerb: name =>
          name ? `created a task in ${name}` : "created a task in a project you follow",
        description: "Project",
      }

    case "task_comment":
      return {
        fallbackVerb: "commented on a task",
        buildVerb: name => (name ? `commented on ${name}` : "commented on a task"),
        description: "Task",
      }

    case "task_mention":
      // Varies based on whether mention is in task body or a comment.
      if (targetEntityType === "task-comment") {
        return {
          fallbackVerb: "mentioned you in a task comment",
          buildVerb: name =>
            name ? `mentioned you in a comment on ${name}` : "mentioned you in a task comment",
          description: "Task",
        }
      }
      return {
        fallbackVerb: "mentioned you in a task",
        buildVerb: name => (name ? `mentioned you in ${name}` : "mentioned you in a task"),
        description: "Task",
      }

    case "discussion_reply":
      return {
        fallbackVerb: "replied to a discussion",
        buildVerb: name => (name ? `replied to ${name}` : "replied to a discussion"),
        description: "Discussion",
      }

    case "discussion_mention":
      return {
        fallbackVerb: "mentioned you in a discussion",
        buildVerb: name => (name ? `mentioned you in ${name}` : "mentioned you in a discussion"),
        description: "Discussion",
      }

    case "paper_comment":
      return {
        fallbackVerb: "commented on a paper",
        buildVerb: name => (name ? `commented on ${name}` : "commented on a paper"),
        description: "Paper",
      }

    case "paper_comment_reply":
      return {
        fallbackVerb: "replied to a paper comment",
        buildVerb: name =>
          name ? `replied to a comment on ${name}` : "replied to a paper comment",
        description: "Paper",
      }

    case "paper_comment_mention":
      return {
        fallbackVerb: "mentioned you in a paper comment",
        buildVerb: name =>
          name ? `mentioned you in a comment on ${name}` : "mentioned you in a paper comment",
        description: "Paper",
      }

    case "paper_mention":
      return {
        fallbackVerb: "mentioned you in a paper",
        buildVerb: name => (name ? `mentioned you in ${name}` : "mentioned you in a paper"),
        description: "Paper",
      }

    case "paper_shared":
      // Varies based on whether it's a paper or file share.
      if (targetEntityType === "file") {
        return {
          fallbackVerb: "shared a file with you",
          buildVerb: name => (name ? `shared ${name}` : "shared a file"),
          description: "File",
        }
      }
      return {
        fallbackVerb: "shared a paper with you",
        buildVerb: name => (name ? `shared ${name}` : "shared a paper"),
        description: "Paper",
      }

    case "folder_shared":
      return {
        fallbackVerb: "shared a folder with you",
        buildVerb: name => (name ? `shared ${name}` : "shared a folder"),
        description: "Folder",
      }

    case "group_message":
      return {
        fallbackVerb: "sent a message in a group",
        buildVerb: name => (name ? `sent a message in ${name}` : "sent a message in a group"),
        description: "Group chat",
      }

    case "group_added":
      return {
        fallbackVerb: "added you to a group",
        buildVerb: name => (name ? `added you to ${name}` : "added you to a group"),
        description: "Group chat",
      }

    case "dm_received":
      return {
        fallbackVerb: "sent you a direct message",
        buildVerb: () => "sent you a direct message",
        description: "Direct message",
      }

    case "reaction_added":
      return {
        fallbackVerb: "reacted to your item",
        buildVerb: name => (name ? `reacted to ${name}` : "reacted to your item"),
        description: "Reaction",
      }

    default:
      return {
        fallbackVerb: "sent an update",
        buildVerb: () => "sent an update",
        description: "Notification",
      }
  }
}

// Get the fallback verb for an action type (no entity name). Used by desktop notifications.
export const getNotificationFallbackVerb = (
  actionType: NotificationActionType,
  targetEntityType?: NotificationEntityReferenceType
): string => {
  return getNotificationVerbConfig(actionType, targetEntityType).fallbackVerb
}

// Get the description for an action type (e.g., "Task", "Paper").
export const getNotificationDescription = (
  actionType: NotificationActionType,
  targetEntityType?: NotificationEntityReferenceType
): string => {
  return getNotificationVerbConfig(actionType, targetEntityType).description
}

// Build the notification verb with an optional entity name.
// If entityName is provided, produces rich text like "commented on My Task".
// If entityName is null, produces fallback like "commented on a task".
export const buildNotificationVerb = (
  actionType: NotificationActionType,
  entityName: string | null,
  targetEntityType?: NotificationEntityReferenceType
): string => {
  return getNotificationVerbConfig(actionType, targetEntityType).buildVerb(entityName)
}

// Build complete notification display copy with actor name, verb, and description.
export const buildNotificationDisplayCopy = (
  actorName: string,
  actionType: NotificationActionType,
  entityName: string | null,
  targetEntityType?: NotificationEntityReferenceType,
  extraSuffix?: string
): NotificationDisplayCopy => {
  const verb = buildNotificationVerb(actionType, entityName, targetEntityType)
  const description = getNotificationDescription(actionType, targetEntityType)
  return {
    title: `${actorName} ${verb}${extraSuffix ?? ""}`,
    description,
  }
}
