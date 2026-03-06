import React, { useCallback, useState, useRef, useEffect, useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  Calendar,
  Download,
  Edit2,
  File,
  FileAudio,
  FileText,
  Film,
  FolderInput,
  FolderOpen,
  Image,
  Loader,
  Loader2,
  MessageCircle,
  Paperclip,
  Save,
  Trash2,
  User,
  Users,
} from "lucide-react"
import { useDeletePaper, useMovePaper } from "../store/queries/use-papers"
import { usePaperACLMemberCount } from "../store/queries/use-paper-acl"
import { useFilesByEntity, useEngineForFileDownload } from "../store/queries/use-files"
import { useSidecar } from "../contexts/SidecarContext"
import { useWindowStore } from "../store/window-store"
import { useEngineStore } from "../store/engine-store"
import { useAuthStore } from "../store/auth-store"
import { useDrafts } from "../contexts/DraftContext"
import { useDraftState } from "../hooks/useDraftState"
import type { DecryptedFile, DecryptedPaper } from "../../engine/models/entity"
import type { WorkspaceMember } from "../../engine/models/workspace-member"
import {
  Sidecar,
  SidecarSection,
  SidecarRow,
  SidecarMenu,
  SidecarMetaList,
  SidecarMetaItem,
} from "./SidecarUI"
import { MoveSidecar } from "./MoveSidecar"
import { ManageMembersSidecarMenu } from "./ManageMembersSidecarMenu"
import { CopyLinkSidecarRow } from "./CopyLinkSidecarRow"
import { DraftSidecarSection } from "./DraftSidecarSection"
import { LinksSidecarSection, useLinksSidecarItemCount } from "./LinksSidecarSection"
import { NotificationSubscriptionSidecarRow } from "./NotificationSubscriptionSidecarRow"
import { useNotificationSubscriptionToggle } from "../store/queries/use-notification-subscriptions"
import { RelativeTimestamp } from "./RelativeTimestamp"
import { useEntitySave } from "../contexts/EntitySaveContext"
import { PaperMarkdownExportSidecar } from "./MarkdownExportSidecar"
import * as styles from "../styles/sidecar.css"

/**
 * Returns appropriate icon component based on MIME type.
 */
function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return <Image size={14} />
  if (mimeType.startsWith("video/")) return <Film size={14} />
  if (mimeType.startsWith("audio/")) return <FileAudio size={14} />
  if (mimeType === "application/pdf") return <FileText size={14} />
  return <File size={14} />
}

/**
 * Formats file size in human-readable form.
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/**
 * PaperSidecar displays contextual information and actions for a paper.
 * Actions include rename and delete.
 */
interface PaperSidecarProps {
  paper: DecryptedPaper
  // Current title from the editor (may differ from paper.content.name during editing)
  currentTitle: string
  onTitleChange?: (newTitle: string) => void
  onOpenComments?: () => void
  unresolvedCommentCount?: number
}

export function PaperSidecar({
  paper,
  currentTitle,
  onTitleChange,
  onOpenComments,
  unresolvedCommentCount = 0,
}: PaperSidecarProps) {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const navigate = useNavigate()
  const { pushSidecar } = useSidecar()
  const { navigateBack } = useWindowStore()
  const { application } = useEngineStore()
  const { currentUser } = useAuthStore()
  const workspaceMemberManager = application?.getWorkspaceMemberManager()
  const { retryDraft, discardDraft, forceSaveWithExpectedHash, restoreDraftAsNew, syncAllDrafts } =
    useDrafts()

  const { mutate: deletePaper, isPending: isDeleting } = useDeletePaper()
  const { mutate: movePaper } = useMovePaper()
  const { data: memberCount } = usePaperACLMemberCount(paper.id)

  // Get canonical paper for draft comparison
  const canonicalPaper = useMemo(() => {
    if (!application) {
      return null
    }
    return application.getCacheStores().entityStore.getCanonical<DecryptedPaper>(paper.id) ?? null
  }, [application, paper.id])

  // Get draft state for this paper
  const draftState = useDraftState({
    entityType: "paper",
    entityId: paper.id,
    canonicalContentHash: canonicalPaper?.contentHash,
    canonicalExists: Boolean(canonicalPaper),
  })

  // Fetch files attached to this paper
  const { data: attachments, isLoading: isLoadingAttachments } = useFilesByEntity(paper.id, "paper")

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const { isSubscribed, isLoading: isSubscriptionLoading, isSaving, toggleSubscription } = useNotificationSubscriptionToggle("paper", paper.id)
  const isMemberManagementDisabled = !application?.isWorkspaceRemote()
  const subscriptionDisabledMeta = currentUser
    ? "Sync required to manage notifications."
    : "Sign in to manage notifications."

  // Get count of entity links for keyboard navigation
  const linksItemCount = useLinksSidecarItemCount(paper.id, "paper")

  // Get save state from EntitySaveContext for "Last saved" display
  const { getSaveState } = useEntitySave()
  const saveState = getSaveState("paper", paper.id)

  // Get creator name for display
  const creatorName = useMemo(() => {
    if (!paper.creatorId) return "Unknown"

    if (currentUser && currentUser.uuid === paper.creatorId) {
      return "You"
    }

    if (workspaceMemberManager) {
      const members = workspaceMemberManager.getWorkspaceMembers()
      const member = members.find((m: WorkspaceMember) => m.userId === paper.creatorId)
      if (member) {
        return member.displayName
      }
    }

    return "Unknown"
  }, [paper.creatorId, currentUser, workspaceMemberManager])

  // Format member count display for the Manage members row
  const memberCountDisplay = useMemo(() => {
    if (isMemberManagementDisabled) {
      return currentUser ? "Sync required" : "Sign in to manage"
    }
    if (memberCount === undefined) return "Loading..."
    if (memberCount === 1) return "1 member"
    return `${memberCount} members`
  }, [memberCount, isMemberManagementDisabled, currentUser])

  // Format attachment count display
  const attachmentCountDisplay = useMemo(() => {
    if (isLoadingAttachments) return "Loading..."
    const count = attachments?.length ?? 0
    if (count === 0) return "No files"
    if (count === 1) return "1 file"
    return `${count} files`
  }, [attachments, isLoadingAttachments])

  const commentCountDisplay = useMemo(() => {
    if (unresolvedCommentCount === 1) {
      return "1 open"
    }
    return `${unresolvedCommentCount} open`
  }, [unresolvedCommentCount])

  // Format date for display
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  // Handle rename action - pushes rename sidecar onto stack
  const handleRenameClick = useCallback(() => {
    pushSidecar(<PaperRenameSidecar currentTitle={currentTitle} onTitleChange={onTitleChange} />, "Rename")
  }, [pushSidecar, currentTitle, onTitleChange])

  const handleExportClick = useCallback(() => {
    pushSidecar(<PaperMarkdownExportSidecar paperId={paper.id} paperTitle={currentTitle} />, "Export")
  }, [pushSidecar, paper.id, currentTitle])

  // Handle move action - pushes move sidecar onto stack
  const handleMoveClick = useCallback(() => {
    pushSidecar(
      <MoveSidecar
        resourceType="paper"
        resourceId={paper.id}
        currentParentId={paper.metaFields.folder_id ?? null}
        onSelectDestination={folderId => {
          movePaper({ paperId: paper.id, folderId })
        }}
      />,
      "Move to"
    )
  }, [pushSidecar, paper.id, paper.metaFields.folder_id, movePaper])

  // Handle open folder action - navigates to the folder containing this paper
  const handleOpenFolder = useCallback(() => {
    const folderId = paper.metaFields.folder_id
    if (!workspaceId || !folderId) return
    navigate(`/w/${workspaceId}/files?folder=${folderId}`)
  }, [workspaceId, paper.metaFields.folder_id, navigate])

  // Handle manage members action - pushes ACL sidecar onto stack
  const handleMembersClick = useCallback(() => {
    if (isMemberManagementDisabled) {
      return
    }
    pushSidecar(
      <ManageMembersSidecarMenu
        resourceType="paper"
        resourceId={paper.id}
        creatorId={paper.creatorId}
        creatorName={creatorName}
      />,
      "Members"
    )
  }, [pushSidecar, paper.id, paper.creatorId, creatorName, isMemberManagementDisabled])

  // Handle attachments action - pushes attachments list sidecar onto stack
  const handleAttachmentsClick = useCallback(() => {
    pushSidecar(<AttachmentsSidecar paperId={paper.id} />, "Attachments")
  }, [pushSidecar, paper.id])

  // Handle delete action with explicit confirm/cancel sub-rows.
  const handleDeleteClick = useCallback(() => {
    setShowDeleteConfirm(true)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    deletePaper(paper.id, {
      onSuccess: () => {
        // Navigate back to papers list
        navigateBack()
        if (workspaceId) {
          navigate(`/w/${workspaceId}/papers`)
        }
      },
    })
  }, [deletePaper, paper.id, navigateBack, navigate, workspaceId])

  const handleCancelDeleteConfirm = useCallback(() => {
    setShowDeleteConfirm(false)
  }, [])

  // Whether the paper is in a folder (affects index mapping)
  const hasFolder = Boolean(paper.metaFields.folder_id)

  // Draft action count for keyboard navigation indexing
  const draftActionCount = draftState.hasDraft ? (draftState.isConflict || draftState.isOrphaned ? 2 : 1) : 0

  // Diff rows for conflict display (title comparison)
  const diffRows = useMemo(() => {
    if (!draftState.isConflict || !canonicalPaper) {
      return []
    }

    return [
      {
        label: "Title",
        localValue: currentTitle || "Untitled",
        serverValue: canonicalPaper.content.name || "Untitled",
      },
    ]
  }, [draftState.isConflict, canonicalPaper, currentTitle])

  // Draft action handlers
  const handleRetryDraft = useCallback(() => {
    retryDraft("paper", paper.id)
  }, [retryDraft, paper.id])

  const handleDiscardDraft = useCallback(() => {
    discardDraft("paper", paper.id)
  }, [discardDraft, paper.id])

  const handleForceSave = useCallback(() => {
    if (!canonicalPaper?.contentHash) {
      return
    }
    forceSaveWithExpectedHash("paper", paper.id, canonicalPaper.contentHash)
  }, [canonicalPaper?.contentHash, forceSaveWithExpectedHash, paper.id])

  const handleRestore = useCallback(() => {
    restoreDraftAsNew("paper", paper.id)
  }, [restoreDraftAsNew, paper.id])

  const handleSyncAllDrafts = useCallback(() => {
    syncAllDrafts()
  }, [syncAllDrafts])

  // Base action start index (after draft actions)
  const baseActionStartIndex = draftActionCount
  const deleteActionOffset = hasFolder ? 8 : 7
  const deleteActionIndex = baseActionStartIndex + deleteActionOffset
  const confirmDeleteIndex = deleteActionIndex + 1
  const cancelDeleteIndex = deleteActionIndex + 2
  const hasCopyLink = Boolean(workspaceId)
  const copyLinkBaseOffset = hasFolder ? 9 : 8
  const copyLinkIndex =
    hasCopyLink ? baseActionStartIndex + copyLinkBaseOffset + (showDeleteConfirm ? 2 : 0) : null
  const linksStartIndex =
    hasCopyLink && copyLinkIndex !== null
      ? copyLinkIndex + 1
      : deleteActionIndex + 1 + (showDeleteConfirm ? 2 : 0)

  // Handle keyboard selection - maps index to action
  // Draft actions come first, then regular actions
  const handleSelect = useCallback(
    (index: number) => {
      // Handle draft actions first
      if (index < draftActionCount) {
        if (draftState.isConflict) {
          if (index === 0) {
            handleForceSave()
          } else if (index === 1) {
            handleDiscardDraft()
          }
          return
        }

        if (draftState.isOrphaned) {
          if (index === 0) {
            handleRestore()
          } else if (index === 1) {
            handleDiscardDraft()
          }
          return
        }

        handleRetryDraft()
        return
      }

      // Handle base actions (offset by draft action count)
      const baseIndex = index - baseActionStartIndex

      if (hasFolder) {
        switch (baseIndex) {
          case 0:
            onOpenComments?.()
            break
          case 1:
            handleExportClick()
            break
          case 2:
            handleRenameClick()
            break
          case 3:
            handleMoveClick()
            break
          case 4:
            handleOpenFolder()
            break
          case 5:
            handleMembersClick()
            break
          case 6:
            if (!isMemberManagementDisabled) {
              toggleSubscription()
            }
            break
          case 7:
            handleAttachmentsClick()
            break
          case 8:
            handleDeleteClick()
            break
          case 9:
            if (showDeleteConfirm) {
              handleConfirmDelete()
            }
            break
          case 10:
            if (showDeleteConfirm) {
              handleCancelDeleteConfirm()
            }
            break
        }
      } else {
        switch (baseIndex) {
          case 0:
            onOpenComments?.()
            break
          case 1:
            handleExportClick()
            break
          case 2:
            handleRenameClick()
            break
          case 3:
            handleMoveClick()
            break
          case 4:
            handleMembersClick()
            break
          case 5:
            if (!isMemberManagementDisabled) {
              toggleSubscription()
            }
            break
          case 6:
            handleAttachmentsClick()
            break
          case 7:
            handleDeleteClick()
            break
          case 8:
            if (showDeleteConfirm) {
              handleConfirmDelete()
            }
            break
          case 9:
            if (showDeleteConfirm) {
              handleCancelDeleteConfirm()
            }
            break
        }
      }
    },
    [
      draftActionCount,
      draftState.isConflict,
      draftState.isOrphaned,
      handleDiscardDraft,
      handleForceSave,
      handleRestore,
      handleRetryDraft,
      baseActionStartIndex,
      hasFolder,
      handleExportClick,
      handleRenameClick,
      handleMoveClick,
      handleOpenFolder,
      handleMembersClick,
      toggleSubscription,
      onOpenComments,
      handleAttachmentsClick,
      handleDeleteClick,
      handleConfirmDelete,
      handleCancelDeleteConfirm,
      showDeleteConfirm,
      isMemberManagementDisabled,
    ]
  )

  // Total item count: draft actions + action rows (with optional delete sub-rows) + links.
  const totalItemCount = linksStartIndex + linksItemCount

  return (
    <Sidecar itemCount={totalItemCount} onSelect={handleSelect}>
      {/* Draft section - shows when there are unsynced changes */}
      <DraftSidecarSection
        entityLabel="paper"
        draftState={draftState}
        canonicalUpdatedAt={canonicalPaper?.updatedAt}
        localUpdatedAt={
          draftState.draftEntity
            ? new Date(draftState.draftEntity.entity.updated_at)
            : paper.updatedAt
              ? paper.updatedAt
              : undefined
        }
        diffRows={diffRows}
        startIndex={0}
        onRetry={handleRetryDraft}
        onDiscard={handleDiscardDraft}
        onForceSave={handleForceSave}
        onRestore={handleRestore}
        onSyncAllDrafts={handleSyncAllDrafts}
      />

      <SidecarSection title="Details">
        <SidecarMetaList>
          <SidecarMetaItem icon={<User size={12} />} label="Creator" value={creatorName} />
          <SidecarMetaItem
            icon={<Calendar size={12} />}
            label="Created"
            value={formatDate(paper.createdAt.getTime())}
          />
          <SidecarMetaItem
            icon={<Calendar size={12} />}
            label="Updated"
            value={formatDate(paper.updatedAt.getTime())}
          />
          <SidecarMetaItem
            icon={
              saveState.isSaving ? (
                <Loader2 size={12} className={styles.sidecarSpinner} />
              ) : (
                <Save size={12} />
              )
            }
            label="Last saved"
            value={
              saveState.isSaving ? (
                "Saving..."
              ) : saveState.lastSavedAt ? (
                <RelativeTimestamp timestamp={saveState.lastSavedAt} />
              ) : (
                "—"
              )
            }
          />
        </SidecarMetaList>
      </SidecarSection>

      <SidecarSection title="Actions">
        <SidecarMenu>
          <SidecarRow
            index={baseActionStartIndex + 0}
            icon={<MessageCircle size={14} />}
            title="Comments"
            meta={commentCountDisplay}
            onClick={onOpenComments}
            disabled={!onOpenComments}
            testId="paper-comments-open"
          />
          <SidecarRow
            index={baseActionStartIndex + 1}
            icon={<Download size={14} />}
            title="Export"
            onClick={handleExportClick}
            testId="paper-export-open"
          />
          <SidecarRow
            index={baseActionStartIndex + 2}
            icon={<Edit2 size={14} />}
            title="Rename"
            onClick={handleRenameClick}
          />
          <SidecarRow
            index={baseActionStartIndex + 3}
            icon={<FolderInput size={14} />}
            title="Move"
            onClick={handleMoveClick}
          />
          {hasFolder && (
            <SidecarRow
              index={baseActionStartIndex + 4}
              icon={<FolderOpen size={14} />}
              title="Open folder"
              onClick={handleOpenFolder}
            />
          )}
          <SidecarRow
            index={baseActionStartIndex + (hasFolder ? 5 : 4)}
            icon={<Users size={14} />}
            title="Manage members"
            meta={memberCountDisplay}
            onClick={handleMembersClick}
            disabled={isMemberManagementDisabled}
          />
          <NotificationSubscriptionSidecarRow
            index={baseActionStartIndex + (hasFolder ? 6 : 5)}
            isSubscribed={isSubscribed}
            isLoading={isSubscriptionLoading}
            isSaving={isSaving}
            onToggle={toggleSubscription}
            isDisabled={isMemberManagementDisabled}
            disabledMeta={subscriptionDisabledMeta}
            testId="paper-subscription-toggle"
          />
          <SidecarRow
            index={baseActionStartIndex + (hasFolder ? 7 : 6)}
            icon={<Paperclip size={14} />}
            title="Attachments"
            meta={attachmentCountDisplay}
            onClick={handleAttachmentsClick}
          />
          <SidecarRow
            index={deleteActionIndex}
            icon={<Trash2 size={14} />}
            title="Delete"
            onClick={handleDeleteClick}
            disabled={isDeleting}
            isDestructive
            testId="paper-delete"
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
                testId="paper-delete-confirm"
              />
              <SidecarRow
                index={cancelDeleteIndex}
                title="Cancel"
                onClick={handleCancelDeleteConfirm}
                disabled={isDeleting}
                isSubRow
                testId="paper-delete-cancel"
              />
            </>
          )}
          {workspaceId && copyLinkIndex !== null && (
            <CopyLinkSidecarRow
              workspaceId={workspaceId}
              tool="papers"
              entityId={paper.id}
              index={copyLinkIndex}
            />
          )}
        </SidecarMenu>
      </SidecarSection>

      {/* Entity Links Section */}
      <LinksSidecarSection
        entityId={paper.id}
        entityType="paper"
        startIndex={linksStartIndex}
      />
    </Sidecar>
  )
}

/**
 * PaperRenameSidecar allows renaming a paper.
 * This is pushed onto the sidecar stack when rename is clicked.
 */
interface PaperRenameSidecarProps {
  currentTitle: string
  onTitleChange?: (newTitle: string) => void
}

function PaperRenameSidecar({ currentTitle, onTitleChange }: PaperRenameSidecarProps) {
  const { popSidecar } = useSidecar()
  const [name, setName] = useState(currentTitle)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  // Handle submit - use the callback to update the title in the editor
  // The editor already has debounced save logic, so we just update locally
  const handleSubmit = useCallback(() => {
    if (name.trim() && name !== currentTitle) {
      onTitleChange?.(name.trim())
    }
    popSidecar()
  }, [name, currentTitle, onTitleChange, popSidecar])

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
            data-testid="paper-rename-input"
          />
          <div className={styles.sidecarInputActions}>
            <button className={styles.sidecarCancelButton} onClick={() => popSidecar()}>
              Cancel
            </button>
            <button className={styles.sidecarConfirmButton} onClick={handleSubmit} disabled={!name.trim()}>
              Save
            </button>
          </div>
        </div>
      </SidecarSection>
    </Sidecar>
  )
}

/**
 * AttachmentsSidecar displays the list of files attached to a paper.
 * Pushed onto the sidecar stack when "Attachments" action is clicked.
 */
interface AttachmentsSidecarProps {
  paperId: string
}

function AttachmentsSidecar({ paperId }: AttachmentsSidecarProps) {
  const { pushSidecar } = useSidecar()
  const { data: attachments, isLoading } = useFilesByEntity(paperId, "paper")

  // Handle attachment click - pushes attachment detail sidecar onto stack
  const handleAttachmentClick = useCallback(
    (file: DecryptedFile) => {
      pushSidecar(<AttachmentDetailSidecar file={file} />, file.content.name)
    },
    [pushSidecar]
  )

  // Handle keyboard selection
  const handleSelect = useCallback(
    (index: number) => {
      if (attachments && index >= 0 && index < attachments.length) {
        handleAttachmentClick(attachments[index])
      }
    },
    [attachments, handleAttachmentClick]
  )

  const itemCount = attachments?.length ?? 0

  if (isLoading) {
    return (
      <Sidecar itemCount={0} onSelect={() => {}}>
        <SidecarSection title="Files">
          <div className={styles.sidecarLoadingContainer}>
            <Loader size={14} className={styles.sidecarSpinner} />
          </div>
        </SidecarSection>
      </Sidecar>
    )
  }

  if (!attachments || attachments.length === 0) {
    return (
      <Sidecar itemCount={0} onSelect={() => {}}>
        <SidecarSection title="Files">
          <div className={styles.sidecarEmptyState}>No files attached</div>
        </SidecarSection>
      </Sidecar>
    )
  }

  return (
    <Sidecar itemCount={itemCount} onSelect={handleSelect}>
      <SidecarSection title="Files">
        <SidecarMenu>
          {attachments.map((file: DecryptedFile, idx: number) => (
            <SidecarRow
              key={file.id}
              index={idx}
              icon={getFileIcon(file.content.mimeType)}
              title={file.content.name}
              meta={formatFileSize(file.metaFields.size)}
              onClick={() => handleAttachmentClick(file)}
            />
          ))}
        </SidecarMenu>
      </SidecarSection>
    </Sidecar>
  )
}

/**
 * AttachmentDetailSidecar displays file details with a download option.
 * Pushed onto the sidecar stack when an attachment is clicked.
 */
interface AttachmentDetailSidecarProps {
  file: DecryptedFile
}

function AttachmentDetailSidecar({ file }: AttachmentDetailSidecarProps) {
  const downloadFile = useEngineForFileDownload()
  const [isDownloading, setIsDownloading] = useState(false)

  // Format date for display
  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  // Handle download to disk
  const handleDownload = useCallback(async () => {
    if (isDownloading) return

    setIsDownloading(true)
    try {
      const blobUrl = await downloadFile(file.id)
      if (blobUrl) {
        const link = document.createElement("a")
        link.href = blobUrl
        link.download = file.content.name
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }
    } catch (error) {
      console.error("Failed to download file:", error)
    } finally {
      setIsDownloading(false)
    }
  }, [file.id, file.content.name, downloadFile, isDownloading])

  // Handle keyboard selection
  const handleSelect = useCallback(
    (index: number) => {
      if (index === 0) {
        handleDownload()
      }
    },
    [handleDownload]
  )

  return (
    <Sidecar itemCount={1} onSelect={handleSelect}>
      <SidecarSection title="Details">
        <SidecarMetaList>
          <SidecarMetaItem
            icon={getFileIcon(file.content.mimeType)}
            label="Type"
            value={file.content.mimeType || "Unknown"}
          />
          <SidecarMetaItem icon={<File size={12} />} label="Size" value={formatFileSize(file.metaFields.size)} />
          <SidecarMetaItem icon={<Calendar size={12} />} label="Added" value={formatDate(file.createdAt)} />
        </SidecarMetaList>
      </SidecarSection>

      <SidecarSection title="Actions">
        <SidecarMenu>
          <SidecarRow
            index={0}
            icon={
              isDownloading ? <Loader size={14} className={styles.sidecarSpinner} /> : <Download size={14} />
            }
            title={isDownloading ? "Downloading..." : "Download"}
            onClick={handleDownload}
            disabled={isDownloading}
          />
        </SidecarMenu>
      </SidecarSection>
    </Sidecar>
  )
}
