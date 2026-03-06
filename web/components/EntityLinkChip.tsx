/**
 * EntityLinkChip renders an entity link as a read-only chip.
 *
 * Used in TipTapRenderer to display entity links outside the editor context.
 * Clicking the chip navigates to the linked entity in-app.
 */

import React, { useCallback } from "react"
import { useNavigate } from "react-router-dom"
import {
  CheckSquare,
  FileText,
  StickyNote,
  File,
  MessageCircle,
  MessageSquare,
  Folder,
  FolderKanban,
  Hash,
  User,
  Users,
  AtSign,
  Link as LinkIcon,
  Loader2,
} from "lucide-react"
import { useWindowStore } from "../store/window-store"
import type { WebEntityType } from "../lib/entity-link-utils"
import type { ToolType } from "../store/types"
import * as styles from "../styles/entity-link.css"
import { useEntityLinkPreview } from "../store/queries/use-entity-link-preview"
import { useEngineStore } from "@/store/engine-store"

interface EntityLinkNavigationPathInput {
  href: string
  workspaceId: string
  tool?: string
  entityId: string
  projectId?: string | null
  taskId?: string | null
  channelId?: string | null
}

/**
 * Resolve a safe in-app navigation path for an entity link.
 * Prefers the href when it already contains a workspace path, otherwise rebuilds from attributes.
 */
function resolveEntityLinkNavigationPath({
  href,
  workspaceId,
  tool,
  entityId,
  projectId,
  taskId,
  channelId,
}: EntityLinkNavigationPathInput): string | null {
  if (href) {
    try {
      const url = new URL(href)
      if (url.pathname.startsWith("/w/")) {
        return url.pathname
      }
    } catch {
      if (href.startsWith("/w/")) {
        return href
      }
      if (href.startsWith("w/")) {
        return `/${href}`
      }
    }
  }

  if (!workspaceId || !tool || !entityId) {
    return null
  }

  if (tool === "projects" && taskId && projectId) {
    return `/w/${workspaceId}/projects/${projectId}/tasks/${taskId}`
  }

  if (tool === "forum" && channelId) {
    return `/w/${workspaceId}/forum/${channelId}/discussions/${entityId}`
  }

  return `/w/${workspaceId}/${tool}/${entityId}`
}

/**
 * Props for EntityLinkChip component.
 */
export interface EntityLinkChipProps {
  /** Full URL of the entity link */
  href: string
  /** Type of entity (task, paper, note, file, discussion, etc.) */
  entityType: string
  /** ID of the linked entity */
  entityId: string
  /** Workspace ID containing the entity */
  workspaceId: string
  /** Display title for the chip */
  title: string
  /** Tool type (tasks, papers, notes, files, forum, etc.) */
  tool?: string
  /** Project ID for task links within projects */
  projectId?: string | null
  /** Task ID for task links (redundant with entityId) */
  taskId?: string | null
  /** Channel ID for discussion links within channels */
  channelId?: string | null
}

/**
 * Get the icon component for an entity type.
 */
function getIconForEntityType(entityType: string) {
  switch (entityType) {
    case "task":
      return CheckSquare
    case "project":
      return FolderKanban
    case "paper":
      return FileText
    case "note":
      return StickyNote
    case "file":
      return File
    case "folder":
      return Folder
    case "discussion":
      return MessageSquare
    case "channel":
      return Hash
    case "contact":
      return User
    case "mention":
      return AtSign
    case "group":
      return Users
    case "reply":
    case "comment":
    case "paper-comment":
    case "paper-comment-reply":
    case "message":
      return MessageCircle
    default:
      return LinkIcon
  }
}

/**
 * EntityLinkChip component for read-only entity link rendering.
 */
export function EntityLinkChip({
  href,
  entityType,
  entityId,
  workspaceId,
  title,
  tool,
  projectId,
  taskId,
  channelId,
}: EntityLinkChipProps) {
  const { createWindow, createWindowFromPath } = useWindowStore()
  const { application } = useEngineStore()
  const navigate = useNavigate()

  // Contacts must resolve against the current workspace for reliable DM routing.
  const effectiveWorkspaceId = workspaceId || application?.workspaceId || ""

  // Fetch the entity preview data (title or body preview)
  const preview = useEntityLinkPreview(entityType as WebEntityType, entityId, projectId, channelId, title)

  // Use fetched title or fall back to stored title
  const displayTitle = preview.isLoading ? title : preview.title

  // Get the icon for this entity type
  const Icon = getIconForEntityType(entityType)

  /**
   * Handle click to navigate to the entity.
   * Uses createWindowFromPath to open in a new in-app window with full path support.
   */
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // Contacts/mentions should always open the direct message view in the current workspace.
      if ((entityType === "contact" || entityType === "mention" || entityType === "member") && entityId) {
        if (effectiveWorkspaceId) {
          navigate(`/w/${effectiveWorkspaceId}/contacts/${entityId}`)
          return
        }
        createWindow("contacts", entityId)
        return
      }

      // Resolve a path that the window store can always interpret.
      const resolvedNavigationPath = resolveEntityLinkNavigationPath({
        href,
        workspaceId: effectiveWorkspaceId,
        tool,
        entityId,
        projectId,
        taskId,
        channelId,
      })

      if (resolvedNavigationPath) {
        createWindowFromPath(resolvedNavigationPath)
        navigate(resolvedNavigationPath)
        return
      }

      if (tool && entityId) {
        // Fallback: use createWindow with simple tool/entityId.
        createWindow(tool as ToolType, entityId)
      }
    },
    [
      href,
      effectiveWorkspaceId,
      tool,
      entityId,
      projectId,
      taskId,
      channelId,
      entityType,
      createWindowFromPath,
      createWindow,
      navigate,
    ]
  )

  return (
    <span
      className={styles.entityLinkChip}
      onClick={handleClick}
      data-entity-link="true"
      data-testid="entity-link-chip"
      data-entity-type={entityType}
      data-entity-id={entityId}
      data-project-id={projectId ?? undefined}
      data-task-id={taskId ?? undefined}
      data-workspace-id={workspaceId}
      data-tool={tool}
      role="link"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          handleClick(e as unknown as React.MouseEvent)
        }
      }}
    >
      <span className={styles.entityLinkIcon}>
        {preview.isLoading ? (
          <Loader2 size={12} className={styles.entityLinkIconLoading} />
        ) : (
          <Icon size={12} />
        )}
      </span>
      <span className={styles.entityLinkTitle}>{displayTitle}</span>
    </span>
  )
}
