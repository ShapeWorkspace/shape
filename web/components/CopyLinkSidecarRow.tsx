/**
 * CopyLinkSidecarRow - Reusable sidecar row component for copying entity links.
 *
 * This component provides a "Copy link" action for any entity sidecar.
 * When clicked, it copies the entity's URL to the clipboard and shows
 * brief "Copied!" feedback.
 *
 * Usage:
 * ```tsx
 * <CopyLinkSidecarRow
 *   workspaceId={workspaceId}
 *   tool="tasks"
 *   entityId={projectId}
 *   taskId={taskId}  // optional, for task links
 *   index={5}
 * />
 * ```
 */

import { useState, useCallback, useEffect } from "react"
import { Link } from "lucide-react"
import { SidecarRow } from "./SidecarUI"
import { buildEntityUrl } from "../lib/entity-link-utils"
import type { ToolType } from "../store/types"

/**
 * Props for CopyLinkSidecarRow component.
 */
interface CopyLinkSidecarRowProps {
  /** Workspace ID for building the URL */
  workspaceId: string
  /** Tool type (tasks, papers, notes, files, forum, etc.) */
  tool: ToolType
  /** Entity ID (or project ID for tasks) */
  entityId: string
  /** Optional task ID for task-specific links */
  taskId?: string
  /** Index for keyboard navigation within sidecar */
  index: number
}

/**
 * CopyLinkSidecarRow renders a "Copy link" action in entity sidecars.
 *
 * After copying, shows "Copied!" feedback for 2 seconds before reverting
 * to "Copy link".
 */
export function CopyLinkSidecarRow({ workspaceId, tool, entityId, taskId, index }: CopyLinkSidecarRowProps) {
  const [copied, setCopied] = useState(false)

  // Reset copied state after 2 seconds
  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [copied])

  /**
   * Handle click to copy entity URL to clipboard.
   */
  const handleCopyLink = useCallback(async () => {
    const url = buildEntityUrl(workspaceId, tool, entityId, taskId)

    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch (error) {
      console.error("Failed to copy link to clipboard:", error)
    }
  }, [workspaceId, tool, entityId, taskId])

  return (
    <SidecarRow
      index={index}
      icon={<Link size={14} />}
      title={copied ? "Copied!" : "Copy link"}
      onClick={handleCopyLink}
      testId="copy-entity-link"
    />
  )
}
