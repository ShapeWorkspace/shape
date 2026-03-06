/**
 * Entity Link Utilities
 *
 * Provides utilities for detecting, parsing, and building entity links.
 * Entity links are internal URLs that reference entities within the app
 * (tasks, papers, notes, files, discussions, etc.).
 *
 * URL Pattern: /w/{workspaceId}/{tool}/{itemId}
 * Full URL: https://{subdomain}.{domain}/w/{workspaceId}/{tool}/{itemId}
 */

import type { ToolType } from "../store/types"

/**
 * Information extracted from an entity link URL.
 */
export interface EntityLinkInfo {
  /** The full href URL */
  href: string
  /** Workspace ID from the URL */
  workspaceId: string
  /** Tool type (notes, tasks, papers, files, forum, etc.) */
  tool: ToolType
  /** Entity ID within the tool (task ID for task links) */
  entityId: string
  /** Project ID for task links (tasks live under projects) */
  projectId?: string
  /** Optional task ID (for task-specific links within projects) */
  taskId?: string
  /** Optional channel ID (for discussion links within channels) */
  channelId?: string
  /** Document position when used in link monitoring */
  position?: number
}

/**
 * Entity types for display purposes.
 * Maps tool types to human-readable entity names.
 *
 * Includes child entity types (reply, comment, message) which represent
 * entities nested within parent entities. These don't have their own
 * dedicated views but can appear in backlinks.
 */
export type WebEntityType =
  | "task"
  | "paper"
  | "note"
  | "file"
  | "folder"
  | "discussion"
  | "project"
  | "channel"
  | "contact"
  | "mention" // @mention of a contact
  | "group"
  | "reply" // Forum discussion reply
  | "comment" // Task comment
  | "paper-comment" // Paper comment thread
  | "paper-comment-reply" // Reply to a paper comment thread
  | "message" // Group chat message

/**
 * Valid tool types that support entity linking.
 * These tools have entities that can be linked to.
 */
const LINKABLE_TOOLS: readonly ToolType[] = [
  "memos",
  "projects", // Projects and tasks use /projects/{projectId}/tasks/{taskId}
  "papers",
  "files",
  "forum",
  "contacts",
  "groups",
] as const

/**
 * Check if a URL is an internal entity link.
 * Compares the host (including subdomain) to the current window location.
 *
 * @param url - The URL to check
 * @returns true if the URL is an internal entity link, false otherwise
 */
export function isInternalEntityLink(url: string): boolean {
  try {
    const parsedUrl = new URL(url)
    const currentHost = window.location.host

    // Check if hosts match (includes subdomain)
    if (parsedUrl.host !== currentHost) {
      return false
    }

    // Check if URL matches the entity link pattern: /w/{workspaceId}/{tool}[/{itemId}]
    const pathMatch = parsedUrl.pathname.match(/^\/w\/([a-zA-Z0-9-]+)\/([a-zA-Z]+)(?:\/([a-zA-Z0-9-]+))?/)
    if (!pathMatch) {
      return false
    }

    // Verify the tool is a valid linkable tool
    const tool = pathMatch[2] as ToolType
    return LINKABLE_TOOLS.includes(tool)
  } catch {
    // Invalid URL
    return false
  }
}

/**
 * Parse an entity URL into its components.
 *
 * URL Patterns:
 * - General: /w/{workspaceId}/{tool}/{itemId}
 * - Projects: /w/{workspaceId}/projects/{projectId}
 * - Tasks: /w/{workspaceId}/projects/{projectId}/tasks/{taskId}
 * - Forum: /w/{workspaceId}/forum/{channelId}/{discussionId}
 *
 * @param url - The URL to parse
 * @returns EntityLinkInfo if valid, null otherwise
 */
export function parseEntityUrl(url: string): EntityLinkInfo | null {
  try {
    const parsedUrl = new URL(url)

    // Match the entity URL pattern: /w/{workspaceId}/{tool}/{itemId}[/{subtype}/{subId}]
    const pathMatch = parsedUrl.pathname.match(
      /^\/w\/([a-zA-Z0-9-]+)\/([a-zA-Z]+)(?:\/([a-zA-Z0-9-]+))?(?:\/([a-zA-Z0-9-]+))?(?:\/([a-zA-Z0-9-]+))?/
    )

    if (!pathMatch) {
      return null
    }

    const [, workspaceId, tool, firstId, secondId, thirdId] = pathMatch

    // Verify the tool is valid
    if (!LINKABLE_TOOLS.includes(tool as ToolType)) {
      return null
    }

    // For projects tool: /w/{workspaceId}/projects/{projectId}/tasks/{taskId}
    // firstId = projectId, secondId = "tasks", thirdId = taskId
    // Task links should treat the task ID as the primary entity ID.
    if (tool === "projects") {
      if (secondId === "tasks" && thirdId) {
        // This is a task link
        return {
          href: url,
          workspaceId,
          tool: "projects" as ToolType,
          // Tasks must use the task ID as the primary entity ID.
          entityId: thirdId, // taskId
          taskId: thirdId,
          projectId: firstId,
        }
      }
      // This is a project link (no task)
      if (firstId) {
        return {
          href: url,
          workspaceId,
          tool: "projects" as ToolType,
          entityId: firstId, // projectId
        }
      }
      return null
    }

    // For forum tool, the pattern is /w/{workspaceId}/forum/{channelId}/{discussionId}
    // firstId = channelId, secondId = discussionId (optional)
    if (tool === "forum" && secondId) {
      return {
        href: url,
        workspaceId,
        tool: tool as ToolType,
        entityId: secondId, // discussionId
        channelId: firstId,
      }
    }

    // For other tools: /w/{workspaceId}/{tool}/{itemId}
    if (!firstId) {
      // No item ID means it's just a tool root link, not an entity link
      return null
    }

    return {
      href: url,
      workspaceId,
      tool: tool as ToolType,
      entityId: firstId,
    }
  } catch {
    return null
  }
}

/**
 * Build a full entity URL from components.
 *
 * URL Patterns:
 * - Projects: /w/{workspaceId}/projects/{projectId}
 * - Tasks: /w/{workspaceId}/projects/{projectId}/tasks/{taskId}
 * - Forum: /w/{workspaceId}/forum/{channelId}/{discussionId}
 * - Others: /w/{workspaceId}/{tool}/{entityId}
 *
 * @param workspaceId - The workspace ID
 * @param tool - The tool type
 * @param entityId - The entity ID (projectId for projects/tasks, channelId for forum)
 * @param taskId - Optional task ID (for task-specific links)
 * @param discussionId - Optional discussion ID (for discussion links)
 * @returns The full entity URL
 */
export function buildEntityUrl(
  workspaceId: string,
  tool: ToolType,
  entityId: string,
  taskId?: string,
  discussionId?: string
): string {
  const origin = window.location.origin
  let path: string

  // For projects: /w/{workspaceId}/projects/{projectId}[/tasks/{taskId}]
  if (tool === "projects") {
    path = `/w/${workspaceId}/projects/${entityId}`
    if (taskId) {
      path += `/tasks/${taskId}`
    }
  }
  // For forum: /w/{workspaceId}/forum/{channelId}[/discussions/{discussionId}]
  else if (tool === "forum" && discussionId) {
    path = `/w/${workspaceId}/forum/${entityId}/discussions/${discussionId}`
  }
  // For other tools: /w/{workspaceId}/{tool}/{entityId}
  else {
    path = `/w/${workspaceId}/${tool}/${entityId}`
  }

  return `${origin}${path}`
}

/**
 * Get the entity type for display from a tool type.
 *
 * @param tool - The tool type
 * @param isTask - Whether this is a task within a project (vs a project itself)
 * @returns The entity type for display
 */
export function getEntityTypeFromTool(tool: ToolType, isTask?: boolean): WebEntityType {
  switch (tool) {
    case "projects":
      return isTask ? "task" : "project"
    case "papers":
      return "paper"
    case "memos":
      return "note"
    case "files":
      return "file"
    case "forum":
      return "discussion"
    case "contacts":
      return "contact"
    case "groups":
      return "group"
    default:
      return "file"
  }
}

/**
 * Get the icon name for an entity type.
 * Used for rendering entity link chips with appropriate icons.
 *
 * @param entityType - The entity type
 * @returns The lucide icon name
 */
export function getEntityIconName(entityType: WebEntityType): string {
  switch (entityType) {
    case "task":
      return "CheckSquare"
    case "project":
      return "FolderKanban"
    case "paper":
      return "FileText"
    case "note":
      return "StickyNote"
    case "file":
      return "File"
    case "folder":
      return "Folder"
    case "discussion":
      return "MessageSquare"
    case "reply":
      return "MessageCircle"
    case "channel":
      return "Hash"
    case "contact":
      return "User"
    case "mention":
      return "AtSign"
    case "group":
      return "Users"
    case "comment":
      return "MessageSquare"
    case "paper-comment":
    case "paper-comment-reply":
      return "MessageCircle"
    case "message":
      return "MessageCircle"
    default:
      return "Link"
  }
}

/**
 * Extract URLs from a text string.
 * Useful for detecting links in pasted content.
 *
 * @param text - The text to search for URLs
 * @returns Array of URLs found in the text
 */
export function extractUrlsFromText(text: string): string[] {
  // Match URLs that start with http:// or https://
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g
  const matches = text.match(urlRegex)
  return matches || []
}

/**
 * Check if a string is a valid URL.
 *
 * @param str - The string to check
 * @returns true if the string is a valid URL
 */
export function isValidUrl(str: string): boolean {
  try {
    new URL(str)
    return true
  } catch {
    return false
  }
}
