/**
 * Entity link normalization helpers.
 *
 * Keeps mapping logic for client entity types -> server entity types in one place.
 */

import type { WebEntityType } from "./entity-link-utils"

const ENTITY_TYPE_LOOKUP: Record<WebEntityType, true> = {
  task: true,
  paper: true,
  note: true,
  file: true,
  folder: true,
  discussion: true,
  project: true,
  channel: true,
  contact: true,
  mention: true,
  group: true,
  reply: true,
  comment: true,
  "paper-comment": true,
  "paper-comment-reply": true,
  message: true,
}

/**
 * Type guard for EntityType values derived from DOM or TipTap JSON.
 */
export function isEntityType(value: string): value is WebEntityType {
  return value in ENTITY_TYPE_LOOKUP
}

/**
 * Maps client EntityType values to server entity type strings.
 */
export function normalizeEntityTypeForEntityLink(entityType: WebEntityType): string {
  switch (entityType) {
    case "task":
      return "project_task"
    case "paper":
      return "paper"
    case "note":
      return "note"
    case "file":
      return "file"
    case "folder":
      return "folder"
    case "discussion":
      return "forum_discussion"
    case "project":
      return "project"
    case "channel":
      return "forum_channel"
    case "contact":
      return "member"
    case "mention":
      return "member"
    case "group":
      return "group_chat"
    case "reply":
      return "forum_reply"
    case "comment":
      return "task_comment"
    case "paper-comment":
      return "paper_comment"
    case "paper-comment-reply":
      return "paper_comment_reply"
    case "message":
      return "group_message"
  }
}

/**
 * Resolves the entity ID to use for entity-link syncing.
 *
 * Task links store the project ID as entityId and the task ID as taskId.
 */
// NOTE: Target entity IDs should always be the actual entity ID.
// Task links are normalized at the URL/Node layer so entityId is the task ID.
