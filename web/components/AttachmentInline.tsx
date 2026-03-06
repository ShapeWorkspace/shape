/**
 * AttachmentInline renders file attachments inline within content.
 *
 * Used by TipTapRenderer to display attachment nodes from TipTap-generated HTML.
 * Handles loading, error states, and different file types (images, videos, files).
 *
 * Download URLs are fetched dynamically since presigned URLs expire.
 * React Query handles caching to avoid redundant downloads.
 */

import { useState, useCallback } from "react"
import { Loader, File, FileText, Image, Film, FileAudio, AlertCircle, Download } from "lucide-react"
import * as styles from "../styles/attachment-node.css"
import { useDownloadFile, useEngineForFileDownload } from "../store/queries/use-files"

// Files larger than 10MB won't auto-load to save bandwidth
const AUTOLOAD_SIZE_THRESHOLD_BYTES = 10 * 1024 * 1024

/**
 * Props for the AttachmentInline component.
 */
export interface AttachmentInlineProps {
  /** File ID for fetching the file from the server */
  fileId: string
  /** Original filename for display */
  fileName: string
  /** MIME type of the file */
  fileType: string
  /** File size in bytes */
  fileSize: number
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
 * Check if the file type is an image that can be previewed inline.
 */
function isPreviewableImage(mimeType: string): boolean {
  return mimeType.startsWith("image/")
}

/**
 * Check if the file type is a video that can be played inline.
 */
function isPreviewableVideo(mimeType: string): boolean {
  return mimeType.startsWith("video/")
}

/**
 * AttachmentInline renders file attachments within read-only content.
 * Fetches and displays files based on their type (image, video, or generic file chip).
 */
export function AttachmentInline({ fileId, fileName, fileType, fileSize }: AttachmentInlineProps) {
  // Track whether user has chosen to show a large file anyway
  const [showLargeFileAnyway, setShowLargeFileAnyway] = useState(false)
  // Track download-to-disk loading state
  const [isDownloading, setIsDownloading] = useState(false)

  // Determine if this is a large file that shouldn't auto-load
  const isLargeFile = fileSize > AUTOLOAD_SIZE_THRESHOLD_BYTES

  // Only auto-fetch small files, or large files when user clicks "Show anyway"
  const shouldAutoFetch = !!fileId && (!isLargeFile || showLargeFileAnyway)
  const { data: fileData, isLoading, isError } = useDownloadFile(fileId, shouldAutoFetch)

  // Hook for manual file download
  const downloadFile = useEngineForFileDownload()

  // Handle "Show anyway" click for large files
  const handleShowAnyway = useCallback(() => {
    setShowLargeFileAnyway(true)
  }, [])

  // Handle download to disk
  const handleDownloadToDisk = useCallback(async () => {
    if (!fileId || isDownloading) return

    setIsDownloading(true)
    try {
      const blobUrl = await downloadFile(fileId)
      if (blobUrl) {
        const link = document.createElement("a")
        link.href = blobUrl
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }
    } catch (error) {
      console.error("Failed to download file:", error)
    } finally {
      setIsDownloading(false)
    }
  }, [fileId, fileName, downloadFile, isDownloading])

  // Large file that user hasn't chosen to show yet
  if (isLargeFile && !showLargeFileAnyway) {
    return (
      <span className={styles.attachmentWrapper}>
        <span className={styles.attachmentChipLarge}>
          <span className={styles.attachmentChipRow}>
            <span className={styles.attachmentIcon}>{getFileIcon(fileType)}</span>
            <span className={styles.attachmentName} title={fileName}>
              {fileName}
            </span>
            <span className={styles.attachmentSize}>{formatFileSize(fileSize)}</span>
            {isDownloading ? (
              <Loader size={14} className={styles.attachmentSpinner} />
            ) : (
              <button
                type="button"
                className={styles.attachmentDownloadButton}
                onClick={handleDownloadToDisk}
                title="Download to disk"
              >
                <Download size={14} />
              </button>
            )}
          </span>
          <span className={styles.attachmentLargeFileLabel}>
            Large file.{" "}
            <button type="button" className={styles.attachmentShowAnywayButton} onClick={handleShowAnyway}>
              Download and show.
            </button>
          </span>
        </span>
      </span>
    )
  }

  // Loading state: fetching file from server
  if (isLoading) {
    return (
      <span className={styles.attachmentWrapper}>
        <span className={styles.attachmentChip}>
          <Loader size={14} className={styles.attachmentSpinner} />
          <span className={styles.attachmentName} title={fileName}>
            {fileName}
          </span>
          <span className={styles.attachmentUploading}>Loading...</span>
        </span>
      </span>
    )
  }

  // Error state
  if (isError) {
    return (
      <span className={`${styles.attachmentWrapper} ${styles.attachmentError}`}>
        <span className={styles.attachmentChip}>
          <AlertCircle size={14} className={styles.attachmentErrorIcon} />
          <span className={styles.attachmentName} title={fileName}>
            {fileName}
          </span>
          <span className={styles.attachmentErrorText}>Failed to load</span>
        </span>
      </span>
    )
  }

  // Get the URL from auto-fetch
  const effectiveUrl = fileData?.url

  // Still waiting for data
  if (!effectiveUrl) {
    return (
      <span className={styles.attachmentWrapper}>
        <span className={styles.attachmentChip}>
          <Loader size={14} className={styles.attachmentSpinner} />
          <span className={styles.attachmentName} title={fileName}>
            {fileName}
          </span>
          <span className={styles.attachmentUploading}>Loading...</span>
        </span>
      </span>
    )
  }

  // Complete state: show image preview
  if (isPreviewableImage(fileType)) {
    return (
      <span className={styles.attachmentWrapper}>
        <img src={effectiveUrl} alt={fileName} className={styles.attachmentImage} draggable={false} />
      </span>
    )
  }

  // Complete state: show video player
  if (isPreviewableVideo(fileType)) {
    return (
      <span className={styles.attachmentWrapper}>
        <video src={effectiveUrl} controls className={styles.attachmentVideo} draggable={false}>
          Your browser does not support the video tag.
        </video>
      </span>
    )
  }

  // Complete state (non-image/video): show file chip with download button
  return (
    <span className={styles.attachmentWrapper}>
      <span className={styles.attachmentChip}>
        <span className={styles.attachmentIcon}>{getFileIcon(fileType)}</span>
        <span className={styles.attachmentName} title={fileName}>
          {fileName}
        </span>
        <span className={styles.attachmentSize}>{formatFileSize(fileSize)}</span>
        {isDownloading ? (
          <Loader size={14} className={styles.attachmentSpinner} />
        ) : (
          <button
            type="button"
            className={styles.attachmentDownloadButton}
            onClick={handleDownloadToDisk}
            title="Download to disk"
          >
            <Download size={14} />
          </button>
        )}
      </span>
    </span>
  )
}
