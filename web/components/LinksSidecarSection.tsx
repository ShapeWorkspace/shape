/**
 * LinksSidecarSection displays entity links in the sidecar.
 *
 * Shows two subsections:
 * - "Links" - entities that this entity links to
 * - "Linked By" - entities that link to this entity (backlinks)
 *
 * Each link is a clickable row that navigates to the target entity.
 * If no links exist, displays a message indicating no links.
 */

import { useCallback } from "react"
import {
  CheckSquare,
  FileText,
  StickyNote,
  File,
  MessageCircle,
  Folder,
  ListTodo,
  Link as LinkIcon,
  Loader2,
} from "lucide-react"
import { SidecarSection, SidecarRow, SidecarMenu, SidecarDescription } from "./SidecarUI"
import { ENTITY_TYPE_SINGULAR_LABELS } from "../constants/tool-labels"
import { useEntityLinks } from "../store/queries/use-entity-links"
import { useEntityLinkPreview } from "../store/queries/use-entity-link-preview"
import { useWindowStore } from "../store/window-store"
import { useEngineStore } from "../store/engine-store"
import type { EntityLink } from "../../engine/models/entity-link"
import type { WebEntityType } from "../lib/entity-link-utils"
import type { ToolType } from "../store/types"

/**
 * Props for LinksSidecarSection.
 */
interface LinksSidecarSectionProps {
  /** The entity ID to fetch links for */
  entityId: string
  /** The entity type (for display purposes) */
  entityType: string
  /** Starting index for keyboard navigation (continues from previous section) */
  startIndex: number
}

/**
 * Map server entity type to client EntityType for display and icon lookup.
 */
function serverEntityTypeToClientType(serverType: string): WebEntityType {
  switch (serverType) {
    case "project_task":
      return "task"
    case "paper":
      return "paper"
    case "note":
      return "note"
    case "file":
      return "file"
    case "folder":
      return "folder"
    case "forum_discussion":
      return "discussion"
    case "forum_reply":
      return "reply"
    case "forum_channel":
      return "channel"
    case "project":
      return "project"
    case "group_chat":
      return "group"
    case "group_message":
      return "message"
    case "task_comment":
      return "comment"
    case "paper_comment":
      return "paper-comment"
    case "paper_comment_reply":
      return "paper-comment-reply"
    case "member":
      return "contact"
    default:
      return "file"
  }
}

/**
 * Map server entity type to tool type for navigation.
 */
function serverEntityTypeToToolType(serverType: string): ToolType {
  switch (serverType) {
    case "project_task":
      return "projects"
    case "task_comment":
      return "projects" // Comments navigate to projects tool
    case "project":
      return "projects"
    case "paper":
      return "papers"
    case "paper_comment":
      return "papers"
    case "paper_comment_reply":
      return "papers"
    case "note":
      return "memos"
    case "file":
      return "files"
    case "folder":
      return "files"
    case "forum_discussion":
      return "forum"
    case "forum_reply":
      return "forum" // Replies navigate to forum tool
    case "forum_channel":
      return "forum"
    case "group_chat":
      return "groups"
    case "group_message":
      return "groups" // Messages navigate to groups tool
    case "member":
      return "contacts"
    default:
      return "files"
  }
}

/**
 * Get icon component for an entity type.
 */
function getIconForEntityType(entityType: WebEntityType) {
  switch (entityType) {
    case "task":
      return CheckSquare
    case "paper":
      return FileText
    case "note":
      return StickyNote
    case "file":
      return File
    case "discussion":
      return MessageCircle
    case "reply":
      return MessageCircle
    case "folder":
      return Folder
    case "project":
      return ListTodo
    case "comment":
      return MessageCircle
    case "paper-comment":
      return MessageCircle
    case "paper-comment-reply":
      return MessageCircle
    case "message":
      return MessageCircle
    default:
      return LinkIcon
  }
}

/**
 * Individual link row component.
 * Uses useEntityLinkPreview to fetch and display the linked entity's title.
 */
interface LinkRowProps {
  link: EntityLink
  index: number
  direction: "outgoing" | "incoming"
}

function LinkRow({ link, index, direction }: LinkRowProps) {
  const { createWindow, createWindowFromPath } = useWindowStore()
  const { application } = useEngineStore()
  const activeWorkspaceId = application?.workspaceId ?? ""

  // Determine the target entity based on direction
  const targetEntityType = direction === "outgoing" ? link.targetEntityType : link.sourceEntityType
  const targetEntityId = direction === "outgoing" ? link.targetEntityId : link.sourceEntityId
  // Source context is only relevant for incoming links (backlinks from child entities)
  const sourceContext = direction === "incoming" ? link.sourceContext : undefined

  // Map to client entity type for display
  const clientEntityType = serverEntityTypeToClientType(targetEntityType)
  const toolType = serverEntityTypeToToolType(targetEntityType)
  const Icon = getIconForEntityType(clientEntityType)

  // Fetch preview for the linked entity
  // Pass sourceContext for child entities (replies, comments, messages) to enable content preview
  const preview = useEntityLinkPreview(
    clientEntityType,
    targetEntityId,
    undefined, // taskId - not used here
    undefined, // channelId - not used here
    undefined, // fallbackTitle
    sourceContext
  )

  // Handle click to navigate to the linked entity
  // For child entities (replies, comments, messages), use source context for proper navigation
  const handleClick = useCallback(() => {
    // Forum reply: navigate to /forum/{channelId}/discussions/{discussionId}
    if (targetEntityType === "forum_reply" && sourceContext?.channel_id && sourceContext?.discussion_id) {
      const path = `/w/${activeWorkspaceId}/forum/${sourceContext.channel_id}/discussions/${sourceContext.discussion_id}`
      createWindowFromPath(path)
      return
    }

    // Task comment: navigate to /projects/{projectId}/tasks/{taskId}
    if (targetEntityType === "task_comment" && sourceContext?.project_id && sourceContext?.task_id) {
      const path = `/w/${activeWorkspaceId}/projects/${sourceContext.project_id}/tasks/${sourceContext.task_id}`
      createWindowFromPath(path)
      return
    }

    // Paper comment: navigate to /papers/{paperId}?commentId={commentId}
    if (targetEntityType === "paper_comment" && sourceContext?.paper_id) {
      const path = `/w/${activeWorkspaceId}/papers/${sourceContext.paper_id}?commentId=${targetEntityId}`
      createWindowFromPath(path)
      return
    }

    // Paper comment reply: navigate to parent thread using paper_comment_id
    if (
      targetEntityType === "paper_comment_reply" &&
      sourceContext?.paper_id &&
      sourceContext?.paper_comment_id
    ) {
      const path = `/w/${activeWorkspaceId}/papers/${sourceContext.paper_id}?commentId=${sourceContext.paper_comment_id}`
      createWindowFromPath(path)
      return
    }

    // Group message: navigate to /groups/{groupId}
    if (targetEntityType === "group_message" && sourceContext?.group_id) {
      const path = `/w/${activeWorkspaceId}/groups/${sourceContext.group_id}`
      createWindowFromPath(path)
      return
    }

    // Default: simple navigation
    createWindow(toolType, targetEntityId)
  }, [
    createWindow,
    createWindowFromPath,
    activeWorkspaceId,
    toolType,
    targetEntityId,
    targetEntityType,
    sourceContext,
  ])

  return (
    <SidecarRow
      index={index}
      icon={preview.isLoading ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
      title={preview.title}
      sublabel={preview.sublabel}
      onClick={handleClick}
    />
  )
}

/**
 * LinksSidecarSection component.
 * Fetches and displays entity links and backlinks.
 */
export function LinksSidecarSection({ entityId, entityType, startIndex }: LinksSidecarSectionProps) {
  // Fetch links for this entity
  const { data, isLoading, isError } = useEntityLinks(entityId, entityType)

  // Early return for loading state
  if (isLoading) {
    return (
      <SidecarSection title="Links">
        <SidecarDescription>
          <Loader2 size={14} className="animate-spin" style={{ display: "inline-block" }} /> Loading links...
        </SidecarDescription>
      </SidecarSection>
    )
  }

  // Early return for error state
  if (isError) {
    return (
      <SidecarSection title="Links">
        <SidecarDescription>Failed to load links</SidecarDescription>
      </SidecarSection>
    )
  }

  // No links at all
  const hasLinks = data && data.links.length > 0
  const hasBacklinks = data && data.linkedBy.length > 0

  if (!hasLinks && !hasBacklinks) {
    const displayLabel = ENTITY_TYPE_SINGULAR_LABELS[entityType] || entityType
    return (
      <SidecarSection title="Links">
        <SidecarDescription>
          This {displayLabel} does not link to, and is not linked by, another item.
        </SidecarDescription>
      </SidecarSection>
    )
  }

  // Track the current keyboard navigation index
  let currentIndex = startIndex

  return (
    <>
      {/* Outgoing links section */}
      {hasLinks && (
        <SidecarSection title="Links">
          <SidecarMenu>
            {data.links.map(link => {
              const rowIndex = currentIndex
              currentIndex++
              return <LinkRow key={link.id} link={link} index={rowIndex} direction="outgoing" />
            })}
          </SidecarMenu>
        </SidecarSection>
      )}

      {/* Backlinks section */}
      {hasBacklinks && (
        <SidecarSection title="Linked By">
          <SidecarMenu>
            {data.linkedBy.map(link => {
              const rowIndex = currentIndex
              currentIndex++
              return <LinkRow key={link.id} link={link} index={rowIndex} direction="incoming" />
            })}
          </SidecarMenu>
        </SidecarSection>
      )}
    </>
  )
}

/**
 * Calculate the total number of link items for keyboard navigation.
 * Call this when setting up the sidecar itemCount.
 */
export function useLinksSidecarItemCount(entityId: string, entityType?: string): number {
  const { data } = useEntityLinks(entityId, entityType)

  if (!data) {
    return 0
  }

  return data.links.length + data.linkedBy.length
}
