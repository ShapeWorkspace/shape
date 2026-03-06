import React, { useCallback, useState, useRef, useEffect, useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Calendar, Download, Edit2, Trash2, Users, File, FolderInput } from "lucide-react"
import type { DecryptedFile } from "../../engine/models/entity"
import {
  useUpdateFile,
  useDeleteFile,
  useDownloadFile,
  useMoveFile,
} from "../store/queries/use-files"
import { useFileACLMemberCount } from "../store/queries/use-file-acl"
import { useSidecar } from "../contexts/SidecarContext"
import { useWindowStore } from "../store/window-store"
import { useEngineStore } from "../store/engine-store"
import { useAuthStore } from "../store/auth-store"
import type { WorkspaceMember } from "../../engine/models/workspace-member"
import {
  Sidecar,
  SidecarSection,
  SidecarRow,
  SidecarMenu,
  SidecarMetaList,
  SidecarMetaItem,
  SidecarDescription,
} from "./SidecarUI"
import { MoveSidecar } from "./MoveSidecar"
import { ManageMembersSidecarMenu } from "./ManageMembersSidecarMenu"
import { CopyLinkSidecarRow } from "./CopyLinkSidecarRow"
import { LinksSidecarSection, useLinksSidecarItemCount } from "./LinksSidecarSection"
import { NotificationSubscriptionSidecarRow } from "./NotificationSubscriptionSidecarRow"
import { useNotificationSubscriptionToggle } from "../store/queries/use-notification-subscriptions"
import * as styles from "../styles/sidecar.css"

/**
 * FileSidecar displays contextual information and actions for a file.
 * Actions include download, rename, manage members (ACL), and delete.
 */
interface FileSidecarProps {
  file: DecryptedFile
}

export function FileSidecar({ file }: FileSidecarProps) {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const navigate = useNavigate()
  const { pushSidecar } = useSidecar()
  const { navigateBack } = useWindowStore()
  const { application } = useEngineStore()
  const { currentUser } = useAuthStore()
  const workspaceMemberManager = application?.getWorkspaceMemberManager()

  const { mutate: deleteFile, isPending: isDeleting } = useDeleteFile()
  const { mutate: moveFile } = useMoveFile()
  const { refetch: downloadFile } = useDownloadFile(file.id, false)
  const { data: memberCount } = useFileACLMemberCount(file.id)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const { isSubscribed, isLoading: isSubscriptionLoading, isSaving, toggleSubscription } = useNotificationSubscriptionToggle("file", file.id)
  const isMemberManagementDisabled = !application?.isWorkspaceRemote()
  const subscriptionDisabledMeta = currentUser
    ? "Sync required to manage notifications."
    : "Sign in to manage notifications."

  // Get count of entity links for keyboard navigation
  const linksItemCount = useLinksSidecarItemCount(file.id, "file")

  // Get creator name for ACL display
  const creatorName = useMemo(() => {
    if (!file.creatorId) return "Unknown"

    if (currentUser && currentUser.uuid === file.creatorId) {
      return "You"
    }

    if (workspaceMemberManager) {
      const members = workspaceMemberManager.getWorkspaceMembers()
      const member = members.find((m: WorkspaceMember) => m.userId === file.creatorId)
      if (member) {
        return member.displayName
      }
    }

    return "Unknown"
  }, [file.creatorId, currentUser, workspaceMemberManager])

  // Format member count display
  const memberCountDisplay = useMemo(() => {
    if (isMemberManagementDisabled) {
      return currentUser ? "Sync required" : "Sign in to manage"
    }
    if (memberCount === undefined) return "Loading..."
    if (memberCount === 1) return "1 member"
    return `${memberCount} members`
  }, [memberCount, isMemberManagementDisabled, currentUser])

  // Format date for display
  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // Handle download action
  const handleDownload = useCallback(async () => {
    const { data } = await downloadFile()
    if (data) {
      // Create download link and trigger
      const link = document.createElement("a")
      link.href = data.url
      link.download = file.content.name
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }, [downloadFile, file.content.name])

  // Handle rename action
  const handleRenameClick = useCallback(() => {
    pushSidecar(<FileRenameSidecar file={file} />, "Rename")
  }, [pushSidecar, file])

  // Handle move action
  const handleMoveClick = useCallback(() => {
    pushSidecar(
      <MoveSidecar
        resourceType="file"
        resourceId={file.id}
        currentParentId={file.parentId ?? null}
        onSelectDestination={folderId => {
          moveFile({ fileId: file.id, folderId })
        }}
      />,
      "Move to"
    )
  }, [pushSidecar, file.id, file.parentId, moveFile])

  // Handle manage members action
  const handleMembersClick = useCallback(() => {
    if (isMemberManagementDisabled) {
      return
    }
    pushSidecar(
      <ManageMembersSidecarMenu
        resourceType="file"
        resourceId={file.id}
        creatorId={file.creatorId}
        creatorName={creatorName}
      />,
      "Members"
    )
  }, [pushSidecar, file.id, file.creatorId, creatorName, isMemberManagementDisabled])

  // Handle delete action
  const handleDeleteClick = useCallback(() => {
    setShowDeleteConfirm(true)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    deleteFile(file.id, {
      onSuccess: () => {
        // Navigate back to files list
        navigateBack()
        if (workspaceId) {
          navigate(`/w/${workspaceId}/files`)
        }
      },
    })
  }, [deleteFile, file.id, navigateBack, navigate, workspaceId])

  const handleCancelDelete = useCallback(() => {
    setShowDeleteConfirm(false)
  }, [])

  const deleteIndex = 5
  const confirmDeleteIndex = deleteIndex + 1
  const cancelDeleteIndex = deleteIndex + 2
  const hasCopyLink = Boolean(workspaceId)
  const copyLinkIndex = hasCopyLink ? (showDeleteConfirm ? 8 : 6) : null
  const linksStartIndex = hasCopyLink && copyLinkIndex !== null ? copyLinkIndex + 1 : deleteIndex + 1 + (showDeleteConfirm ? 2 : 0)

  // Handle keyboard selection
  const handleSelect = useCallback(
    (index: number) => {
      switch (index) {
        case 0:
          handleDownload()
          break
        case 1:
          handleRenameClick()
          break
        case 2:
          handleMoveClick()
          break
        case 3:
          handleMembersClick()
          break
        case 4:
          if (!isMemberManagementDisabled) {
            toggleSubscription()
          }
          break
        case deleteIndex:
          handleDeleteClick()
          break
        case confirmDeleteIndex:
          if (showDeleteConfirm) {
            handleConfirmDelete()
          }
          break
        case cancelDeleteIndex:
          if (showDeleteConfirm) {
            handleCancelDelete()
          }
          break
      }
    },
    [
      handleDownload,
      handleRenameClick,
      handleMoveClick,
      handleMembersClick,
      toggleSubscription,
      handleDeleteClick,
      handleConfirmDelete,
      handleCancelDelete,
      deleteIndex,
      confirmDeleteIndex,
      cancelDeleteIndex,
      showDeleteConfirm,
      isMemberManagementDisabled,
    ]
  )

  // Total item count: actions (with optional delete sub-rows) + links
  const totalItemCount = linksStartIndex + linksItemCount

  return (
    <Sidecar itemCount={totalItemCount} onSelect={handleSelect}>
      {!file.metaFields.stream_finalized && (
        <SidecarSection title="Recording status">
          <SidecarDescription>Recording may be truncated due to an interrupted upload.</SidecarDescription>
        </SidecarSection>
      )}

      <SidecarSection title="Details">
        <SidecarMetaList>
          <SidecarMetaItem icon={<File size={12} />} label="Type" value={file.content.mimeType} />
          <SidecarMetaItem icon={<File size={12} />} label="Size" value={formatSize(file.metaFields.size)} />
          <SidecarMetaItem icon={<Calendar size={12} />} label="Created" value={formatDate(file.createdAt)} />
          <SidecarMetaItem icon={<Calendar size={12} />} label="Updated" value={formatDate(file.updatedAt)} />
        </SidecarMetaList>
      </SidecarSection>

      <SidecarSection title="Actions">
        <SidecarMenu>
          <SidecarRow index={0} icon={<Download size={14} />} title="Download" onClick={handleDownload} />
          <SidecarRow index={1} icon={<Edit2 size={14} />} title="Rename" onClick={handleRenameClick} />
          <SidecarRow index={2} icon={<FolderInput size={14} />} title="Move" onClick={handleMoveClick} />
          <SidecarRow
            index={3}
            icon={<Users size={14} />}
            title="Manage members"
            meta={memberCountDisplay}
            onClick={handleMembersClick}
            disabled={isMemberManagementDisabled}
          />
          <NotificationSubscriptionSidecarRow
            index={4}
            isSubscribed={isSubscribed}
            isLoading={isSubscriptionLoading}
            isSaving={isSaving}
            onToggle={toggleSubscription}
            isDisabled={isMemberManagementDisabled}
            disabledMeta={subscriptionDisabledMeta}
            testId="file-subscription-toggle"
          />
          <SidecarRow
            index={deleteIndex}
            icon={<Trash2 size={14} />}
            title="Delete"
            onClick={handleDeleteClick}
            disabled={isDeleting}
            isDestructive
            testId="file-delete"
          />
          {showDeleteConfirm && (
            <>
              <SidecarRow
                index={confirmDeleteIndex}
                title="Confirm"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                isDestructive
                isSubRow
                testId="file-delete-confirm"
              />
              <SidecarRow
                index={cancelDeleteIndex}
                title="Cancel"
                onClick={handleCancelDelete}
                disabled={isDeleting}
                isSubRow
                testId="file-delete-cancel"
              />
            </>
          )}
          {workspaceId && copyLinkIndex !== null && (
            <CopyLinkSidecarRow
              workspaceId={workspaceId}
              tool="files"
              entityId={file.id}
              index={copyLinkIndex}
            />
          )}
        </SidecarMenu>
      </SidecarSection>

      {/* Entity Links Section */}
      <LinksSidecarSection entityId={file.id} entityType="file" startIndex={linksStartIndex} />
    </Sidecar>
  )
}

/**
 * FileRenameSidecar allows renaming a file.
 */
interface FileRenameSidecarProps {
  file: DecryptedFile
}

function FileRenameSidecar({ file }: FileRenameSidecarProps) {
  const { popSidecar } = useSidecar()
  const { mutate: updateFile, isPending } = useUpdateFile()
  const [name, setName] = useState(file.content.name)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleSubmit = useCallback(() => {
    if (name.trim() && name !== file.content.name) {
      updateFile(
        { fileId: file.id, name: name.trim(), mimeType: file.content.mimeType },
        {
          onSuccess: () => {
            popSidecar()
          },
        }
      )
    } else {
      popSidecar()
    }
  }, [name, file, updateFile, popSidecar])

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
