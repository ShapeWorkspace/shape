import { useState, useEffect, useCallback, useRef } from "react"

/**
 * Options for the global file drop hook.
 */
interface GlobalFileDropOptions {
  // Whether the global file drop is enabled (defaults to true)
  enabled?: boolean
}

/**
 * Result returned by the global file drop hook.
 */
interface GlobalFileDropResult {
  // Whether files are currently being dragged over the window
  isDragging: boolean
  // Files that were just dropped (cleared after being consumed)
  droppedFiles: File[]
  // Clear the dropped files after processing
  clearDroppedFiles: () => void
}

/**
 * Hook for handling global file drops anywhere in the window.
 *
 * Listens for drag/drop events on the window and provides state for:
 * - isDragging: visual feedback while files are being dragged over
 * - droppedFiles: the files that were dropped
 *
 * When enabled is false, no drag/drop events are captured and existing
 * isDragging state is reset. This allows tools to handle their own file
 * drops without interference from the global handler.
 *
 * Usage:
 * const { isDragging, droppedFiles, clearDroppedFiles } = useGlobalFileDrop({ enabled: true })
 */
export function useGlobalFileDrop(options: GlobalFileDropOptions = {}): GlobalFileDropResult {
  const { enabled = true } = options
  const [isDragging, setIsDragging] = useState(false)
  const [droppedFiles, setDroppedFiles] = useState<File[]>([])

  // Track drag enter/leave count to handle nested elements
  // Using ref instead of state to avoid rerender on each drag event
  const dragCounterRef = useRef(0)

  const clearDroppedFiles = useCallback(() => {
    setDroppedFiles(previous => (previous.length === 0 ? previous : []))
  }, [])

  // Reset drag state when disabled
  useEffect(() => {
    if (!enabled) {
      setIsDragging(false)
      dragCounterRef.current = 0
    }
  }, [enabled])

  useEffect(() => {
    // Don't attach listeners when disabled
    if (!enabled) {
      return
    }

    // Prevent default to allow drop
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }

    // Track when files enter the window
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // Only track if files are being dragged (not text, etc.)
      if (e.dataTransfer?.types.includes("Files")) {
        dragCounterRef.current += 1
        if (dragCounterRef.current === 1) {
          setIsDragging(true)
        }
      }
    }

    // Track when files leave the window
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
      if (dragCounterRef.current === 0) {
        setIsDragging(false)
      }
    }

    // Handle the actual drop
    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      setIsDragging(false)
      dragCounterRef.current = 0

      // Extract files from the drop
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files)
        setDroppedFiles(files)
      }
    }

    // Add listeners to window
    window.addEventListener("dragover", handleDragOver)
    window.addEventListener("dragenter", handleDragEnter)
    window.addEventListener("dragleave", handleDragLeave)
    window.addEventListener("drop", handleDrop)

    return () => {
      window.removeEventListener("dragover", handleDragOver)
      window.removeEventListener("dragenter", handleDragEnter)
      window.removeEventListener("dragleave", handleDragLeave)
      window.removeEventListener("drop", handleDrop)
    }
  }, [enabled])

  return {
    isDragging,
    droppedFiles,
    clearDroppedFiles,
  }
}
