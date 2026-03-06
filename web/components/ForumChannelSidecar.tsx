import React, { useCallback, useMemo, useState, useRef, useEffect } from "react"
import { Calendar, Users, Pencil, Trash2, FileText } from "lucide-react"
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
import { ManageMembersSidecarMenu } from "./ManageMembersSidecarMenu"
import { useForumChannelACLMemberCount } from "../store/queries/use-forum-channel-acl"
import { useUpdateForumChannel, useDeleteForumChannel } from "../store/queries/use-forum-channels"
import { useEngineStore } from "../store/engine-store"
import { useAuthStore } from "../store/auth-store"
import { useWindowStore } from "../store/window-store"
import type { DecryptedForumChannel } from "../../engine/models/entity"
import { DraftSidecarSection } from "./DraftSidecarSection"
import { LinksSidecarSection, useLinksSidecarItemCount } from "./LinksSidecarSection"
import { NotificationSubscriptionSidecarRow } from "./NotificationSubscriptionSidecarRow"
import { useNotificationSubscriptionToggle } from "../store/queries/use-notification-subscriptions"
import * as styles from "../styles/sidecar.css"

/**
 * Props for ForumChannelSidecar component.
 */
interface ForumChannelSidecarProps {
  // The forum channel to display in the sidecar
  channel: DecryptedForumChannel
  // Callback when the channel is deleted
  onDeleted?: () => void
}

/**
 * ForumChannelSidecar displays contextual information and actions for a forum channel.
 *
 * Sections:
 * - Details: created date, updated date
 * - Actions: Rename, Edit description, Manage members, Delete
 */
export function ForumChannelSidecar({ channel, onDeleted }: ForumChannelSidecarProps) {
  const { pushSidecar, clearSidecar } = useSidecar()
  const { data: memberCount } = useForumChannelACLMemberCount(channel.id)
  const { mutate: deleteChannel } = useDeleteForumChannel()
  const { application } = useEngineStore()
  const { currentUser } = useAuthStore()
  const { retryDraft, discardDraft, forceSaveWithExpectedHash, restoreDraftAsNew, syncAllDrafts } =
    useDrafts()
  const workspaceMemberManager = application?.getWorkspaceMemberManager()
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const { isSubscribed, isLoading: isSubscriptionLoading, isSaving, toggleSubscription } = useNotificationSubscriptionToggle(
    "forum-channel",
    channel.id
  )
  const isMemberManagementDisabled = !application?.isWorkspaceRemote()
  const subscriptionDisabledMeta = currentUser
    ? "Sync required to manage notifications."
    : "Sign in to manage notifications."

  // Get count of entity links for keyboard navigation
  // Uses 'channel' (client type) - matches entityType prop for consistency
  const linksItemCount = useLinksSidecarItemCount(channel.id, "channel")

  // Get canonical channel for draft conflict detection.
  const canonicalChannel = useMemo(() => {
    if (!application) {
      return null
    }
    return application.getCacheStores().entityStore.getCanonical<DecryptedForumChannel>(channel.id) ?? null
  }, [application, channel.id])

  // Draft state for offline/conflict handling.
  const draftState = useDraftState({
    entityType: "forum-channel",
    entityId: channel.id,
    canonicalContentHash: canonicalChannel?.contentHash,
    canonicalExists: Boolean(canonicalChannel),
  })

  // Count of draft action rows for keyboard navigation.
  const draftActionCount = draftState.hasDraft ? (draftState.isConflict || draftState.isOrphaned ? 2 : 1) : 0

  // Check if current user is the creator (only creator can delete)
  const isCreator = currentUser?.uuid === channel.creatorId

  // Get creator name - first check if it's the current user, then fall back to member service
  const creatorName = useMemo(() => {
    if (!channel.creatorId) return "Unknown"

    // If the creator is the current user, use their name directly
    if (currentUser && currentUser.uuid === channel.creatorId) {
      return "You"
    }

    // Otherwise look up from member service
    if (workspaceMemberManager) {
      const members = workspaceMemberManager.getWorkspaceMembers()
      const member = members.find(m => m.userId === channel.creatorId)
      if (member) {
        return member.displayName
      }
    }

    return "Unknown"
  }, [channel.creatorId, currentUser, workspaceMemberManager])

  // Format date for display
  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  // Format member count display
  const memberCountDisplay = useMemo(() => {
    if (isMemberManagementDisabled) {
      return currentUser ? "Sync required" : "Sign in to manage"
    }
    if (memberCount === undefined) return "Loading..."
    if (memberCount === 1) return "1 member"
    return `${memberCount} members`
  }, [memberCount, isMemberManagementDisabled, currentUser])

  // Handle rename - push rename sidecar
  const handleStartRename = useCallback(() => {
    pushSidecar(<ForumChannelRenameSidecar channel={channel} />, "Rename")
  }, [pushSidecar, channel])

  // Handle edit description - push description sidecar
  const handleEditDescription = useCallback(() => {
    pushSidecar(<ForumChannelDescriptionSidecar channel={channel} />, "Description")
  }, [pushSidecar, channel])

  const handleRetryDraft = useCallback(() => {
    retryDraft("forum-channel", channel.id)
  }, [retryDraft, channel.id])

  const handleDiscardDraft = useCallback(() => {
    discardDraft("forum-channel", channel.id)
  }, [discardDraft, channel.id])

  const handleForceSave = useCallback(() => {
    if (!canonicalChannel?.contentHash) {
      return
    }
    forceSaveWithExpectedHash("forum-channel", channel.id, canonicalChannel.contentHash)
  }, [canonicalChannel?.contentHash, forceSaveWithExpectedHash, channel.id])

  const handleRestore = useCallback(() => {
    restoreDraftAsNew("forum-channel", channel.id)
  }, [restoreDraftAsNew, channel.id])

  const handleSyncAllDrafts = useCallback(() => {
    syncAllDrafts()
  }, [syncAllDrafts])

  // Handle navigating to manage members view
  const handleManageMembers = useCallback(() => {
    if (isMemberManagementDisabled) {
      return
    }
    pushSidecar(
      <ManageMembersSidecarMenu
        resourceType="forum_channel"
        resourceId={channel.id}
        creatorId={channel.creatorId}
        creatorName={creatorName}
      />,
      "Members"
    )
  }, [pushSidecar, channel.id, channel.creatorId, creatorName, isMemberManagementDisabled])

  // Handle showing delete confirmation
  const handleShowDeleteConfirm = useCallback(() => {
    if (!isCreator) return
    setShowDeleteConfirm(true)
  }, [isCreator])

  // Handle actual deletion after confirmation
  const handleConfirmDelete = useCallback(() => {
    if (isDeleting || !isCreator) return
    setIsDeleting(true)
    deleteChannel(
      { channelId: channel.id },
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
  }, [deleteChannel, channel.id, clearSidecar, onDeleted, isDeleting, isCreator])

  // Determine item count based on whether user can delete + links
  const baseItemCount = isCreator ? 5 + (showDeleteConfirm ? 2 : 0) : 4
  const totalItemCount = draftActionCount + baseItemCount + linksItemCount

  // Handle keyboard selection
  const handleSelect = useCallback(
    (index: number) => {
      const adjustedIndex = index - draftActionCount
      switch (adjustedIndex) {
        case 0:
          handleStartRename()
          break
        case 1:
          handleEditDescription()
          break
        case 2:
          handleManageMembers()
          break
        case 3:
          if (!isMemberManagementDisabled) {
            toggleSubscription()
          }
          break
        case 4:
          if (isCreator) {
            handleShowDeleteConfirm()
          }
          break
        case 5:
          if (isCreator && showDeleteConfirm) {
            handleConfirmDelete()
          }
          break
        case 6:
          if (isCreator && showDeleteConfirm) {
            setShowDeleteConfirm(false)
          }
          break
      }
    },
    [
      handleStartRename,
      handleEditDescription,
      handleManageMembers,
      toggleSubscription,
      handleShowDeleteConfirm,
      handleConfirmDelete,
      isCreator,
      isMemberManagementDisabled,
      showDeleteConfirm,
      draftActionCount,
    ]
  )

  // Build diff rows for conflict display.
  const diffRows = useMemo(() => {
    if (!draftState.isConflict || !canonicalChannel) {
      return []
    }
    return [
      {
        label: "Name",
        localValue: channel.content.name,
        serverValue: canonicalChannel.content.name,
      },
      {
        label: "Description",
        localValue: channel.content.description ?? "None",
        serverValue: canonicalChannel.content.description ?? "None",
      },
    ]
  }, [draftState.isConflict, canonicalChannel, channel.content.name, channel.content.description])

  return (
    <Sidecar itemCount={totalItemCount} onSelect={handleSelect}>
      {/* Draft Section - shown when there's a draft */}
      <DraftSidecarSection
        entityLabel="channel"
        draftState={draftState}
        canonicalUpdatedAt={canonicalChannel?.updatedAt}
        localUpdatedAt={
          draftState.draftEntity ? new Date(draftState.draftEntity.entity.updated_at) : channel.updatedAt
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
          <SidecarMetaItem
            icon={<Calendar size={12} />}
            label="Created"
            value={formatDate(channel.createdAt)}
          />
          <SidecarMetaItem
            icon={<Calendar size={12} />}
            label="Updated"
            value={formatDate(channel.updatedAt)}
          />
        </SidecarMetaList>
      </SidecarSection>

      {/* Actions Section */}
      <SidecarSection title="Actions">
        <SidecarMenu>
          <SidecarRow
            index={draftActionCount}
            icon={<Pencil size={14} />}
            title="Rename"
            onClick={handleStartRename}
            testId="forum-channel-rename"
          />
          <SidecarRow
            index={draftActionCount + 1}
            icon={<FileText size={14} />}
            title="Edit description"
            onClick={handleEditDescription}
            testId="forum-channel-description"
          />
          <SidecarRow
            index={draftActionCount + 2}
            icon={<Users size={14} />}
            title="Manage members"
            meta={memberCountDisplay}
            onClick={handleManageMembers}
            disabled={isMemberManagementDisabled}
            testId="forum-channel-manage-members"
          />
          <NotificationSubscriptionSidecarRow
            index={draftActionCount + 3}
            isSubscribed={isSubscribed}
            isLoading={isSubscriptionLoading}
            isSaving={isSaving}
            onToggle={toggleSubscription}
            isDisabled={isMemberManagementDisabled}
            disabledMeta={subscriptionDisabledMeta}
            testId="forum-channel-subscription-toggle"
          />
          {isCreator && (
            <SidecarRow
              index={draftActionCount + 4}
              icon={<Trash2 size={14} />}
              title="Delete channel"
              onClick={handleShowDeleteConfirm}
              isDestructive
              testId="forum-channel-delete"
            />
          )}
          {isCreator && showDeleteConfirm && (
            <>
              <SidecarRow
                index={draftActionCount + 5}
                title={isDeleting ? "Deleting..." : "Confirm"}
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                isDestructive
                isSubRow
                testId="confirm-delete-button"
              />
              <SidecarRow
                index={draftActionCount + 6}
                title="Cancel"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                isSubRow
                testId="forum-channel-delete-cancel"
              />
            </>
          )}
        </SidecarMenu>
      </SidecarSection>

      {/* Entity Links Section */}
      <LinksSidecarSection
        entityId={channel.id}
        entityType="channel"
        startIndex={draftActionCount + baseItemCount}
      />

    </Sidecar>
  )
}

/**
 * ForumChannelRenameSidecar allows renaming a forum channel.
 */
interface ForumChannelRenameSidecarProps {
  channel: DecryptedForumChannel
}

function ForumChannelRenameSidecar({ channel }: ForumChannelRenameSidecarProps) {
  const { popSidecar, updateSidecarTitle } = useSidecar()
  const { updateCurrentItemLabel } = useWindowStore()
  const { mutate: updateChannel, isPending } = useUpdateForumChannel()
  const [name, setName] = useState(channel.content.name)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input on mount and select all text
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleSubmit = useCallback(() => {
    if (name.trim() && name !== channel.content.name) {
      const trimmedName = name.trim()
      updateChannel(
        { channelId: channel.id, name: trimmedName, contentHash: channel.contentHash },
        {
          onSuccess: () => {
            // Update the breadcrumb label in the window store
            updateCurrentItemLabel(trimmedName)
            popSidecar()
            updateSidecarTitle(trimmedName)
          },
        }
      )
    } else {
      popSidecar()
    }
  }, [name, channel, updateChannel, popSidecar, updateCurrentItemLabel, updateSidecarTitle])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSubmit()
      } else if (e.key === "Escape") {
        popSidecar()
      }
    },
    [handleSubmit, popSidecar]
  )

  return (
    <Sidecar itemCount={0} onSelect={() => {}}>
      <SidecarSection title="New name">
        <div className={styles.sidecarInputContainer}>
          <input
            ref={inputRef}
            type="text"
            className={styles.sidecarInput}
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isPending}
            data-testid="forum-channel-rename-input"
          />
          <div className={styles.sidecarInputActions}>
            <button
              className={styles.sidecarCancelButton}
              onClick={() => popSidecar()}
              disabled={isPending}
              data-testid="forum-channel-rename-cancel"
            >
              Cancel
            </button>
            <button
              className={styles.sidecarConfirmButton}
              onClick={handleSubmit}
              disabled={isPending || !name.trim()}
              data-testid="forum-channel-rename-confirm"
            >
              Save
            </button>
          </div>
        </div>
      </SidecarSection>
    </Sidecar>
  )
}

/**
 * ForumChannelDescriptionSidecar allows editing a forum channel's description.
 */
interface ForumChannelDescriptionSidecarProps {
  channel: DecryptedForumChannel
}

function ForumChannelDescriptionSidecar({ channel }: ForumChannelDescriptionSidecarProps) {
  const { popSidecar } = useSidecar()
  const { mutate: updateChannel, isPending } = useUpdateForumChannel()
  const [description, setDescription] = useState(channel.content.description || "")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleSubmit = useCallback(() => {
    // Only update if description changed (allow empty to clear)
    if (description !== (channel.content.description || "")) {
      updateChannel(
        {
          channelId: channel.id,
          name: channel.content.name, // Name is required, pass current value
          description: description || undefined,
          contentHash: channel.contentHash,
        },
        {
          onSuccess: () => {
            popSidecar()
          },
        }
      )
    } else {
      popSidecar()
    }
  }, [description, channel, updateChannel, popSidecar])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Allow Shift+Enter for newlines, Enter alone submits
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      } else if (e.key === "Escape") {
        popSidecar()
      }
    },
    [handleSubmit, popSidecar]
  )

  return (
    <Sidecar itemCount={0} onSelect={() => {}}>
      <SidecarSection title="Description">
        <div className={styles.sidecarInputContainer}>
          <textarea
            ref={textareaRef}
            className={styles.sidecarCommentInputField}
            style={{ minHeight: "100px", resize: "vertical" }}
            value={description}
            onChange={e => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isPending}
            placeholder="Add a description for this channel..."
            data-testid="forum-channel-description-input"
          />
          <div className={styles.sidecarInputActions}>
            <button className={styles.sidecarCancelButton} onClick={() => popSidecar()} disabled={isPending}>
              Cancel
            </button>
            <button className={styles.sidecarConfirmButton} onClick={handleSubmit} disabled={isPending}>
              Save
            </button>
          </div>
        </div>
      </SidecarSection>
    </Sidecar>
  )
}
