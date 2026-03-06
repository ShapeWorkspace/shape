import { useCallback, useMemo, useState } from "react"
import { Calendar, User, Trash2 } from "lucide-react"
import { useSidecar } from "../contexts/SidecarContext"
import { useDrafts } from "../contexts/DraftContext"
import { useDraftState } from "../hooks/useDraftState"
import {
  Sidecar,
  SidecarSection,
  SidecarRow,
  SidecarMenu,
  SidecarMetaList,
  SidecarMetaItem,
} from "./SidecarUI"
import { useDeleteForumReply } from "../store/queries/use-forum-channels"
import { useEngineStore } from "../store/engine-store"
import { useAuthStore } from "../store/auth-store"
import type { DecryptedForumDiscussionReply } from "../../engine/models/entity"
import { DraftSidecarSection } from "./DraftSidecarSection"
import { LinksSidecarSection, useLinksSidecarItemCount } from "./LinksSidecarSection"
import * as styles from "../styles/sidecar.css"

/**
 * Props for ForumReplySidecar component.
 */
interface ForumReplySidecarProps {
  // The channel ID this reply belongs to
  channelId: string
  // The discussion ID this reply belongs to
  discussionId: string
  // The reply to display in the sidecar
  reply: DecryptedForumDiscussionReply
  // Callback when the reply is deleted
  onDeleted?: () => void
}

/**
 * ForumReplySidecar displays contextual information and actions for a forum reply.
 *
 * Sections:
 * - Reply content preview
 * - Details: author, created date
 * - Actions: Delete (if author)
 */
export function ForumReplySidecar({ channelId, discussionId, reply, onDeleted }: ForumReplySidecarProps) {
  const { clearSidecar } = useSidecar()
  const { mutate: deleteReply } = useDeleteForumReply()
  const { application } = useEngineStore()
  const { currentUser } = useAuthStore()
  const { retryDraft, discardDraft, restoreDraftAsNew, syncAllDrafts } = useDrafts()
  const workspaceMemberManager = application?.getWorkspaceMemberManager()
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Get count of entity links for keyboard navigation
  const linksItemCount = useLinksSidecarItemCount(reply.id, "forum_reply")

  // Get canonical reply for draft conflict detection.
  const canonicalReply = useMemo(() => {
    if (!application) {
      return null
    }
    return application.getCacheStores().entityStore.getCanonical<DecryptedForumDiscussionReply>(reply.id) ?? null
  }, [application, reply.id])

  // Draft state for offline/conflict handling.
  const draftState = useDraftState({
    entityType: "forum-reply",
    entityId: reply.id,
    canonicalExists: Boolean(canonicalReply),
  })

  // Count of draft action rows for keyboard navigation.
  const draftActionCount = draftState.hasDraft ? (draftState.isConflict || draftState.isOrphaned ? 2 : 1) : 0

  // Check if current user is the author
  const isAuthor = currentUser?.uuid === reply.creatorId

  // Get author name
  const authorName = useMemo(() => {
    if (!reply.creatorId) return "Unknown"

    // If the author is the current user, use their name directly
    if (currentUser && currentUser.uuid === reply.creatorId) {
      return "You"
    }

    // Otherwise look up from member service
    if (workspaceMemberManager) {
      const members = workspaceMemberManager.getWorkspaceMembers()
      const member = members.find(m => m.userId === reply.creatorId)
      if (member) {
        return member.displayName
      }
    }

    return "Unknown"
  }, [reply.creatorId, currentUser, workspaceMemberManager])

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

  const handleRetryDraft = useCallback(() => {
    retryDraft("forum-reply", reply.id)
  }, [retryDraft, reply.id])

  const handleDiscardDraft = useCallback(() => {
    discardDraft("forum-reply", reply.id)
  }, [discardDraft, reply.id])

  const handleRestore = useCallback(() => {
    restoreDraftAsNew("forum-reply", reply.id)
  }, [restoreDraftAsNew, reply.id])

  const handleSyncAllDrafts = useCallback(() => {
    syncAllDrafts()
  }, [syncAllDrafts])

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
    setIsDeleting(true)
    deleteReply(
      { channelId, discussionId, replyId: reply.id },
      {
        onSuccess: () => {
          clearSidecar()
          onDeleted?.()
        },
        onError: () => {
          setIsDeleting(false)
          setShowDeleteConfirm(false)
        },
      }
    )
  }, [deleteReply, channelId, discussionId, reply.id, clearSidecar, onDeleted, isDeleting, isAuthor])

  const deleteIndex = draftActionCount
  const confirmDeleteIndex = deleteIndex + 1
  const cancelDeleteIndex = deleteIndex + 2

  // Only author can delete - includes optional confirm/cancel sub-rows + links
  const baseItemCount = isAuthor ? 1 + (showDeleteConfirm ? 2 : 0) : 0
  const totalItemCount = draftActionCount + baseItemCount + linksItemCount

  // Handle keyboard selection
  const handleSelect = useCallback(
    (index: number) => {
      const adjustedIndex = index - draftActionCount
      if (!isAuthor || adjustedIndex < 0) return
      if (adjustedIndex === 0) {
        handleShowDeleteConfirm()
      } else if (adjustedIndex === 1 && showDeleteConfirm) {
        handleConfirmDelete()
      } else if (adjustedIndex === 2 && showDeleteConfirm) {
        handleCancelDelete()
      }
    },
    [
      isAuthor,
      handleShowDeleteConfirm,
      handleConfirmDelete,
      handleCancelDelete,
      showDeleteConfirm,
      draftActionCount,
    ]
  )

  // Truncate reply body for display
  const bodyPreview = useMemo(() => {
    const body = reply.content.body || ""
    if (body.length > 200) {
      return body.substring(0, 200) + "..."
    }
    return body || "(empty reply)"
  }, [reply.content.body])

  return (
    <Sidecar itemCount={totalItemCount} onSelect={handleSelect}>
      {/* Draft Section - shown when there's a draft */}
      <DraftSidecarSection
        entityLabel="reply"
        draftState={draftState}
        canonicalUpdatedAt={canonicalReply?.updatedAt}
        localUpdatedAt={draftState.draftEntity ? new Date(draftState.draftEntity.entity.updated_at) : reply.updatedAt}
        startIndex={0}
        onRetry={handleRetryDraft}
        onDiscard={handleDiscardDraft}
        onRestore={handleRestore}
        onSyncAllDrafts={handleSyncAllDrafts}
      />

      {/* Content Preview */}
      <SidecarSection title="Reply">
        <div className={styles.sidecarContentPreview}>{bodyPreview}</div>
      </SidecarSection>

      {/* Details Section */}
      <SidecarSection title="Details">
        <SidecarMetaList>
          <SidecarMetaItem icon={<User size={12} />} label="Author" value={authorName} />
          <SidecarMetaItem
            icon={<Calendar size={12} />}
            label="Created"
            value={formatDate(reply.createdAt)}
          />
        </SidecarMetaList>
      </SidecarSection>

      {/* Actions Section - only for author */}
      {isAuthor && (
        <SidecarSection title="Actions">
          <SidecarMenu>
            <SidecarRow
              index={deleteIndex}
              icon={<Trash2 size={14} />}
              title={isDeleting ? "Deleting..." : "Delete"}
              onClick={handleShowDeleteConfirm}
              isDestructive
              testId="forum-reply-delete"
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
                  testId="confirm-delete-button"
                />
                <SidecarRow
                  index={cancelDeleteIndex}
                  title="Cancel"
                  onClick={handleCancelDelete}
                  disabled={isDeleting}
                  isSubRow
                  testId="forum-reply-delete-cancel"
                />
              </>
            )}
          </SidecarMenu>
        </SidecarSection>
      )}

      {/* Entity Links Section */}
      <LinksSidecarSection
        entityId={reply.id}
        entityType="reply"
        startIndex={draftActionCount + baseItemCount}
      />
    </Sidecar>
  )
}
