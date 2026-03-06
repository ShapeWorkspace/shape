/**
 * TaskCommentItem displays a single task comment in the comments list.
 *
 * Features:
 * - Shows author name and timestamp
 * - Renders HTML body content with TipTapRenderer (supports images/attachments)
 * - Clickable to open TaskCommentSidecar for actions
 */

import { useMemo } from "react"
import { useEngineStore } from "../store/engine-store"
import { useAuthStore } from "../store/auth-store"
import { TipTapRenderer } from "./TipTapRenderer"
import { ReactionBar } from "./reactions/ReactionBar"
import type { DecryptedTaskComment } from "../../engine/models/entity"
import * as forumStyles from "../styles/forum.css"

/**
 * Props for the TaskCommentItem component.
 */
export interface TaskCommentItemProps {
  /** The comment to display */
  comment: DecryptedTaskComment
  /** Callback when the comment is clicked */
  onClick?: () => void
}

/**
 * TaskCommentItem renders a single comment in the task comments list.
 */
export function TaskCommentItem({ comment, onClick }: TaskCommentItemProps) {
  const { application } = useEngineStore()
  const { currentUser } = useAuthStore()
  const workspaceMemberManager = application?.getWorkspaceMemberManager()

  // Get author name from member service or current user
  const authorName = useMemo(() => {
    if (!comment.creatorId) return "Unknown"

    // If the author is the current user, use their name directly
    if (currentUser && currentUser.uuid === comment.creatorId) {
      return "You"
    }

    // Otherwise look up from member service
    if (workspaceMemberManager) {
      const members = workspaceMemberManager.getWorkspaceMembers()
      const member = members.find(m => m.userId === comment.creatorId)
      if (member) {
        return member.displayName
      }
    }

    return "Unknown"
  }, [comment.creatorId, currentUser, workspaceMemberManager])

  // Format timestamp
  const formattedTime = useMemo(() => {
    const date = new Date(comment.createdAt)
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }, [comment.createdAt])

  return (
    <div
      className={forumStyles.discussionReply}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick?.()
        }
      }}
      data-testid={`task-comment-item-${comment.id}`}
    >
      <div className={forumStyles.discussionReplyHeader}>
        {authorName} · {formattedTime}
      </div>
      <div data-testid="task-comment-body">
        <TipTapRenderer content={comment.content.body || ""} compact />
      </div>
      <ReactionBar
        entityId={comment.id}
        entityType="task-comment"
        testIdPrefix={`task-comment-${comment.id}`}
      />
    </div>
  )
}
