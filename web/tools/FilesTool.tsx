/**
 * FilesTool is the unified folder browser that shows files AND papers.
 * Uses real encrypted file/folder/paper data from the engine layer.
 *
 * Folders are unified containers - no longer separated by "type".
 * This tool shows all folders, files, and papers, with items sorted
 * by most recently updated.
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useWindowStore } from "../store/window-store"
import { useEngineStore } from "../store/engine-store"
import { useSidecar } from "../contexts/SidecarContext"
import { List, ListRow, ListSearch, ListEmpty, CustomListContent } from "../components/ListUI"
import type { DecryptedFile, DecryptedFolder, DecryptedPaper } from "../../engine/models/entity"
import { useFiles, useDownloadFile } from "../store/queries/use-files"
import { useFolders, useCreateFolder } from "../store/queries/use-folders"
import { useCreateFolderACLEntry } from "../store/queries/use-folder-acl"
import { usePapers, useCreatePaper } from "../store/queries/use-papers"
import { useUploadStore, UploadItem } from "../store/upload-store"
import { useGlobalDrop } from "../contexts/GlobalDropContext"
import { FileSidecar } from "../components/FileSidecar"
import { FolderSidecar } from "../components/FolderSidecar"
import { PaperSidecar } from "../components/PaperSidecar"
import { PaperEditor } from "../components/PaperEditor"
import { FolderIcon } from "../components/FolderIcon"
import { FormSidecar } from "../components/FormSidecar"
import {
  MemberSelectionField,
  type SelectedMember,
  type MemberSelectionFieldRef,
} from "../components/MemberSelectionField"
import {
  File,
  FileText,
  Image,
  Film,
  FileAudio,
  Upload,
  Loader,
  FolderPlus,
  Plus,
  AlertCircle,
  Video,
  Mic,
} from "lucide-react"
import { Sidecar, SidecarSection, SidecarRow, SidecarMenu } from "../components/SidecarUI"
import * as fileStyles from "../styles/files.css"
import { AudioRecordingTool, VideoRecordingTool } from "./RecordingTool"

/**
 * CreateFolderForm handles folder creation with member selection.
 * Members are added via ACL entries after the folder is created.
 */
interface CreateFolderFormProps {
  parentFolderId: string | null
  onSuccess: () => void
  onCancel: () => void
}

function CreateFolderForm({ parentFolderId, onSuccess, onCancel }: CreateFolderFormProps) {
  const [selectedMembers, setSelectedMembers] = useState<SelectedMember[]>([])
  const memberSelectionRef = useRef<MemberSelectionFieldRef>(null)

  // Mutations for creating folder and ACL entries
  const { mutateAsync: createFolder } = useCreateFolder()
  const { mutateAsync: createACLEntry } = useCreateFolderACLEntry()

  const handleSubmit = useCallback(
    async (values: Record<string, string | boolean>) => {
      const name = values.name as string

      // Create the folder first
      const folder = await createFolder({
        name: name.trim(),
        parentFolderId,
      })

      // Then create ACL entries for selected members
      // We don't await all of these - if some fail, the folder still exists
      // and the user can add members later via the manage members UI
      for (const member of selectedMembers) {
        try {
          await createACLEntry({
            folderId: folder.id,
            subjectType: member.subjectType,
            subjectId: member.subjectId,
            permission: member.permission,
          })
        } catch (error) {
          // Log but don't fail - folder is created, member can be added later
          console.error("Failed to add member to folder:", error)
        }
      }

      onSuccess()
    },
    [createFolder, createACLEntry, parentFolderId, selectedMembers, onSuccess]
  )

  return (
    <FormSidecar
      title="New Folder"
      fields={[
        {
          name: "name",
          type: "text",
          label: "Name",
          required: true,
          placeholder: "Folder name...",
          testId: "create-folder-name-input",
        },
      ]}
      onSubmit={handleSubmit}
      onCancel={onCancel}
      submitLabel="Create"
      memberSelectionRef={memberSelectionRef}
    >
      <MemberSelectionField
        ref={memberSelectionRef}
        selectedMembers={selectedMembers}
        onMembersChange={setSelectedMembers}
      />
    </FormSidecar>
  )
}

/**
 * FilesListSidecar displays the primary actions for the Files list view.
 * Shows options to create folders, upload files, and create papers.
 */
function FilesListSidecar({
  fileInputRef,
  isUploadDisabled,
}: {
  fileInputRef: React.RefObject<HTMLInputElement | null>
  isUploadDisabled: boolean
}) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { navigateTo } = useWindowStore()
  const { pushSidecar, popSidecar } = useSidecar()

  const createPaperMutation = useCreatePaper()

  // Get current folder from URL
  const currentFolderId = searchParams.get("folder")

  // Handle creating a new folder via dedicated form component with member selection
  const handleNewFolder = useCallback(() => {
    pushSidecar(
      <CreateFolderForm
        parentFolderId={currentFolderId}
        onSuccess={() => {
          popSidecar()
        }}
        onCancel={() => popSidecar()}
      />,
      "New Folder"
    )
  }, [pushSidecar, popSidecar, currentFolderId])

  const handleUploadFile = useCallback(() => {
    if (isUploadDisabled) {
      return
    }
    fileInputRef.current?.click()
  }, [fileInputRef, isUploadDisabled])

  const handleStartRecording = useCallback(
    (recordingKind: "video" | "audio") => {
      if (!workspaceId || isUploadDisabled) {
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
        folderId: currentFolderId ?? undefined,
      })

      const folderParam = currentFolderId ? `&folder=${currentFolderId}` : ""
      navigate(`/w/${workspaceId}/files/${recordingSessionId}?type=${itemType}${folderParam}`)
    },
    [workspaceId, isUploadDisabled, navigateTo, navigate, currentFolderId]
  )

  const handleNewPaper = useCallback(async () => {
    if (!workspaceId) return

    const now = new Date()
    const dateStr = now.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    const defaultName = `Untitled Paper ${dateStr}`

    try {
      const createdPaper = createPaperMutation.createOptimistically({
        name: defaultName,
        folderId: currentFolderId,
      })
      navigateTo({
        id: createdPaper.id,
        label: createdPaper.name,
        tool: "files",
        itemId: createdPaper.id,
        itemType: "paper",
        folderId: currentFolderId ?? undefined,
      })
      const folderParam = currentFolderId ? `&folder=${currentFolderId}` : ""
      navigate(`/w/${workspaceId}/files/${createdPaper.id}?type=paper${folderParam}`)
      await createdPaper.promise
    } catch (err) {
      console.error("Failed to create paper:", err)
    }
  }, [workspaceId, currentFolderId, createPaperMutation, navigateTo, navigate])

  const handleSelect = useCallback(
    (index: number) => {
      switch (index) {
        case 0:
          handleNewFolder()
          break
        case 1:
          if (!isUploadDisabled) {
            handleUploadFile()
          }
          break
        case 2:
          handleNewPaper()
          break
        case 3:
          handleStartRecording("video")
          break
        case 4:
          handleStartRecording("audio")
          break
      }
    },
    [handleNewFolder, handleUploadFile, handleNewPaper, handleStartRecording, isUploadDisabled]
  )

  return (
    <Sidecar itemCount={5} onSelect={handleSelect}>
      <SidecarSection title="">
        <SidecarMenu>
          <SidecarRow
            index={0}
            icon={<FolderPlus size={14} />}
            title="New folder"
            onClick={handleNewFolder}
            testId="sidecar-new-folder"
          />
          <SidecarRow
            index={1}
            icon={<Upload size={14} />}
            title="Upload file"
            onClick={handleUploadFile}
            disabled={isUploadDisabled}
            testId="sidecar-upload-file"
          />
          <SidecarRow
            index={2}
            icon={<Plus size={14} />}
            title="New paper"
            onClick={handleNewPaper}
            testId="sidecar-new-paper"
          />
          <SidecarRow
            index={3}
            icon={<Video size={14} />}
            title="New video recording"
            onClick={() => handleStartRecording("video")}
            disabled={isUploadDisabled}
            testId="sidecar-new-video-recording"
          />
          <SidecarRow
            index={4}
            icon={<Mic size={14} />}
            title="New audio recording"
            onClick={() => handleStartRecording("audio")}
            disabled={isUploadDisabled}
            testId="sidecar-new-audio-recording"
          />
        </SidecarMenu>
      </SidecarSection>
    </Sidecar>
  )
}

/**
 * Represents an item in the unified folder browser.
 * Can be a folder, file, or paper.
 */
type FolderItem =
  | { kind: "folder"; data: DecryptedFolder; updatedAt: number }
  | { kind: "file"; data: DecryptedFile; updatedAt: number }
  | { kind: "paper"; data: DecryptedPaper; updatedAt: number }

/**
 * FilesTool is the unified folder browser showing files, folders, and papers.
 */
export function FilesTool() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { workspaceId, itemId } = useParams<{ workspaceId: string; itemId?: string }>()
  const { navigateTo } = useWindowStore()
  const { application } = useEngineStore()
  const { setSidecar, clearSidecar } = useSidecar()
  const { uploadFiles } = useGlobalDrop()
  const [searchQuery, setSearchQuery] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isFileUploadBlocked = !application?.isWorkspaceRemote()

  // Check if viewing a paper vs file (via URL param)
  const itemType = searchParams.get("type")

  // Current folder from URL search params (null = root)
  const currentFolderId = searchParams.get("folder")

  // Fetch files, folders, and papers from engine (all folders, no type filtering)
  const { data: files = [], isLoading: filesLoading, error: filesError } = useFiles()
  const { data: folders = [], isLoading: foldersLoading, error: foldersError } = useFolders()
  const { data: papers = [], isLoading: papersLoading, error: papersError } = usePapers()

  // Find current folder from the folders list
  const currentFolder = useMemo(() => {
    if (!currentFolderId) return null
    return folders.find((f: DecryptedFolder) => f.id === currentFolderId) ?? null
  }, [currentFolderId, folders])

  // Track the folder ID for which we've set the sidecar.
  // This prevents resetting the sidecar stack when folder data changes (e.g., during rename).
  const lastSidecarFolderIdRef = useRef<string | null | undefined>(undefined)
  // Track the previous item selection so we can refresh the list sidecar after exiting a detail view.
  const previousItemIdRef = useRef<string | null | undefined>(undefined)

  // Update sidecar when current folder changes or at root level.
  // Skip when viewing a specific item - item viewers handle their own sidecars.
  useEffect(() => {
    const didExitItemView = Boolean(previousItemIdRef.current) && !itemId
    if (didExitItemView) {
      // Force a refresh when returning to the list so stale file sidecar content is cleared.
      lastSidecarFolderIdRef.current = undefined
    }
    previousItemIdRef.current = itemId

    if (itemId) return

    // Only set sidecar if:
    // 1. We haven't set it yet for this folder ID (first time), OR
    // 2. The folder ID has changed
    const folderIdChanged = lastSidecarFolderIdRef.current !== currentFolderId
    const needsInitialSet = lastSidecarFolderIdRef.current === undefined

    if (!folderIdChanged && !needsInitialSet) {
      return
    }

    // If we have a folder ID but currentFolder hasn't loaded yet, wait
    if (currentFolderId && !currentFolder) {
      return
    }

    lastSidecarFolderIdRef.current = currentFolderId

    if (currentFolder) {
      setSidecar(<FolderSidecar folder={currentFolder} />, currentFolder.content.name)
    } else {
      // At root level, show FilesListSidecar with actions
      setSidecar(
        <FilesListSidecar fileInputRef={fileInputRef} isUploadDisabled={isFileUploadBlocked} />,
        "Actions"
      )
    }
  }, [currentFolder, currentFolderId, setSidecar, itemId, isFileUploadBlocked])

  // Clear sidecar when this tool unmounts
  useEffect(() => {
    return () => {
      clearSidecar()
      // Reset the ref so that if StrictMode re-runs the effect, we'll set the sidecar again
      lastSidecarFolderIdRef.current = undefined
      previousItemIdRef.current = undefined
    }
  }, [clearSidecar])

  const isLoading = filesLoading || foldersLoading || papersLoading
  const error = filesError || foldersError || papersError

  // Get uploads from store
  const uploads = useUploadStore(state => state.uploads)
  const activeUploads = uploads.filter(u => u.status === "pending" || u.status === "uploading")

  // Compute folders in current view (subfolders of current folder)
  const displayFolders = useMemo(() => {
    return folders
      .filter((f: DecryptedFolder) => {
        const folderParent = f.parentId ?? null
        const currentParent = currentFolderId ?? null
        return folderParent === currentParent
      })
      .filter((f: DecryptedFolder) => {
        if (!searchQuery) return true
        return f.content.name.toLowerCase().includes(searchQuery.toLowerCase())
      })
  }, [folders, currentFolderId, searchQuery])

  // Compute files in current view (files in current folder)
  const displayFiles = useMemo(() => {
    return files
      .filter((f: DecryptedFile) => {
        const fileFolder = f.parentId ?? null
        const currentParent = currentFolderId ?? null
        return fileFolder === currentParent
      })
      .filter((f: DecryptedFile) => {
        if (!searchQuery) return true
        return f.content.name.toLowerCase().includes(searchQuery.toLowerCase())
      })
  }, [files, currentFolderId, searchQuery])

  // Compute papers in current view (papers in current folder)
  const displayPapers = useMemo(() => {
    return papers
      .filter((p: DecryptedPaper) => {
        const paperFolder = p.metaFields.folder_id ?? null
        const currentParent = currentFolderId ?? null
        return paperFolder === currentParent
      })
      .filter((p: DecryptedPaper) => {
        if (!searchQuery) return true
        return p.content.name.toLowerCase().includes(searchQuery.toLowerCase())
      })
  }, [papers, currentFolderId, searchQuery])

  // Combine all items and sort by most recent (interleaved by date)
  const displayItems: FolderItem[] = useMemo(() => {
    const items: FolderItem[] = [
      ...displayFolders.map((f): FolderItem => ({ kind: "folder", data: f, updatedAt: f.updatedAt.getTime() })),
      ...displayFiles.map((f): FolderItem => ({ kind: "file", data: f, updatedAt: f.updatedAt.getTime() })),
      ...displayPapers.map((p): FolderItem => ({ kind: "paper", data: p, updatedAt: p.updatedAt.getTime() })),
    ]
    // Sort by most recently updated
    return items.sort((a, b) => b.updatedAt - a.updatedAt)
  }, [displayFolders, displayFiles, displayPapers])

  // Total item count: 1 action (upload file) + uploads + items
  const itemCount = 1 + activeUploads.length + displayItems.length

  const handleAddFileClick = useCallback(() => {
    if (isFileUploadBlocked) {
      return
    }
    fileInputRef.current?.click()
  }, [isFileUploadBlocked])

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = e.target.files
      if (selectedFiles && selectedFiles.length > 0) {
        if (!isFileUploadBlocked) {
          uploadFiles(Array.from(selectedFiles))
        }
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    },
    [uploadFiles, isFileUploadBlocked]
  )

  const handleSelectFolder = useCallback(
    (folder: DecryptedFolder) => {
      if (!workspaceId) return
      setSidecar(<FolderSidecar folder={folder} />, folder.content.name)
      navigateTo({
        id: folder.id,
        label: folder.content.name,
        tool: "files",
        folderId: folder.id,
      })
      navigate(`/w/${workspaceId}/files?folder=${folder.id}`)
    },
    [workspaceId, setSidecar, navigateTo, navigate]
  )

  const handleSelectFile = useCallback(
    (file: DecryptedFile) => {
      if (!workspaceId) return
      setSidecar(<FileSidecar file={file} />, file.content.name)
      navigateTo({
        id: file.id,
        label: file.content.name,
        tool: "files",
        itemId: file.id,
        itemType: "file",
        folderId: currentFolderId ?? undefined,
      })
      const folderParam = currentFolderId ? `&folder=${currentFolderId}` : ""
      navigate(`/w/${workspaceId}/files/${file.id}?type=file${folderParam}`)
    },
    [workspaceId, navigateTo, navigate, setSidecar, currentFolderId]
  )

  const handleSelectPaper = useCallback(
    (paper: DecryptedPaper) => {
      if (!workspaceId) return
      setSidecar(
        <PaperSidecar paper={paper} currentTitle={paper.content.name} onTitleChange={() => {}} />,
        paper.content.name
      )
      navigateTo({
        id: paper.id,
        label: paper.content.name,
        tool: "files",
        itemId: paper.id,
        itemType: "paper",
        folderId: currentFolderId ?? undefined,
      })
      const folderParam = currentFolderId ? `&folder=${currentFolderId}` : ""
      navigate(`/w/${workspaceId}/files/${paper.id}?type=paper${folderParam}`)
    },
    [workspaceId, navigateTo, navigate, setSidecar, currentFolderId]
  )

  const handleSelectByIndex = useCallback(
    (index: number) => {
      // Index 0 = Upload file action
      if (index === 0) {
        handleAddFileClick()
        return
      }

      let adjustedIndex = index - 1

      // Check if it's an upload
      if (adjustedIndex < activeUploads.length) {
        return
      }
      adjustedIndex -= activeUploads.length

      // Check if it's an item
      if (adjustedIndex < displayItems.length) {
        const item = displayItems[adjustedIndex]
        if (item) {
          switch (item.kind) {
            case "folder":
              handleSelectFolder(item.data)
              break
            case "file":
              handleSelectFile(item.data)
              break
            case "paper":
              handleSelectPaper(item.data)
              break
          }
        }
      }
    },
    [
      displayItems,
      handleSelectFolder,
      handleSelectFile,
      handleSelectPaper,
      activeUploads.length,
      handleAddFileClick,
    ]
  )

  // If viewing a specific item, show the appropriate viewer
  if (itemId) {
    if (itemType === "video-recording") {
      return (
        <CustomListContent>
          <VideoRecordingTool folderId={currentFolderId} />
        </CustomListContent>
      )
    }
    if (itemType === "audio-recording") {
      return (
        <CustomListContent>
          <AudioRecordingTool folderId={currentFolderId} />
        </CustomListContent>
      )
    }
    if (itemType === "paper") {
      const paper = papers.find((p: DecryptedPaper) => p.id === itemId)
      if (!paper && !isLoading) {
        return (
          <CustomListContent>
            <div>Paper not found</div>
          </CustomListContent>
        )
      }
      if (paper) {
        return (
          <CustomListContent>
            <PaperEditor paper={paper} />
          </CustomListContent>
        )
      }
    } else {
      // Default to file
      const file = files.find((f: DecryptedFile) => f.id === itemId)
      if (!file && !isLoading) {
        return (
          <CustomListContent>
            <div>File not found</div>
          </CustomListContent>
        )
      }
      if (file) {
        return (
          <CustomListContent>
            <FileViewer file={file} />
          </CustomListContent>
        )
      }
    }
    // Still loading
    return (
      <CustomListContent>
        <div className={fileStyles.fileViewer}>
          <Loader size={20} className={fileStyles.loadingSpinner} />
          <span>Loading...</span>
        </div>
      </CustomListContent>
    )
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return ""
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return <Image size={16} />
    if (mimeType.startsWith("video/")) return <Film size={16} />
    if (mimeType.startsWith("audio/")) return <FileAudio size={16} />
    if (mimeType === "application/pdf") return <FileText size={16} />
    return <File size={16} />
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  if (error) {
    return <ListEmpty message={`Error loading: ${error.message}`} />
  }

  return (
    <>
      {/* Hidden file input for system picker */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={handleFileInputChange}
        disabled={isFileUploadBlocked}
        data-testid="file-input"
      />

      <List
        key={currentFolderId ?? "root"}
        itemCount={itemCount}
        onSelect={handleSelectByIndex}
        testId="files-tool-container"
      >
        <ListSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search files, folders, and papers..."
          testId="files-search-input"
        />

        {isFileUploadBlocked && (
          <ListRow
            index={-1}
            icon={<AlertCircle size={16} />}
            title="File uploads are unavailable in local-only mode."
            meta="Sign up to upload files and sync data."
            disabled
            testId="files-upload-disabled-message"
          />
        )}

        {/* Upload file action in the primary list */}
        <ListRow
          index={0}
          icon={<Upload size={16} />}
          title="Upload file"
          isCreateAction
          onClick={handleAddFileClick}
          disabled={isFileUploadBlocked}
          testId="add-file-button"
        />

        {/* Active uploads */}
        {activeUploads.map((upload, index) => (
          <UploadingRow key={upload.id} upload={upload} index={1 + index} />
        ))}

        {/* All items (folders, files, papers) interleaved by date */}
        {displayItems.map((item, index) => {
          switch (item.kind) {
            case "folder":
              return (
                <ListRow
                  key={`folder-${item.data.id}`}
                  index={1 + activeUploads.length + index}
                  icon={<FolderIcon size={16} />}
                  title={item.data.content.name}
                  meta={formatDate(item.updatedAt)}
                  onClick={() => handleSelectFolder(item.data)}
                  testId={`folder-item-${item.data.id}`}
                />
              )
            case "file":
              return (
                <ListRow
                  key={`file-${item.data.id}`}
                  index={1 + activeUploads.length + index}
                  icon={getFileIcon(item.data.content.mimeType)}
                  title={item.data.content.name}
                  meta={formatSize(item.data.metaFields.size)}
                  onClick={() => handleSelectFile(item.data)}
                  testId={`file-item-${item.data.id}`}
                />
              )
            case "paper":
              return (
                <ListRow
                  key={`paper-${item.data.id}`}
                  index={1 + activeUploads.length + index}
                  icon={<FileText size={16} />}
                  title={item.data.content.name || "Untitled"}
                  meta={formatDate(item.updatedAt)}
                  onClick={() => handleSelectPaper(item.data)}
                  testId={`paper-item-${item.data.id}`}
                />
              )
          }
        })}

        {/* Empty state */}
        {displayItems.length === 0 && activeUploads.length === 0 && searchQuery && (
          <ListEmpty message="No items found" />
        )}

        {displayItems.length === 0 && activeUploads.length === 0 && !searchQuery && !isLoading && (
          <ListEmpty message="No items yet. Upload files, create folders, or add papers." />
        )}

        {isLoading && displayItems.length === 0 && <ListEmpty message="Loading..." />}
      </List>
    </>
  )
}

/**
 * Row showing an active upload with progress.
 */
interface UploadingRowProps {
  upload: UploadItem
  index: number
}

function UploadingRow({ upload, index: _index }: UploadingRowProps) {
  const progressText = upload.status === "error" ? `Error: ${upload.error}` : `${upload.progress}%`

  const progressWidth = upload.status === "error" ? 0 : upload.progress

  return (
    <div className={fileStyles.uploadRow} data-testid={`upload-${upload.id}`}>
      <span className={fileStyles.uploadRowIcon}>
        <Upload size={16} />
      </span>
      <span className={fileStyles.uploadRowTitle}>{upload.file.name}</span>
      <span className={fileStyles.uploadRowMeta}>{progressText}</span>
      <div className={fileStyles.uploadProgressBar}>
        <div className={fileStyles.uploadProgressFill} style={{ width: `${progressWidth}%` }} />
      </div>
    </div>
  )
}

/**
 * FileViewer displays file content with preview support.
 */
interface FileViewerProps {
  file: DecryptedFile
}

function FileViewer({ file }: FileViewerProps) {
  const { setSidecar } = useSidecar()
  const { data: downloadData, isLoading } = useDownloadFile(file.id, true)

  useEffect(() => {
    setSidecar(<FileSidecar file={file} />, file.content.name)
  }, [file, setSidecar])

  const getIcon = () => {
    if (file.content.mimeType.startsWith("image/")) return <Image size={20} />
    if (file.content.mimeType.startsWith("video/")) return <Film size={20} />
    if (file.content.mimeType.startsWith("audio/")) return <FileAudio size={20} />
    if (file.content.mimeType === "application/pdf") return <FileText size={20} />
    return <File size={20} />
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const renderPreview = () => {
    if (isLoading) {
      return (
        <div className={fileStyles.fileContent}>
          <Loader size={20} className={fileStyles.loadingSpinner} />
          <span>Decrypting file...</span>
        </div>
      )
    }

    if (!downloadData) {
      return <div className={fileStyles.fileContent}>Unable to load file preview</div>
    }

    const { url } = downloadData

    if (file.content.mimeType.startsWith("image/")) {
      return (
        <div className={fileStyles.fileContent}>
          <img
            src={url}
            alt={file.content.name}
            style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain" }}
          />
        </div>
      )
    }

    if (file.content.mimeType.startsWith("video/")) {
      return (
        <div className={fileStyles.fileContent}>
          <video src={url} controls style={{ maxWidth: "100%", maxHeight: "70vh" }}>
            Your browser does not support video playback.
          </video>
        </div>
      )
    }

    if (file.content.mimeType.startsWith("audio/")) {
      return (
        <div className={fileStyles.fileContent}>
          <audio src={url} controls style={{ width: "100%" }}>
            Your browser does not support audio playback.
          </audio>
        </div>
      )
    }

    if (file.content.mimeType === "application/pdf") {
      return (
        <div className={fileStyles.fileContent}>
          <iframe src={url} title={file.content.name} style={{ width: "100%", height: "70vh", border: "none" }} />
        </div>
      )
    }

    if (file.content.mimeType.startsWith("text/")) {
      return <TextPreview blob={downloadData.blob} />
    }

    return (
      <div className={fileStyles.fileContent}>
        <p>Preview not available for this file type.</p>
        <a href={url} download={file.content.name}>
          Download {file.content.name}
        </a>
      </div>
    )
  }

  return (
    <div className={fileStyles.fileViewer} data-testid="file-viewer">
      <div className={fileStyles.fileHeader}>
        <div className={fileStyles.fileIcon}>{getIcon()}</div>
        <div className={fileStyles.fileInfo}>
          <h2>{file.content.name}</h2>
          <p>
            {formatSize(file.metaFields.size)} · {file.content.mimeType}
          </p>
        </div>
      </div>
      {renderPreview()}
    </div>
  )
}

function TextPreview({ blob }: { blob: Blob }) {
  const [text, setText] = useState<string>("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const readText = async () => {
      try {
        const content = await blob.text()
        setText(content)
      } catch {
        setText("Unable to read text content")
      } finally {
        setLoading(false)
      }
    }
    readText()
  }, [blob])

  if (loading) {
    return (
      <div className={fileStyles.fileContent}>
        <Loader size={20} />
        <span>Reading content...</span>
      </div>
    )
  }

  return (
    <div className={fileStyles.fileContent}>
      <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{text}</pre>
    </div>
  )
}
