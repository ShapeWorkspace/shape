import { useCallback, useEffect, useRef, useState } from "react"
import type { Editor, NodeViewProps } from "@tiptap/react"
import { NodeViewWrapper, NodeViewContent } from "@tiptap/react"
import { NodeSelection } from "@tiptap/pm/state"

import { isValidPosition } from "@/lib/tiptap-utils"
import { useEngineForFileDownload } from "@/store/queries/use-files"

import "./image-node-view.scss"

export interface ResizeParams {
  handleUsed: "left" | "right"
  initialWidth: number
  initialClientX: number
}

export interface ResizableImageProps extends React.HTMLAttributes<HTMLDivElement> {
  src: string | null
  alt?: string
  editor?: Editor
  minWidth?: number
  maxWidth?: number
  align?: "left" | "center" | "right"
  initialWidth?: number
  showCaption?: boolean
  hasContent?: boolean
  onImageResize?: (width?: number) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUpdateAttributes?: (attrs: Record<string, any>) => void
  getPos: () => number | undefined
  nodeSize?: number
  // File ID for encrypted images - used to fetch the actual image data
  fileId?: string | null
}

export function ImageNodeView(props: NodeViewProps) {
  const { editor, node, updateAttributes, getPos } = props
  const hasContent = node.content.size > 0

  return (
    <ResizableImage
      src={node.attrs.src}
      alt={node.attrs.alt || ""}
      editor={editor}
      align={node.attrs["data-align"]}
      initialWidth={node.attrs.width}
      showCaption={node.attrs.showCaption}
      hasContent={hasContent}
      nodeSize={node.nodeSize}
      onImageResize={width => updateAttributes({ width })}
      onUpdateAttributes={updateAttributes}
      getPos={getPos}
      fileId={node.attrs.fileId}
    />
  )
}

export const ResizableImage: React.FC<ResizableImageProps> = ({
  src,
  alt = "",
  editor,
  minWidth = 96,
  maxWidth = 800,
  align = "left",
  initialWidth,
  showCaption = false,
  hasContent = false,
  nodeSize,
  onImageResize,
  onUpdateAttributes,
  getPos,
  fileId,
}) => {
  const [resizeParams, setResizeParams] = useState<ResizeParams | undefined>()
  const [width, setWidth] = useState<number | undefined>(initialWidth)
  const [showHandles, setShowHandles] = useState(false)
  const isResizingRef = useRef(false)
  const isMountedRef = useRef(true)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const leftResizeHandleRef = useRef<HTMLDivElement>(null)
  const rightResizeHandleRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  // Sync width state with initialWidth prop when it changes (e.g., from Yjs sync)
  // Only update if we're not currently resizing to avoid conflicts
  useEffect(() => {
    if (!isResizingRef.current && initialWidth !== width) {
      setWidth(initialWidth)
    }
  }, [initialWidth, width])

  // For encrypted images: load the image by fileId when src is not available
  const downloadFile = useEngineForFileDownload()
  const [loadedBlobUrl, setLoadedBlobUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)

  // Check if src is a valid non-blob URL (blob URLs from other sessions are invalid)
  // Blob URLs are session-specific and should not be synced via Yjs
  const isValidSrc = src && !src.startsWith("blob:")

  // Determine the actual image source to display
  // Priority: 1) valid non-blob src, 2) loaded blob URL from fileId, 3) null (show loading/error)
  const effectiveSrc = isValidSrc ? src : loadedBlobUrl

  // Load image by fileId when we don't have a valid src.
  // Guards prevent re-fetching when: already have a valid src, no fileId,
  // already loaded, currently loading, or previously failed (no retry on error).
  useEffect(() => {
    // Skip if we have a valid (non-blob) src or no fileId
    if (isValidSrc || !fileId) return
    // Skip if already loaded, loading, or failed (don't retry on error to prevent infinite loops)
    if (loadedBlobUrl || isLoading || loadError) return

    const loadImage = async () => {
      setIsLoading(true)
      try {
        const blobUrl = await downloadFile(fileId)
        if (isMountedRef.current) {
          if (blobUrl) {
            setLoadedBlobUrl(blobUrl)
          } else {
            setLoadError(true)
          }
        }
      } catch (error) {
        console.error("Failed to load image:", error)
        if (isMountedRef.current) {
          setLoadError(true)
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false)
        }
      }
    }

    void loadImage()
  }, [isValidSrc, fileId, loadedBlobUrl, isLoading, loadError, downloadFile])

  // Listen to editor selection changes to detect when focus leaves the caption
  useEffect(() => {
    if (!editor || !showCaption) return

    const handleSelectionUpdate = () => {
      const pos = getPos()
      if (!isValidPosition(pos) || !nodeSize) return

      const { from, to } = editor.state.selection
      const nodeStart = pos
      const nodeEnd = pos + nodeSize

      // Check if selection is outside this image node
      const isOutsideNode = to < nodeStart || from > nodeEnd

      if (isOutsideNode && !hasContent && onUpdateAttributes) {
        onUpdateAttributes({ showCaption: false })
      }
    }

    editor.on("selectionUpdate", handleSelectionUpdate)
    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate)
    }
  }, [editor, showCaption, hasContent, getPos, nodeSize, onUpdateAttributes])

  // Had to manually set the node selection on image click because
  // We treat the image-node-extension.ts as content: "inline*"
  const handleImageClick = useCallback(
    (event: React.MouseEvent) => {
      if (!editor || !getPos || resizeParams) return

      event.preventDefault()
      event.stopPropagation()

      const pos = getPos()
      if (isValidPosition(pos)) {
        editor.chain().focus().setNodeSelection(pos).run()
      }
    },
    [editor, getPos, resizeParams]
  )

  const windowMouseMoveHandler = useCallback(
    (event: MouseEvent | TouchEvent): void => {
      if (!resizeParams || !editor || !isMountedRef.current) return

      const clientX = "touches" in event ? (event.touches[0]?.clientX ?? 0) : event.clientX
      const isLeftHandle = resizeParams.handleUsed === "left"
      const multiplier = align === "center" ? 2 : 1

      const delta = isLeftHandle
        ? (resizeParams.initialClientX - clientX) * multiplier
        : (clientX - resizeParams.initialClientX) * multiplier

      const newWidth = resizeParams.initialWidth + delta
      const effectiveMaxWidth = editor.view.dom?.firstElementChild?.clientWidth || maxWidth
      const clampedWidth = Math.min(Math.max(newWidth, minWidth), effectiveMaxWidth)

      setWidth(clampedWidth)
      if (wrapperRef.current) {
        wrapperRef.current.style.width = `${clampedWidth}px`
      }
    },
    [editor, align, maxWidth, minWidth, resizeParams]
  )

  const windowMouseUpHandler = useCallback(
    (event: MouseEvent | TouchEvent): void => {
      if (!editor || !isMountedRef.current) return

      const target =
        "touches" in event
          ? document.elementFromPoint(
              event.changedTouches[0]?.clientX ?? 0,
              event.changedTouches[0]?.clientY ?? 0
            )
          : event.target

      const isInsideWrapper = target && wrapperRef.current?.contains(target as Node)

      if ((!isInsideWrapper || !editor.isEditable) && showHandles && isMountedRef.current) {
        setShowHandles(false)
      }

      if (!resizeParams) return

      const wasNodeSelection =
        editor.state.selection instanceof NodeSelection && editor.state.selection.node.type.name === "image"

      if (isMountedRef.current) {
        setResizeParams(undefined)
      }
      onImageResize?.(width)

      // Restore the node selection after resizing
      // This because we treat the image-node-extension.ts as content: "inline*"
      const pos = getPos()

      // Had to use isResizingRef flag because during resizing,
      // the selection gets lost and cannot be detected here
      // Its because image-node-extension.ts contain content: "inline*"
      if (isValidPosition(pos) && wasNodeSelection && isMountedRef.current) {
        editor.chain().focus().setNodeSelection(pos).run()
      }

      isResizingRef.current = false
    },
    [editor, getPos, onImageResize, resizeParams, showHandles, width]
  )

  const startResize = useCallback(
    (handleUsed: "left" | "right", clientX: number) => {
      setResizeParams({
        handleUsed,
        initialWidth: wrapperRef.current?.clientWidth ?? minWidth,
        initialClientX: clientX,
      })
      isResizingRef.current = true
    },
    [minWidth]
  )

  const leftResizeHandleMouseDownHandler = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    startResize("left", event.clientX)
  }

  const leftResizeHandleTouchStartHandler = (event: React.TouchEvent<HTMLDivElement>) => {
    event.preventDefault()
    const touch = event.touches[0]
    if (touch) startResize("left", touch.clientX)
  }

  const rightResizeHandleMouseDownHandler = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    startResize("right", event.clientX)
  }

  const rightResizeHandleTouchStartHandler = (event: React.TouchEvent<HTMLDivElement>) => {
    event.preventDefault()
    const touch = event.touches[0]
    if (touch) startResize("right", touch.clientX)
  }

  const wrapperMouseEnterHandler = () => {
    if (editor?.isEditable && isMountedRef.current) setShowHandles(true)
  }

  const wrapperMouseLeaveHandler = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isMountedRef.current) return

    if (
      event.relatedTarget === leftResizeHandleRef.current ||
      event.relatedTarget === rightResizeHandleRef.current ||
      resizeParams
    )
      return

    if (editor?.isEditable) setShowHandles(false)
  }

  const wrapperTouchStartHandler = () => {
    if (editor?.isEditable && isMountedRef.current) setShowHandles(true)
  }

  useEffect(() => {
    window.addEventListener("mousemove", windowMouseMoveHandler)
    window.addEventListener("mouseup", windowMouseUpHandler)
    window.addEventListener("touchmove", windowMouseMoveHandler, {
      passive: false,
    })
    window.addEventListener("touchend", windowMouseUpHandler)

    return () => {
      window.removeEventListener("mousemove", windowMouseMoveHandler)
      window.removeEventListener("mouseup", windowMouseUpHandler)
      window.removeEventListener("touchmove", windowMouseMoveHandler)
      window.removeEventListener("touchend", windowMouseUpHandler)
    }
  }, [windowMouseMoveHandler, windowMouseUpHandler])

  // Track mounted state - must set true on mount for React 18 Strict Mode
  // where effects run twice (mount -> unmount -> mount)
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const shouldShowCaption = showCaption || hasContent

  return (
    <NodeViewWrapper data-align={align} data-width={width} className="tiptap-image">
      <div
        ref={wrapperRef}
        className="tiptap-image-container"
        style={{ width: width ? `${width}px` : "fit-content" }}
        onMouseEnter={wrapperMouseEnterHandler}
        onMouseLeave={wrapperMouseLeaveHandler}
        onTouchStart={wrapperTouchStartHandler}
      >
        <div className="tiptap-image-content">
          {/* Show loading placeholder while fetching encrypted image */}
          {isLoading && (
            <div className="tiptap-image-loading">
              <div className="tiptap-image-loading-spinner" />
            </div>
          )}

          {/* Show error state if image failed to load */}
          {loadError && !effectiveSrc && <div className="tiptap-image-error">Failed to load image</div>}

          {/* Show the actual image when available */}
          {effectiveSrc && (
            <img
              ref={imageRef}
              src={effectiveSrc}
              alt={alt}
              className="tiptap-image-img"
              contentEditable={false}
              draggable={false}
              onClick={handleImageClick}
              style={{ cursor: editor?.isEditable ? "pointer" : "default" }}
            />
          )}

          {showHandles && editor?.isEditable && effectiveSrc && (
            <>
              <div
                ref={leftResizeHandleRef}
                className="tiptap-image-handle tiptap-image-handle-left"
                onMouseDown={leftResizeHandleMouseDownHandler}
                onTouchStart={leftResizeHandleTouchStartHandler}
              />
              <div
                ref={rightResizeHandleRef}
                className="tiptap-image-handle tiptap-image-handle-right"
                onMouseDown={rightResizeHandleMouseDownHandler}
                onTouchStart={rightResizeHandleTouchStartHandler}
              />
            </>
          )}
        </div>

        {editor?.isEditable && shouldShowCaption && (
          <NodeViewContent as="div" className="tiptap-image-caption" data-placeholder="Add a caption..." />
        )}
      </div>
    </NodeViewWrapper>
  )
}
