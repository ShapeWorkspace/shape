import { create } from "zustand"

/**
 * Represents a file upload in progress or completed.
 */
export interface UploadItem {
  id: string
  file: File
  progress: number // 0-100
  status: "pending" | "uploading" | "complete" | "error"
  error?: string
  fileId?: string // Server-assigned file ID after creation
}

/**
 * Upload store state.
 */
interface UploadState {
  uploads: UploadItem[]
}

/**
 * Upload store actions.
 */
interface UploadActions {
  // Add a new upload to the queue
  addUpload: (file: File) => string
  // Update progress for an upload
  updateProgress: (id: string, progress: number) => void
  // Mark an upload as started (uploading)
  startUpload: (id: string) => void
  // Mark an upload as complete with the server file ID
  completeUpload: (id: string, fileId: string) => void
  // Mark an upload as failed with an error message
  failUpload: (id: string, error: string) => void
  // Remove a completed or failed upload from the list
  removeUpload: (id: string) => void
  // Clear all completed uploads
  clearCompleted: () => void
  // Get uploads that are currently in progress
  getActiveUploads: () => UploadItem[]
}

export type UploadStore = UploadState & UploadActions

const generateId = () => Math.random().toString(36).substring(2, 11)

/**
 * Upload store for tracking file upload progress.
 * Used to display inline progress in the FilesTool list.
 */
export const useUploadStore = create<UploadStore>((set, get) => ({
  uploads: [],

  addUpload: (file: File) => {
    const id = generateId()
    const upload: UploadItem = {
      id,
      file,
      progress: 0,
      status: "pending",
    }

    set(state => ({
      uploads: [upload, ...state.uploads],
    }))

    return id
  },

  updateProgress: (id: string, progress: number) => {
    set(state => ({
      uploads: state.uploads.map(upload =>
        upload.id === id ? { ...upload, progress: Math.min(100, Math.max(0, progress)) } : upload
      ),
    }))
  },

  startUpload: (id: string) => {
    set(state => ({
      uploads: state.uploads.map(upload => (upload.id === id ? { ...upload, status: "uploading" } : upload)),
    }))
  },

  completeUpload: (id: string, fileId: string) => {
    set(state => ({
      uploads: state.uploads.map(upload =>
        upload.id === id ? { ...upload, status: "complete", progress: 100, fileId } : upload
      ),
    }))
  },

  failUpload: (id: string, error: string) => {
    set(state => ({
      uploads: state.uploads.map(upload =>
        upload.id === id ? { ...upload, status: "error", error } : upload
      ),
    }))
  },

  removeUpload: (id: string) => {
    set(state => ({
      uploads: state.uploads.filter(upload => upload.id !== id),
    }))
  },

  clearCompleted: () => {
    set(state => ({
      uploads: state.uploads.filter(upload => upload.status !== "complete"),
    }))
  },

  getActiveUploads: () => {
    return get().uploads.filter(upload => upload.status === "pending" || upload.status === "uploading")
  },
}))
