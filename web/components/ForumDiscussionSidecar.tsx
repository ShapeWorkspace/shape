import React, { useCallback, useMemo, useState, useRef, useEffect } from "react"
import { Archive, Calendar, User, MessageSquare, Pin, Pencil, Trash2 } from "lucide-react"
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
import {
  useUpdateForumDiscussion,
  usePinForumDiscussion,
  useArchiveForumDiscussion,
  useDeleteForumDiscussion,
} from "../store/queries/use-forum-channels"
import { useEngineStore } from "../store/engine-store"
import { useAuthStore } from "../store/auth-store"
import { useWindowStore } from "../store/window-store"
import { TipTapEditor } from "./TipTapEditor"
import type { ClientEntity, DecryptedForumDiscussion } from "../../engine/models/entity"
import { CopyLinkSidecarRow } from "./CopyLinkSidecarRow"
import { DraftSidecarSection } from "./DraftSidecarSection"
import { LinksSidecarSection, useLinksSidecarItemCount } from "./LinksSidecarSection"
import { NotificationSubscriptionSidecarRow } from "./NotificationSubscriptionSidecarRow"
import { useNotificationSubscriptionToggle } from "../store/queries/use-notification-subscriptions"
import type { MentionSuggestionContext } from "../store/queries/use-mention-suggestions"
import * as styles from "../styles/sidecar.css"

function isForumDiscussion(entity: ClientEntity): entity is DecryptedForumDiscussion {
  return entity.entityType === "forum-discussion"
}

/**
 * Props for ForumDiscussionSidecar component.
 */
interface ForumDiscussionSidecarProps {
  // The channel ID this discussion belongs to
  channelId: string
  // The discussion to display in the sidecar
  discussion: DecryptedForumDiscussion
  // Callback when the discussion is deleted
  onDeleted?: () => void
}

/**
 * ForumDiscussionSidecar displays contextual information and actions for a forum discussion.
 *
 * Sections:
 * - Details: author, created date, last reply, replies count, pinned status, archived status
 * - Actions: Edit, Archive/Unarchive, Pin/Unpin, Delete
 */
export function ForumDiscussionSidecar({ channelId, discussion, onDeleted }: ForumDiscussionSidecarProps) {
  const { pushSidecar, clearSidecar } = useSidecar()
  const { mutate: pinDiscussion } = usePinForumDiscussion()
  const { mutate: archiveDiscussion } = useArchiveForumDiscussion()
  const { mutate: deleteDiscussion } = useDeleteForumDiscussion()
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const { currentUser } = useAuthStore()
  const { retryDraft, discardDraft, forceSaveWithExpectedHash, restoreDraftAsNew, syncAllDrafts } =
    useDrafts()
  const workspaceMemberManager = application?.getWorkspaceMemberManager()
  const [currentDiscussion, setCurrentDiscussion] = useState(discussion)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const { isSubscribed, isLoading: isSubscriptionLoading, isSaving, toggleSubscription } = useNotificationSubscriptionToggle(
    "forum-discussion",
    currentDiscussion.id
  )
  const isSubscriptionDisabled = !application?.isWorkspaceRemote()
  const subscriptionDisabledMeta = currentUser
    ? "Sync required to manage notifications."
    : "Sign in to manage notifications."

  // Keep sidecar discussion state in sync even when the sidecar stack isn't replaced.
  useEffect(() => {
    setCurrentDiscussion(discussion)
  }, [discussion])

  useEffect(() => {
    if (!application) {
      return
    }
    const cacheStores = application.getCacheStores()
    const unsubscribe = cacheStores.forumDiscussionIndex.subscribe(channelId, updatedDiscussions => {
      const updatedDiscussion = updatedDiscussions.find(item => item.id === currentDiscussion.id)
      if (updatedDiscussion && isForumDiscussion(updatedDiscussion)) {
        setCurrentDiscussion(updatedDiscussion)
      }
    })
    return unsubscribe
  }, [application, channelId, currentDiscussion.id])

  // Get count of entity links for keyboard navigation
  // Uses 'discussion' (client type) - server maps to 'forum_discussion' for aggregation
  const linksItemCount = useLinksSidecarItemCount(currentDiscussion.id, "discussion")

  // Get canonical discussion for draft conflict detection.
  const canonicalDiscussion = useMemo(() => {
    if (!application) {
      return null
    }
    return application.getCacheStores().entityStore.getCanonical<DecryptedForumDiscussion>(currentDiscussion.id) ?? null
  }, [application, currentDiscussion.id])

  // Draft state for offline/conflict handling.
  const draftState = useDraftState({
    entityType: "forum-discussion",
    entityId: currentDiscussion.id,
    canonicalContentHash: canonicalDiscussion?.contentHash,
    canonicalExists: Boolean(canonicalDiscussion),
  })

  // Count of draft action rows for keyboard navigation.
  const draftActionCount = draftState.hasDraft ? (draftState.isConflict || draftState.isOrphaned ? 2 : 1) : 0

  // Check if current user is the author
  const isAuthor = currentUser?.uuid === currentDiscussion.creatorId

  // Get author name
  const authorName = useMemo(() => {
    if (!currentDiscussion.creatorId) return "Unknown"

    // If the author is the current user, use their name directly
    if (currentUser && currentUser.uuid === currentDiscussion.creatorId) {
      return "You"
    }

    // Otherwise look up from member service
    if (workspaceMemberManager) {
      const members = workspaceMemberManager.getWorkspaceMembers()
      const member = members.find(m => m.userId === currentDiscussion.creatorId)
      if (member) {
        return member.displayName
      }
    }

    return "Unknown"
  }, [currentDiscussion.creatorId, currentUser, workspaceMemberManager])

  // Format date for display
  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "Never"
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  // Format reply count display
  const replyCountDisplay = useMemo(() => {
    const replyCount = currentDiscussion.metaFields.num_replies ?? 0
    if (replyCount === 0) return "No replies"
    if (replyCount === 1) return "1 reply"
    return `${replyCount} replies`
  }, [currentDiscussion.metaFields.num_replies])

  // Handle edit discussion - push edit sidecar
  const handleEditDiscussion = useCallback(() => {
    pushSidecar(<ForumDiscussionEditSidecar channelId={channelId} discussion={currentDiscussion} />, "Edit")
  }, [pushSidecar, channelId, currentDiscussion])

  const handleRetryDraft = useCallback(() => {
    retryDraft("forum-discussion", currentDiscussion.id)
  }, [retryDraft, currentDiscussion.id])

  const handleDiscardDraft = useCallback(() => {
    discardDraft("forum-discussion", currentDiscussion.id)
  }, [discardDraft, currentDiscussion.id])

  const handleForceSave = useCallback(() => {
    if (!canonicalDiscussion?.contentHash) {
      return
    }
    forceSaveWithExpectedHash("forum-discussion", currentDiscussion.id, canonicalDiscussion.contentHash)
  }, [canonicalDiscussion?.contentHash, forceSaveWithExpectedHash, currentDiscussion.id])

  const handleRestore = useCallback(() => {
    restoreDraftAsNew("forum-discussion", currentDiscussion.id)
  }, [restoreDraftAsNew, currentDiscussion.id])

  const handleSyncAllDrafts = useCallback(() => {
    syncAllDrafts()
  }, [syncAllDrafts])

  // Handle pin/unpin
  const handleTogglePin = useCallback(() => {
    pinDiscussion({
      channelId,
      discussionId: currentDiscussion.id,
      pinned: !currentDiscussion.metaFields.pinned,
    })
  }, [pinDiscussion, channelId, currentDiscussion.id, currentDiscussion.metaFields.pinned])

  // Handle archive/unarchive
  const handleToggleArchive = useCallback(() => {
    archiveDiscussion({
      channelId,
      discussionId: currentDiscussion.id,
      archived: !currentDiscussion.metaFields.archived,
    })
  }, [archiveDiscussion, channelId, currentDiscussion.id, currentDiscussion.metaFields.archived])

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
    deleteDiscussion(
      { channelId, discussionId: currentDiscussion.id },
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
  }, [deleteDiscussion, channelId, currentDiscussion.id, clearSidecar, onDeleted, isDeleting, isAuthor])

  const archiveRowIndex = draftActionCount + (isAuthor ? 1 : 0)
  const pinRowIndex = draftActionCount + (isAuthor ? 2 : 1)
  const subscriptionRowIndex = draftActionCount + (isAuthor ? 3 : 2)
  const deleteRowIndex = draftActionCount + 4
  const confirmDeleteIndex = deleteRowIndex + 1
  const cancelDeleteIndex = deleteRowIndex + 2
  const hasCopyLink = Boolean(workspaceId)
  const copyLinkIndex = draftActionCount + (isAuthor ? (showDeleteConfirm ? 7 : 5) : 3)
  // Determine item count based on user permissions + links.
  // Author: Edit, Archive/Unarchive, Pin/Unpin, Subscribe, Delete, (optional Confirm+Cancel), (optional Copy link)
  // Non-author: Archive/Unarchive, Pin/Unpin, Subscribe, (optional Copy link)
  const baseItemCount =
    (isAuthor ? 5 + (showDeleteConfirm ? 2 : 0) : 3) + (hasCopyLink ? 1 : 0)
  const totalItemCount = draftActionCount + baseItemCount + linksItemCount

  // Handle keyboard selection
  const handleSelect = useCallback(
    (index: number) => {
      const adjustedIndex = index - draftActionCount
      if (adjustedIndex < 0) {
        return
      }
      if (isAuthor) {
        // Author sees: Edit, Archive/Unarchive, Pin/Unpin, Subscribe, Delete
        switch (adjustedIndex) {
          case 0:
            handleEditDiscussion()
            break
          case 1:
            handleToggleArchive()
            break
          case 2:
            handleTogglePin()
            break
          case 3:
            if (!isSubscriptionDisabled) {
              toggleSubscription()
            }
            break
          case 4:
            handleShowDeleteConfirm()
            break
          case 5:
            if (showDeleteConfirm) {
              handleConfirmDelete()
            }
            break
          case 6:
            if (showDeleteConfirm) {
              handleCancelDelete()
            }
            break
        }
      } else {
        // Non-author sees: Archive/Unarchive, Pin/Unpin, Subscribe
        if (adjustedIndex === 0) {
          handleToggleArchive()
          return
        }
        if (adjustedIndex === 1) {
          handleTogglePin()
          return
        }
        if (adjustedIndex === 2 && !isSubscriptionDisabled) {
          toggleSubscription()
        }
      }
    },
    [
      isAuthor,
      handleEditDiscussion,
      handleToggleArchive,
      handleTogglePin,
      toggleSubscription,
      handleShowDeleteConfirm,
      handleConfirmDelete,
      handleCancelDelete,
      showDeleteConfirm,
      isSubscriptionDisabled,
      draftActionCount,
    ]
  )

  // Build diff rows for conflict display.
  const diffRows = useMemo(() => {
    if (!draftState.isConflict || !canonicalDiscussion) {
      return []
    }
    return [
      {
        label: "Title",
        localValue: currentDiscussion.content.title,
        serverValue: canonicalDiscussion.content.title,
      },
    ]
  }, [draftState.isConflict, canonicalDiscussion, currentDiscussion.content.title])

  return (
    <Sidecar itemCount={totalItemCount} onSelect={handleSelect}>
      {/* Draft Section - shown when there's a draft */}
      <DraftSidecarSection
        entityLabel="discussion"
        draftState={draftState}
        canonicalUpdatedAt={canonicalDiscussion?.updatedAt}
        localUpdatedAt={
          draftState.draftEntity ? new Date(draftState.draftEntity.entity.updated_at) : currentDiscussion.updatedAt
        }
        diffRows={diffRows}
        startIndex={0}
        onRetry={handleRetryDraft}
        onDiscard={handleDiscardDraft}
        onForceSave={handleForceSave}
        onRestore={handleRestore}
        onSyncAllDrafts={handleSyncAllDrafts}
      />

      {/* Details Section */}
      <SidecarSection title="Details">
        <SidecarMetaList>
          <SidecarMetaItem icon={<User size={12} />} label="Author" value={authorName} />
          <SidecarMetaItem
            icon={<Calendar size={12} />}
            label="Created"
            value={formatDate(currentDiscussion.createdAt)}
          />
          <SidecarMetaItem
            icon={<Calendar size={12} />}
            label="Last reply"
            value={formatDate(currentDiscussion.metaFields.last_reply_at)}
          />
          <SidecarMetaItem icon={<MessageSquare size={12} />} label="Replies" value={replyCountDisplay} />
          <SidecarMetaItem
            icon={<Pin size={12} />}
            label="Pinned"
            value={currentDiscussion.metaFields.pinned ? "Yes" : "No"}
          />
          <SidecarMetaItem
            icon={<Archive size={12} />}
            label="Archived"
            value={currentDiscussion.metaFields.archived ? "Yes" : "No"}
            testId="forum-discussion-archived-meta"
          />
        </SidecarMetaList>
      </SidecarSection>

      {/* Actions Section */}
      <SidecarSection title="Actions">
        <SidecarMenu>
          {isAuthor && (
            <SidecarRow
              index={draftActionCount}
              icon={<Pencil size={14} />}
              title="Edit"
              onClick={handleEditDiscussion}
              testId="forum-discussion-edit"
            />
          )}
          <SidecarRow
            index={archiveRowIndex}
            icon={<Archive size={14} />}
            title={currentDiscussion.metaFields.archived ? "Unarchive" : "Archive"}
            onClick={handleToggleArchive}
            testId="forum-discussion-archive-toggle"
          />
          <SidecarRow
            index={pinRowIndex}
            icon={<Pin size={14} />}
            title={currentDiscussion.metaFields.pinned ? "Unpin" : "Pin"}
            onClick={handleTogglePin}
            testId="forum-discussion-pin-toggle"
          />
          <NotificationSubscriptionSidecarRow
            index={subscriptionRowIndex}
            isSubscribed={isSubscribed}
            isLoading={isSubscriptionLoading}
            isSaving={isSaving}
            onToggle={toggleSubscription}
            isDisabled={isSubscriptionDisabled}
            disabledMeta={subscriptionDisabledMeta}
            testId="forum-discussion-subscription-toggle"
          />
          {isAuthor && (
            <SidecarRow
              index={deleteRowIndex}
              icon={<Trash2 size={14} />}
              title={isDeleting ? "Deleting..." : "Delete"}
              onClick={handleShowDeleteConfirm}
              isDestructive
              testId="forum-discussion-delete"
            />
          )}
          {isAuthor && showDeleteConfirm && (
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
                testId="forum-discussion-delete-cancel"
              />
            </>
          )}
          {hasCopyLink && (
            <CopyLinkSidecarRow
              workspaceId={workspaceId}
              tool="forum"
              entityId={currentDiscussion.id}
              index={copyLinkIndex}
            />
          )}
        </SidecarMenu>
      </SidecarSection>

      {/* Entity Links Section */}
      <LinksSidecarSection
        entityId={currentDiscussion.id}
        entityType="discussion"
        startIndex={draftActionCount + baseItemCount}
      />
    </Sidecar>
  )
}

/**
 * ForumDiscussionEditSidecar allows editing a forum discussion's title and body.
 */
interface ForumDiscussionEditSidecarProps {
  channelId: string
  discussion: DecryptedForumDiscussion
}

function ForumDiscussionEditSidecar({ channelId, discussion }: ForumDiscussionEditSidecarProps) {
  const { popSidecar, updateSidecarTitle } = useSidecar()
  const { updateCurrentItemLabel } = useWindowStore()
  const { mutate: updateDiscussion, isPending } = useUpdateForumDiscussion()
  const [title, setTitle] = useState(discussion.content.title)
  const [body, setBody] = useState(discussion.content.body || "")
  const titleInputRef = useRef<HTMLInputElement>(null)
  const mentionSuggestionContext = useMemo<MentionSuggestionContext>(
    () => ({
      contextType: "acl",
      resourceType: "forum_channel",
      resourceId: channelId,
    }),
    [channelId]
  )

  // Focus title input on mount
  useEffect(() => {
    titleInputRef.current?.focus()
  }, [])

  const handleSubmit = useCallback(() => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      // Title is required
      return
    }

    // Check if body has meaningful content (not just empty paragraphs)
    const hasBody = body.trim() && body.trim() !== "<p></p>"
    const effectiveBody = hasBody ? body : null

    // Only update if something changed
    const titleChanged = trimmedTitle !== discussion.content.title
    const bodyChanged = effectiveBody !== discussion.content.body

    if (titleChanged || bodyChanged) {
      updateDiscussion(
        {
          channelId,
          discussionId: discussion.id,
          title: trimmedTitle,
          body: effectiveBody ?? undefined,
          contentHash: discussion.contentHash,
        },
        {
          onSuccess: () => {
            if (titleChanged) {
              updateCurrentItemLabel(trimmedTitle)
              updateSidecarTitle(trimmedTitle)
            }
            popSidecar()
          },
        }
      )
    } else {
      popSidecar()
    }
  }, [
    title,
    body,
    discussion,
    channelId,
    updateDiscussion,
    popSidecar,
    updateCurrentItemLabel,
    updateSidecarTitle,
  ])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        popSidecar()
      }
    },
    [popSidecar]
  )

  // Handle keyboard shortcuts from TipTapEditor
  const handleEditorKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Escape to close the sidecar
      if (e.key === "Escape") {
        popSidecar()
        return true
      }
      return false
    },
    [popSidecar]
  )

  return (
    <Sidecar itemCount={0} onSelect={() => {}}>
      <SidecarSection title="Title">
        <div className={styles.sidecarInputContainer}>
          <input
            ref={titleInputRef}
            type="text"
            className={styles.sidecarInput}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isPending}
            placeholder="Discussion title..."
            data-testid="forum-discussion-edit-title-input"
          />
        </div>
      </SidecarSection>

      <SidecarSection title="Body">
        <div className={styles.sidecarInputContainer}>
          <TipTapEditor
            content={body}
            placeholder="Discussion body (optional)..."
            onChange={setBody}
            showToolbar={true}
            disabled={isPending}
            fileAttachment={{
              entityId: discussion.id,
              entityType: "forum_discussion",
            }}
            onKeyDown={handleEditorKeyDown}
            mentionSuggestionContext={mentionSuggestionContext}
            testId="forum-discussion-edit-body-editor"
            className={styles.sidecarEditorWrapper}
          />
        </div>
      </SidecarSection>

      <SidecarSection title="">
        <div className={styles.sidecarInputActions}>
          <button
            className={styles.sidecarCancelButton}
            onClick={() => popSidecar()}
            disabled={isPending}
            data-testid="forum-discussion-edit-cancel"
          >
            Cancel
          </button>
          <button
            className={styles.sidecarConfirmButton}
            onClick={handleSubmit}
            disabled={isPending || !title.trim()}
            data-testid="forum-discussion-edit-confirm"
          >
            Save
          </button>
        </div>
      </SidecarSection>
    </Sidecar>
  )
}
