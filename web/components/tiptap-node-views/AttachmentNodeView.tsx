/**
 * React component for rendering file attachment nodes in TipTap editor.
 *
 * Renders different UI based on attachment status:
 * - Uploading: spinner + filename (fileId not yet set)
 * - Loading: spinner while fetching file from server (fileId set, data loading)
 * - Large file (>10MB): shows download button instead of auto-loading
 * - Complete (image): inline image preview
 * - Complete (video): inline video player
 * - Complete (other): file chip with icon, name, size
 * - Error: error state with filename
 *
 * Download URLs are fetched dynamically since presigned URLs expire after 15 minutes.
 * React Query handles caching to avoid redundant downloads.
 */

import { useState, useCallback } from "react"
import { NodeViewWrapper } from "@tiptap/react"
import type { NodeViewProps } from "@tiptap/react"
import { Loader, File, FileText, Image, Film, FileAudio, AlertCircle, Download } from "lucide-react"
import * as styles from "../../styles/attachment-node.css"
import type { AttachmentAttributes } from "../tiptap-extensions/AttachmentNode"
import { useDownloadFile, useEngineForFileDownload } from "../../store/queries/use-files"

// Files larger than 10MB won't auto-load to save bandwidth
const AUTOLOAD_SIZE_THRESHOLD_BYTES = 10 * 1024 * 1024

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
 * Supports common web-compatible video formats.
 */
function isPreviewableVideo(mimeType: string): boolean {
  return mimeType.startsWith("video/")
}

/**
 * AttachmentNodeView renders file attachments within the TipTap editor.
 * This component is used by ReactNodeViewRenderer in the AttachmentNode extension.
 */
export function AttachmentNodeView({ node, selected }: NodeViewProps) {
  const attrs = node.attrs as AttachmentAttributes
  const { fileId, fileName, fileType, fileSize, status } = attrs

  // Track whether user has chosen to show a large file anyway
  const [showLargeFileAnyway, setShowLargeFileAnyway] = useState(false)
  // Track download-to-disk loading state
  const [isDownloading, setIsDownloading] = useState(false)

  // Determine if this is a large file that shouldn't auto-load
  const isLargeFile = fileSize > AUTOLOAD_SIZE_THRESHOLD_BYTES

  // Only auto-fetch small files, or large files when user clicks "Show anyway"
  const shouldAutoFetch = status === "complete" && !!fileId && (!isLargeFile || showLargeFileAnyway)
  const { data: fileData, isLoading, isError } = useDownloadFile(fileId ?? "", shouldAutoFetch)

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

  // Build class names based on state
  const wrapperClassNames = [styles.attachmentWrapper]
  if (selected) wrapperClassNames.push(styles.attachmentSelected)
  if (status === "error" || isError) wrapperClassNames.push(styles.attachmentError)

  // Uploading state: show spinner with filename (fileId not yet set)
  if (status === "uploading") {
    return (
      <NodeViewWrapper className={wrapperClassNames.join(" ")} data-testid="attachment-uploading">
        <div className={styles.attachmentChip}>
          <Loader size={14} className={styles.attachmentSpinner} />
          <span className={styles.attachmentName} title={fileName}>
            {fileName}
          </span>
          <span className={styles.attachmentUploading}>Uploading...</span>
        </div>
      </NodeViewWrapper>
    )
  }

  // Error state (upload failed)
  if (status === "error") {
    return (
      <NodeViewWrapper className={wrapperClassNames.join(" ")} data-testid="attachment-error">
        <div className={styles.attachmentChip}>
          <AlertCircle size={14} className={styles.attachmentErrorIcon} />
          <span className={styles.attachmentName} title={fileName}>
            {fileName}
          </span>
          <span className={styles.attachmentErrorText}>Upload failed</span>
        </div>
      </NodeViewWrapper>
    )
  }

  // Large file that user hasn't chosen to show yet
  if (isLargeFile && !showLargeFileAnyway) {
    return (
      <NodeViewWrapper className={wrapperClassNames.join(" ")} data-testid="attachment-large">
        <div className={styles.attachmentChipLarge}>
          <div className={styles.attachmentChipRow}>
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
          </div>
          <span className={styles.attachmentLargeFileLabel}>
            Large file.{" "}
            <button type="button" className={styles.attachmentShowAnywayButton} onClick={handleShowAnyway}>
              Download and show.
            </button>
          </span>
        </div>
      </NodeViewWrapper>
    )
  }

  // Loading state: fetching file from server (fileId set, data loading)
  if (isLoading) {
    return (
      <NodeViewWrapper className={wrapperClassNames.join(" ")} data-testid="attachment-loading">
        <div className={styles.attachmentChip}>
          <Loader size={14} className={styles.attachmentSpinner} />
          <span className={styles.attachmentName} title={fileName}>
            {fileName}
          </span>
          <span className={styles.attachmentUploading}>Loading...</span>
        </div>
      </NodeViewWrapper>
    )
  }

  // Download error state
  if (isError) {
    return (
      <NodeViewWrapper className={wrapperClassNames.join(" ")} data-testid="attachment-error">
        <div className={styles.attachmentChip}>
          <AlertCircle size={14} className={styles.attachmentErrorIcon} />
          <span className={styles.attachmentName} title={fileName}>
            {fileName}
          </span>
          <span className={styles.attachmentErrorText}>Failed to load</span>
        </div>
      </NodeViewWrapper>
    )
  }

  // Get the URL from auto-fetch (large files are handled separately above)
  const effectiveUrl = fileData?.url

  // Still waiting for data
  if (!effectiveUrl) {
    return (
      <NodeViewWrapper className={wrapperClassNames.join(" ")} data-testid="attachment-loading">
        <div className={styles.attachmentChip}>
          <Loader size={14} className={styles.attachmentSpinner} />
          <span className={styles.attachmentName} title={fileName}>
            {fileName}
          </span>
          <span className={styles.attachmentUploading}>Loading...</span>
        </div>
      </NodeViewWrapper>
    )
  }

  // Complete state: show image preview
  if (isPreviewableImage(fileType)) {
    return (
      <NodeViewWrapper className={wrapperClassNames.join(" ")} data-testid="attachment-image">
        <img src={effectiveUrl} alt={fileName} className={styles.attachmentImage} draggable={false} />
      </NodeViewWrapper>
    )
  }

  // Complete state: show video player with native HTML5 controls
  if (isPreviewableVideo(fileType)) {
    return (
      <NodeViewWrapper className={wrapperClassNames.join(" ")} data-testid="attachment-video">
        <video src={effectiveUrl} controls className={styles.attachmentVideo} draggable={false}>
          Your browser does not support the video tag.
        </video>
      </NodeViewWrapper>
    )
  }

  // Complete state (non-image/video): show file chip with download button
  return (
    <NodeViewWrapper className={wrapperClassNames.join(" ")} data-testid="attachment-file">
      <div className={styles.attachmentChip}>
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
      </div>
    </NodeViewWrapper>
  )
}
