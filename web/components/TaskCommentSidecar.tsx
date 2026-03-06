/**
 * TaskCommentSidecar displays contextual information and actions for a task comment.
 *
 * Features:
 * - Shows comment content preview
 * - Shows author and created date
 * - Edit action opens TaskCommentEditView
 * - Delete action (only for author)
 */

import { useCallback, useMemo, useState } from "react"
import { Calendar, User, Pencil, Trash2 } from "lucide-react"
import { useSidecar } from "../contexts/SidecarContext"
import { useWindowStore } from "../store/window-store"
import {
  Sidecar,
  SidecarSection,
  SidecarRow,
  SidecarMenu,
  SidecarMetaList,
  SidecarMetaItem,
} from "./SidecarUI"
import { useEngineStore } from "../store/engine-store"
import { useAuthStore } from "../store/auth-store"
import type { DecryptedTaskComment } from "../../engine/models/entity"
import { useDeleteTaskComment } from "../store/queries/use-task-comments"
import { LinksSidecarSection, useLinksSidecarItemCount } from "./LinksSidecarSection"
import * as styles from "../styles/sidecar.css"

/**
 * Props for TaskCommentSidecar component.
 */
interface TaskCommentSidecarProps {
  /** The project ID this comment belongs to */
  projectId: string
  /** The task ID this comment belongs to */
  taskId: string
  /** The comment to display in the sidecar */
  comment: DecryptedTaskComment
  /** Callback when the comment is deleted */
  onDeleted?: () => void
}

/**
 * TaskCommentSidecar displays contextual information and actions for a task comment.
 *
 * Sections:
 * - Comment content preview
 * - Details: author, created date
 * - Actions: Edit (opens TaskCommentEditView), Delete (if author)
 */
export function TaskCommentSidecar({ projectId, taskId, comment, onDeleted }: TaskCommentSidecarProps) {
  const { clearSidecar } = useSidecar()
  const { navigateTo } = useWindowStore()
  const { application } = useEngineStore()
  const { currentUser } = useAuthStore()
  const workspaceMemberManager = application?.getWorkspaceMemberManager()
  const { mutate: deleteComment, isPending: isDeleting } = useDeleteTaskComment()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Get count of entity links for keyboard navigation
  const linksItemCount = useLinksSidecarItemCount(comment.id, "task_comment")

  // Check if current user is the author
  const isAuthor = currentUser?.uuid === comment.creatorId

  // Get author name
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

  // Format date for display
  const formatDate = (date: Date | null) => {
    if (!date) return "Never"
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  // Handle edit comment - navigate to TaskCommentEditView terminus
  const handleEditComment = useCallback(() => {
    clearSidecar()
    navigateTo({
      id: `${projectId}-${taskId}-${comment.id}-edit`,
      label: "Edit Comment",
      tool: "projects",
      itemId: projectId,
      taskId,
      commentId: comment.id,
    })
  }, [navigateTo, clearSidecar, projectId, taskId, comment.id])

  // Handle showing delete confirmation
  const handleShowDeleteConfirm = useCallback(() => {
    if (!isAuthor) return
    setShowDeleteConfirm(true)
  }, [isAuthor])

  const handleCancelDelete = useCallback(() => {
    setShowDeleteConfirm(false)
  }, [])

  // Handle actual deletion after confirmation
  const handleConfirmDelete = useCallback(() => {
    if (isDeleting || !isAuthor) return

    deleteComment(
      { commentId: comment.id },
      {
        onSuccess: () => {
          clearSidecar()
          onDeleted?.()
        },
        onError: () => {
          setShowDeleteConfirm(false)
        },
      }
    )
  }, [
    comment.id,
    clearSidecar,
    onDeleted,
    isDeleting,
    isAuthor,
    deleteComment,
  ])

  const editIndex = 0
  const deleteIndex = 1
  const confirmDeleteIndex = 2
  const cancelDeleteIndex = 3

  // Determine item count based on user permissions + links.
  // Edit and Delete only if author, plus optional delete confirm/cancel sub-rows.
  const baseItemCount = isAuthor ? 2 + (showDeleteConfirm ? 2 : 0) : 0
  const totalItemCount = baseItemCount + linksItemCount

  // Handle keyboard selection
  const handleSelect = useCallback(
    (index: number) => {
      if (!isAuthor) return
      if (index === editIndex) {
        handleEditComment()
      } else if (index === deleteIndex) {
        handleShowDeleteConfirm()
      } else if (index === confirmDeleteIndex && showDeleteConfirm) {
        handleConfirmDelete()
      } else if (index === cancelDeleteIndex && showDeleteConfirm) {
        handleCancelDelete()
      }
    },
    [
      isAuthor,
      showDeleteConfirm,
      editIndex,
      deleteIndex,
      confirmDeleteIndex,
      cancelDeleteIndex,
      handleEditComment,
      handleShowDeleteConfirm,
      handleConfirmDelete,
      handleCancelDelete,
    ]
  )

  // Truncate comment body for display
  const bodyPreview = useMemo(() => {
    const body = comment.content.body || ""
    // Strip HTML for preview
    const textOnly = body.replace(/<[^>]*>/g, "")
    if (textOnly.length > 200) {
      return textOnly.substring(0, 200) + "..."
    }
    return textOnly || "(empty comment)"
  }, [comment.content.body])

  return (
    <Sidecar itemCount={totalItemCount} onSelect={handleSelect}>
      {/* Content Preview */}
      <SidecarSection title="Comment">
        <div className={styles.sidecarContentPreview} data-testid="task-comment-sidecar-content">
          {bodyPreview}
        </div>
      </SidecarSection>

      {/* Details Section */}
      <SidecarSection title="Details">
        <SidecarMetaList>
          <SidecarMetaItem icon={<User size={12} />} label="Author" value={authorName} />
          <SidecarMetaItem
            icon={<Calendar size={12} />}
            label="Created"
            value={formatDate(comment.createdAt)}
          />
        </SidecarMetaList>
      </SidecarSection>

      {/* Actions Section - only for author */}
      {isAuthor && (
        <SidecarSection title="Actions">
          <SidecarMenu>
            <SidecarRow
              index={editIndex}
              icon={<Pencil size={14} />}
              title="Edit"
              onClick={handleEditComment}
              testId="task-comment-edit"
            />
            <SidecarRow
              index={deleteIndex}
              icon={<Trash2 size={14} />}
              title={isDeleting ? "Deleting..." : "Delete"}
              onClick={handleShowDeleteConfirm}
              isDestructive
              testId="task-comment-delete"
            />
            {showDeleteConfirm && (
              <>
                <SidecarRow
                  index={confirmDeleteIndex}
                  title={isDeleting ? "Deleting..." : "Confirm"}
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  isDestructive
                  isSubRow
                  testId="confirm-delete-comment"
                />
                <SidecarRow
                  index={cancelDeleteIndex}
                  title="Cancel"
                  onClick={handleCancelDelete}
                  disabled={isDeleting}
                  isSubRow
                  testId="task-comment-delete-cancel"
                />
              </>
            )}
          </SidecarMenu>
        </SidecarSection>
      )}

      {/* Entity Links Section */}
      <LinksSidecarSection entityId={comment.id} entityType="comment" startIndex={baseItemCount} />
    </Sidecar>
  )
}
