import React, { useCallback, useMemo, useState, useRef, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Calendar, Users, Pencil, FolderInput, Trash2, Video, Mic } from "lucide-react"
import type { DecryptedFolder } from "../../engine/models/entity"
import { useSidecar } from "../contexts/SidecarContext"
import {
  Sidecar,
  SidecarSection,
  SidecarRow,
  SidecarMenu,
  SidecarMetaList,
  SidecarMetaItem,
} from "./SidecarUI"
import { ManageMembersSidecarMenu } from "./ManageMembersSidecarMenu"
import { MoveSidecar } from "./MoveSidecar"
import { useFolderACLMemberCount } from "../store/queries/use-folder-acl"
import { useUpdateFolder, useDeleteFolder, useMoveFolder } from "../store/queries/use-folders"
import { useEngineStore } from "../store/engine-store"
import { useAuthStore } from "../store/auth-store"
import { useWindowStore } from "../store/window-store"
import type { WorkspaceMember } from "../../engine/models/workspace-member"
import { CopyLinkSidecarRow } from "./CopyLinkSidecarRow"
import { LinksSidecarSection, useLinksSidecarItemCount } from "./LinksSidecarSection"
import { NotificationSubscriptionSidecarRow } from "./NotificationSubscriptionSidecarRow"
import { useNotificationSubscriptionToggle } from "../store/queries/use-notification-subscriptions"
import * as styles from "../styles/sidecar.css"

/**
 * Props for FolderSidecar component.
 */
interface FolderSidecarProps {
  folder: DecryptedFolder
  onDeleted?: () => void
}

/**
 * FolderSidecar displays contextual information and actions for a folder.
 *
 * Actions:
 * - Rename: Opens inline rename input
 * - Move: Opens folder picker to move to another location
 * - Manage members: Opens ACL management
 * - Delete: Deletes folder and all contents (with confirmation)
 */
export function FolderSidecar({ folder, onDeleted }: FolderSidecarProps) {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const navigate = useNavigate()
  const { pushSidecar, popSidecar } = useSidecar()
  const { data: memberCount } = useFolderACLMemberCount(folder.id)
  const { application } = useEngineStore()
  const { currentUser } = useAuthStore()
  const { navigateTo } = useWindowStore()
  const workspaceMemberManager = application?.getWorkspaceMemberManager()

  const { mutate: deleteFolder } = useDeleteFolder()
  const { mutate: moveFolder } = useMoveFolder()

  // State for delete confirmation
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const { isSubscribed, isLoading: isSubscriptionLoading, isSaving, toggleSubscription } = useNotificationSubscriptionToggle("folder", folder.id)
  const isMemberManagementDisabled = !application?.isWorkspaceRemote()
  const isUploadBlocked = !application?.isWorkspaceRemote()
  const subscriptionDisabledMeta = currentUser
    ? "Sync required to manage notifications."
    : "Sign in to manage notifications."

  // Get count of entity links for keyboard navigation
  const linksItemCount = useLinksSidecarItemCount(folder.id, "folder")

  // Get creator name
  const creatorName = useMemo(() => {
    if (!folder.creatorId) return "Unknown"

    if (currentUser && currentUser.uuid === folder.creatorId) {
      return "You"
    }

    if (workspaceMemberManager) {
      const members = workspaceMemberManager.getWorkspaceMembers()
      const member = members.find((m: WorkspaceMember) => m.userId === folder.creatorId)
      if (member) {
        return member.displayName
      }
    }

    return "Unknown"
  }, [folder.creatorId, currentUser, workspaceMemberManager])

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
    pushSidecar(<FolderRenameSidecar folder={folder} />, "Rename")
  }, [pushSidecar, folder])

  // Handle move
  const handleMove = useCallback(() => {
    pushSidecar(
      <MoveSidecar
        resourceType="folder"
        resourceId={folder.id}
        currentParentId={folder.parentId ?? null}
        onSelectDestination={folderId => {
          moveFolder({ folderId: folder.id, parentFolderId: folderId })
        }}
      />,
      "Move to"
    )
  }, [pushSidecar, folder.id, folder.parentId, moveFolder])

  // Handle manage members
  const handleManageMembers = useCallback(() => {
    if (isMemberManagementDisabled) {
      return
    }
    pushSidecar(
      <ManageMembersSidecarMenu
        resourceType="folder"
        resourceId={folder.id}
        creatorId={folder.creatorId}
        creatorName={creatorName}
      />,
      "Members"
    )
  }, [pushSidecar, folder.id, folder.creatorId, creatorName, isMemberManagementDisabled])

  // Handle delete
  const handleDeleteClick = useCallback(() => {
    setIsConfirmingDelete(true)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    deleteFolder(folder.id, {
      onSuccess: () => {
        popSidecar()
        onDeleted?.()
      },
    })
  }, [deleteFolder, folder.id, popSidecar, onDeleted])

  const handleCancelDelete = useCallback(() => {
    setIsConfirmingDelete(false)
  }, [])

  const deleteIndex = 6
  const confirmDeleteIndex = deleteIndex + 1
  const cancelDeleteIndex = deleteIndex + 2
  const hasCopyLink = Boolean(workspaceId)
  const copyLinkIndex = hasCopyLink ? (isConfirmingDelete ? 9 : 7) : null
  const linksStartIndex =
    hasCopyLink && copyLinkIndex !== null ? copyLinkIndex + 1 : deleteIndex + 1 + (isConfirmingDelete ? 2 : 0)

  const handleStartRecording = useCallback(
    (recordingKind: "video" | "audio") => {
      if (!workspaceId || isUploadBlocked) {
        return
      }

      const recordingSessionId = crypto.randomUUID()
      const itemType = recordingKind === "video" ? "video-recording" : "audio-recording"
      const label = recordingKind === "video" ? "New video recording" : "New audio recording"

      navigateTo({
        id: recordingSessionId,
        label,
        tool: "files",
        itemId: recordingSessionId,
        itemType,
        folderId: folder.id,
      })

      navigate(`/w/${workspaceId}/files/${recordingSessionId}?type=${itemType}&folder=${folder.id}`)
    },
    [workspaceId, isUploadBlocked, navigateTo, navigate, folder.id]
  )

  // Handle keyboard selection
  const handleSelect = useCallback(
    (index: number) => {
      switch (index) {
        case 0:
          handleStartRename()
          break
        case 1:
          handleMove()
          break
        case 2:
          handleStartRecording("video")
          break
        case 3:
          handleStartRecording("audio")
          break
        case 4:
          handleManageMembers()
          break
        case 5:
          if (!isMemberManagementDisabled) {
            toggleSubscription()
          }
          break
        case deleteIndex:
          handleDeleteClick()
          break
        case confirmDeleteIndex:
          if (isConfirmingDelete) {
            handleConfirmDelete()
          }
          break
        case cancelDeleteIndex:
          if (isConfirmingDelete) {
            handleCancelDelete()
          }
          break
      }
    },
    [
      handleStartRename,
      handleMove,
      handleStartRecording,
      handleManageMembers,
      toggleSubscription,
      handleDeleteClick,
      handleConfirmDelete,
      handleCancelDelete,
      deleteIndex,
      confirmDeleteIndex,
      cancelDeleteIndex,
      isConfirmingDelete,
      isMemberManagementDisabled,
    ]
  )

  // Total item count: actions (with optional delete sub-rows) + links
  const totalItemCount = linksStartIndex + linksItemCount

  return (
    <Sidecar itemCount={totalItemCount} onSelect={handleSelect}>
      {/* Details Section */}
      <SidecarSection title="Details">
        <SidecarMetaList>
          <SidecarMetaItem
            icon={<Calendar size={12} />}
            label="Created"
            value={formatDate(folder.createdAt)}
          />
          <SidecarMetaItem
            icon={<Calendar size={12} />}
            label="Updated"
            value={formatDate(folder.updatedAt)}
          />
        </SidecarMetaList>
      </SidecarSection>

      {/* Actions Section */}
      <SidecarSection title="Actions">
        <SidecarMenu>
          <SidecarRow
            index={0}
            icon={<Pencil size={14} />}
            title="Rename"
            onClick={handleStartRename}
            testId="folder-rename"
          />
          <SidecarRow
            index={1}
            icon={<FolderInput size={14} />}
            title="Move"
            onClick={handleMove}
            testId="folder-move"
          />
          <SidecarRow
            index={2}
            icon={<Video size={14} />}
            title="New video recording"
            onClick={() => handleStartRecording("video")}
            disabled={isUploadBlocked}
            testId="folder-new-video-recording"
          />
          <SidecarRow
            index={3}
            icon={<Mic size={14} />}
            title="New audio recording"
            onClick={() => handleStartRecording("audio")}
            disabled={isUploadBlocked}
            testId="folder-new-audio-recording"
          />
          <SidecarRow
            index={4}
            icon={<Users size={14} />}
            title="Manage members"
            meta={memberCountDisplay}
            onClick={handleManageMembers}
            disabled={isMemberManagementDisabled}
            testId="folder-manage-members"
          />
          <NotificationSubscriptionSidecarRow
            index={5}
            isSubscribed={isSubscribed}
            isLoading={isSubscriptionLoading}
            isSaving={isSaving}
            onToggle={toggleSubscription}
            isDisabled={isMemberManagementDisabled}
            disabledMeta={subscriptionDisabledMeta}
            testId="folder-subscription-toggle"
          />
          <SidecarRow
            index={deleteIndex}
            icon={<Trash2 size={14} />}
            title="Delete"
            onClick={handleDeleteClick}
            isDestructive
            testId="folder-delete"
          />
          {isConfirmingDelete && (
            <>
              <SidecarRow
                index={confirmDeleteIndex}
                title="Confirm"
                onClick={handleConfirmDelete}
                isDestructive
                isSubRow
                testId="folder-delete-confirm"
              />
              <SidecarRow
                index={cancelDeleteIndex}
                title="Cancel"
                onClick={handleCancelDelete}
                isSubRow
                testId="folder-delete-cancel"
              />
            </>
          )}
          {workspaceId && copyLinkIndex !== null && (
            <CopyLinkSidecarRow
              workspaceId={workspaceId}
              tool="files"
              entityId={folder.id}
              index={copyLinkIndex}
            />
          )}
        </SidecarMenu>
      </SidecarSection>

      {/* Entity Links Section */}
      <LinksSidecarSection entityId={folder.id} entityType="folder" startIndex={linksStartIndex} />
    </Sidecar>
  )
}

/**
 * FolderRenameSidecar allows renaming a folder.
 */
interface FolderRenameSidecarProps {
  folder: DecryptedFolder
}

function FolderRenameSidecar({ folder }: FolderRenameSidecarProps) {
  const { popSidecar, updateSidecarTitle } = useSidecar()
  const { updateCurrentItemLabel } = useWindowStore()
  const { mutate: updateFolder, isPending } = useUpdateFolder()
  const [name, setName] = useState(folder.content.name)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleSubmit = useCallback(() => {
    if (name.trim() && name !== folder.content.name) {
      const trimmedName = name.trim()
      updateFolder(
        { folderId: folder.id, name: trimmedName },
        {
          onSuccess: () => {
            // Update the breadcrumb label in the window store
            updateCurrentItemLabel(trimmedName)
            // Pop first to get back to FolderSidecar, then update its title
            popSidecar()
            // Now update the sidecar title (which is now FolderSidecar)
            updateSidecarTitle(trimmedName)
          },
        }
      )
    } else {
      popSidecar()
    }
  }, [name, folder, updateFolder, popSidecar, updateCurrentItemLabel, updateSidecarTitle])

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
            data-testid="folder-rename-input"
          />
          <div className={styles.sidecarInputActions}>
            <button className={styles.sidecarCancelButton} onClick={() => popSidecar()} disabled={isPending}>
              Cancel
            </button>
            <button
              className={styles.sidecarConfirmButton}
              onClick={handleSubmit}
              disabled={isPending || !name.trim()}
            >
              Save
            </button>
          </div>
        </div>
      </SidecarSection>
    </Sidecar>
  )
}
