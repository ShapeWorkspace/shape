/**
 * ImageInline renders images inline within content.
 *
 * Used by TipTapRenderer to display image nodes from TipTap-generated HTML.
 * Handles encrypted images (fetched via fileId) and regular images (via src).
 *
 * Download URLs are fetched dynamically since presigned URLs expire.
 */

import React from "react"
import { Loader, AlertCircle, ImageIcon } from "lucide-react"
import * as styles from "../styles/tiptap-renderer.css"
import { useDownloadFile } from "../store/queries/use-files"

/**
 * Props for the ImageInline component.
 */
export interface ImageInlineProps {
  /** File ID for encrypted images (fetched via file service) */
  fileId?: string | null
  /** Direct src URL for non-encrypted images */
  src?: string | null
  /** Alt text for the image */
  alt?: string | null
  /** Width of the image (from data-width attribute) */
  width?: number | null
  /** Alignment of the image */
  align?: "left" | "center" | "right" | null
}

/**
 * ImageInline renders an image, handling both encrypted (fileId) and
 * non-encrypted (src) images.
 */
export function ImageInline({ fileId, src, alt, width, align }: ImageInlineProps) {
  // Only fetch if we have a fileId (encrypted image)
  const { data: fileData, isLoading, isError } = useDownloadFile(fileId ?? "", !!fileId)

  // Determine effective URL - prefer fetched data for encrypted images
  const effectiveUrl = fileId ? fileData?.url : src

  // Build inline styles for width and alignment
  const containerStyle: React.CSSProperties = {}
  if (align) {
    containerStyle.textAlign = align
    containerStyle.display = "block"
  }

  const imageStyle: React.CSSProperties = {}
  if (width) {
    imageStyle.width = width
    imageStyle.maxWidth = "100%"
  }

  // Loading state for encrypted images
  if (fileId && isLoading) {
    return (
      <span className={styles.imageContainer} style={containerStyle}>
        <span className={styles.imagePlaceholder}>
          <Loader size={20} className={styles.imageSpinner} />
        </span>
      </span>
    )
  }

  // Error state
  if (fileId && isError) {
    return (
      <span className={styles.imageContainer} style={containerStyle}>
        <span className={styles.imagePlaceholder}>
          <AlertCircle size={20} className={styles.imageError} />
          <span>Failed to load image</span>
        </span>
      </span>
    )
  }

  // No URL available (encrypted image still loading or no src)
  if (!effectiveUrl) {
    return (
      <span className={styles.imageContainer} style={containerStyle}>
        <span className={styles.imagePlaceholder}>
          <ImageIcon size={20} />
        </span>
      </span>
    )
  }

  // Render the image
  return (
    <span className={styles.imageContainer} style={containerStyle}>
      <img
        src={effectiveUrl}
        alt={alt || ""}
        className={styles.image}
        style={imageStyle}
        draggable={false}
        loading="lazy"
      />
    </span>
  )
}
