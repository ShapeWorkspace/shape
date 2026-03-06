import { createContext, useContext, useEffect, useCallback, ReactNode, useMemo, useRef } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useGlobalFileDrop } from "../hooks/useGlobalFileDrop"
import { useUploadStore } from "../store/upload-store"
import { useUploadFile } from "../store/queries/use-files"
import { useWindowStore } from "../store/window-store"
import { useEngineStore } from "../store/engine-store"

/**
 * Context value for global file drop handling.
 */
interface GlobalDropContextValue {
  // Whether files are being dragged over the window
  isDragging: boolean
  // Upload files programmatically (e.g., from file input)
  uploadFiles: (files: File[]) => void
}

const GlobalDropContext = createContext<GlobalDropContextValue | null>(null)

/**
 * Hook to access global drop context.
 */
export function useGlobalDrop(): GlobalDropContextValue {
  const context = useContext(GlobalDropContext)
  if (!context) {
    throw new Error("useGlobalDrop must be used within GlobalDropProvider")
  }
  return context
}

interface GlobalDropProviderProps {
  children: ReactNode
}

/**
 * Provider for global file drop handling.
 *
 * Global file drop is only enabled on the root page (tool selector) and the Files tool.
 * Other tools handle their own file attachments via focused editors, so global drop
 * would be confusing and conflict with local behavior.
 *
 * When files are dropped:
 * - If on root page: open Files tool and upload to root folder
 * - If in Files tool: upload to current folder (or root if at root)
 */
export function GlobalDropProvider({ children }: GlobalDropProviderProps) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { application } = useEngineStore()
  const { windows, activeWindowId, getActiveWindow, createWindow } = useWindowStore()
  const workspaceId = application?.workspaceId ?? ""

  // Determine if global file drop should be enabled.
  // Only enabled on root page (no tool selected) or in the Files tool.
  // We subscribe to windows and activeWindowId to ensure re-renders when navigation changes.
  const isGlobalDropEnabled = useMemo(() => {
    const activeWindow = windows.find(w => w.id === activeWindowId)
    const currentTool = activeWindow?.tool
    // Root page: stack is empty (tool is null) OR no window exists (tool is undefined)
    // Files tool: tool is "files"
    return currentTool === null || currentTool === undefined || currentTool === "files"
  }, [windows, activeWindowId])

  const { isDragging, droppedFiles, clearDroppedFiles } = useGlobalFileDrop({
    enabled: isGlobalDropEnabled,
  })

  const { addUpload, startUpload, updateProgress, completeUpload, failUpload } = useUploadStore()
  const uploadFileMutation = useUploadFile()
  const processedDropKeyRef = useRef<string | null>(null)

  // Get current folder from URL (if in a folder view)
  const currentFolderId = searchParams.get("folder")

  /**
   * Upload a single file with progress tracking.
   * Uploads to the current folder if viewing a folder, otherwise to root.
   */
  const uploadSingleFile = useCallback(
    async (file: File, folderId: string | null) => {
      const uploadId = addUpload(file)
      startUpload(uploadId)

      try {
        const result = await uploadFileMutation.mutateAsync({
          file,
          folderId,
          onProgress: (loaded, total) => {
            const progress = Math.round((loaded / total) * 100)
            updateProgress(uploadId, progress)
          },
        })

        completeUpload(uploadId, result.id)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upload failed"
        failUpload(uploadId, message)
      }
    },
    [addUpload, startUpload, uploadFileMutation, updateProgress, completeUpload, failUpload]
  )

  /**
   * Upload multiple files to the current folder (or root if not in a folder).
   */
  const uploadFiles = useCallback(
    (files: File[]) => {
      if (!workspaceId || files.length === 0) return
      if (!application?.isWorkspaceRemote()) {
        return
      }

      // Check if we're currently in the Files tool
      const activeWindow = getActiveWindow()
      const currentTool = activeWindow?.tool

      if (currentTool !== "files") {
        // Not in Files tool - create new window and navigate to it
        // Uploads will go to root since we're navigating fresh
        createWindow("files")
        navigate(`/w/${workspaceId}/files`)
      }

      // Start uploading each file to the current folder
      for (const file of files) {
        uploadSingleFile(file, currentFolderId)
      }
    },
    [workspaceId, application, getActiveWindow, createWindow, navigate, currentFolderId, uploadSingleFile]
  )

  // Handle dropped files
  useEffect(() => {
    if (droppedFiles.length === 0) {
      processedDropKeyRef.current = null
      return
    }

    const dropKey = droppedFiles
      .map(file => `${file.name}:${file.size}:${file.lastModified}:${file.type}`)
      .join("|")
    if (processedDropKeyRef.current === dropKey) {
      return
    }
    processedDropKeyRef.current = dropKey

    // Consume dropped files once before triggering navigation/store updates.
    const filesToUpload = [...droppedFiles]
    clearDroppedFiles()
    Promise.resolve().then(() => {
      uploadFiles(filesToUpload)
    })
  }, [droppedFiles, uploadFiles, clearDroppedFiles])

  const contextValue: GlobalDropContextValue = {
    isDragging,
    uploadFiles,
  }

  return <GlobalDropContext.Provider value={contextValue}>{children}</GlobalDropContext.Provider>
}
