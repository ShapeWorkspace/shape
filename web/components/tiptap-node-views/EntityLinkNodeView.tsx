/**
 * React component for rendering entity link nodes in TipTap editor.
 *
 * Entity links are rendered as inline chips showing an icon (based on entity type)
 * and the entity title. Clicking the chip navigates to the entity in a new in-app
 * window.
 *
 * The chip displays:
 * - An icon representing the entity type (task, paper, note, file, etc.)
 * - The entity title (fetched from the entity or a preview of its content)
 *
 * Navigation uses the window store's createWindow() to open the entity in a new
 * window tab within the app.
 */

import { useCallback } from "react"
import { NodeViewWrapper } from "@tiptap/react"
import type { NodeViewProps } from "@tiptap/react"
import { useNavigate } from "react-router-dom"
import {
  CheckSquare,
  FileText,
  StickyNote,
  File,
  Folder,
  MessageSquare,
  Hash,
  User,
  Users,
  FolderKanban,
  Link,
  Loader2,
  AtSign,
} from "lucide-react"
import * as styles from "../../styles/entity-link.css"
import type { EntityLinkAttributes } from "../tiptap-extensions/EntityLinkNode"
import type { WebEntityType } from "../../lib/entity-link-utils"
import { useWindowStore } from "../../store/window-store"
import type { ToolType } from "../../store/types"
import { useEntityLinkPreview } from "../../store/queries/use-entity-link-preview"

/**
 * Returns appropriate icon component based on entity type.
 */
function getEntityIcon(entityType: WebEntityType) {
  switch (entityType) {
    case "task":
      return <CheckSquare size={12} />
    case "project":
      return <FolderKanban size={12} />
    case "paper":
      return <FileText size={12} />
    case "note":
      return <StickyNote size={12} />
    case "file":
      return <File size={12} />
    case "folder":
      return <Folder size={12} />
    case "discussion":
      return <MessageSquare size={12} />
    case "channel":
      return <Hash size={12} />
    case "contact":
      return <User size={12} />
    case "mention":
      return <AtSign size={12} />
    case "group":
      return <Users size={12} />
    default:
      return <Link size={12} />
  }
}

/**
 * EntityLinkNodeView renders entity links as interactive chips within the TipTap editor.
 * This component is used by ReactNodeViewRenderer in the EntityLinkNode extension.
 */
export function EntityLinkNodeView({ node, selected }: NodeViewProps) {
  const attrs = node.attrs as EntityLinkAttributes
  const { entityType, entityId, title, tool, projectId, channelId, href } = attrs

  const { createWindow, createWindowFromPath } = useWindowStore()
  const navigate = useNavigate()

  // Fetch the entity preview data (title or body preview)
  // For tasks: entityId is the task ID, projectId is the parent project ID
  // For discussions: entityId is discussionId, channelId is the channel ID
  const preview = useEntityLinkPreview(entityType as WebEntityType, entityId, projectId, channelId, title)

  // Use fetched title or fall back to stored title
  const displayTitle = preview.isLoading ? title : preview.title

  /**
   * Handle click on the entity link chip.
   * Opens the entity in a new in-app window tab.
   * Uses createWindowFromPath to handle arbitrary paths including nested routes.
   */
  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()

      // Prefer href for full path support (e.g., /w/{workspaceId}/projects/{projectId}/tasks/{taskId})
      if (href) {
        let navigationPath = href
        try {
          const url = new URL(href)
          navigationPath = `${url.pathname}${url.search}`
        } catch {
          // If href is already a path, use it directly.
        }
        createWindowFromPath(navigationPath)
        navigate(navigationPath)
      } else {
        // Fallback: use createWindow with simple tool/entityId
        createWindow(tool as ToolType, entityId)
      }
    },
    [href, createWindowFromPath, createWindow, tool, entityId, navigate]
  )

  // Build class names based on state
  const chipClassNames = [styles.entityLinkChip]
  if (selected) chipClassNames.push(styles.entityLinkSelected)

  return (
    <NodeViewWrapper className={styles.entityLinkWrapper} data-testid="entity-link-chip">
      <span
        className={chipClassNames.join(" ")}
        onClick={handleClick}
        role="link"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            handleClick(e as unknown as React.MouseEvent)
          }
        }}
        title={`Open ${entityType}: ${displayTitle}`}
      >
        <span className={styles.entityLinkIcon}>
          {preview.isLoading ? (
            <Loader2 size={12} className={styles.entityLinkIconLoading} />
          ) : (
            getEntityIcon(entityType as WebEntityType)
          )}
        </span>
        <span className={styles.entityLinkTitle}>{displayTitle || "Link"}</span>
      </span>
    </NodeViewWrapper>
  )
}
