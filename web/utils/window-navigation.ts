import type { ToolType } from "../store/types"

export type WindowLocationItemType = "paper" | "file" | "video-recording" | "audio-recording"

export interface ParsedWindowLocation {
  tool: ToolType
  itemId?: string
  taskId?: string
  commentId?: string
  discussionId?: string
  folderId?: string
  itemType?: WindowLocationItemType
}

const VALID_WORKSPACE_TOOL_TYPES: ToolType[] = [
  "drafts",
  "inbox",
  "memos",
  "contacts",
  "groups",
  "files",
  "papers",
  "forum",
  "projects",
  "settings",
]

/**
 * Validates that a URL segment maps to a workspace tool.
 */
export function isValidWorkspaceToolType(value: string): value is ToolType {
  return VALID_WORKSPACE_TOOL_TYPES.includes(value as ToolType)
}

/**
 * Parse a workspace URL into window navigation state.
 * Keeps logic centralized so URL parsing stays consistent across features.
 */
export function parseWindowLocationFromUrl(
  pathname: string,
  search: string
): ParsedWindowLocation | null {
  const pathSegments = pathname.split("/").filter(Boolean)

  if (pathSegments.length < 3) {
    return null
  }
  if (pathSegments[0] !== "w") {
    return null
  }

  const toolCandidate = pathSegments[2]
  if (!isValidWorkspaceToolType(toolCandidate)) {
    return null
  }

  const parsedLocation: ParsedWindowLocation = {
    tool: toolCandidate,
  }

  const itemIdSegment = pathSegments[3]
  if (itemIdSegment) {
    parsedLocation.itemId = itemIdSegment
  }

  if (toolCandidate === "projects" && pathSegments[4] === "tasks" && pathSegments[5]) {
    parsedLocation.taskId = pathSegments[5]
  }

  if (toolCandidate === "forum" && pathSegments[4] === "discussions" && pathSegments[5]) {
    parsedLocation.discussionId = pathSegments[5]
  }

  if (search) {
    const searchParams = new URLSearchParams(search)
    const folderParam = searchParams.get("folder")
    if (folderParam) {
      parsedLocation.folderId = folderParam
    }

    const commentParam = searchParams.get("commentId")
    if (commentParam) {
      parsedLocation.commentId = commentParam
    }

    const typeParam = searchParams.get("type")
    if (
      typeParam === "paper" ||
      typeParam === "file" ||
      typeParam === "video-recording" ||
      typeParam === "audio-recording"
    ) {
      parsedLocation.itemType = typeParam
    }
  }

  return parsedLocation
}
