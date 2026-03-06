import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import * as styles from "./Popover.css"

export interface PopoverProps {
  trigger: React.ReactNode
  children: React.ReactNode
  /** Width of the popover panel */
  width?: number | string
  /** Additional class name for the panel */
  panelClassName?: string
  /** Additional class name for the container */
  className?: string
  /** Controlled open state */
  isOpen?: boolean
  /** Callback when open state changes */
  onOpenChange?: (isOpen: boolean) => void
  /** Test ID for the panel */
  panelTestId?: string
}

const Popover: React.FC<PopoverProps> = ({
  trigger,
  children,
  width = 220,
  panelClassName,
  className,
  isOpen: controlledIsOpen,
  onOpenChange,
  panelTestId,
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false)
  const isControlled = controlledIsOpen !== undefined
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen

  const setIsOpen = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      const newValue = typeof value === "function" ? value(isOpen) : value
      if (!isControlled) {
        setInternalIsOpen(newValue)
      }
      onOpenChange?.(newValue)
    },
    [isControlled, isOpen, onOpenChange]
  )

  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [floatingPosition, setFloatingPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  const updateFloatingPosition = useCallback(() => {
    const triggerEl = triggerRef.current
    const panel = panelRef.current
    if (!triggerEl || !panel) return

    const margin = 8
    const triggerRect = triggerEl.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    // Default: position above the trigger, aligned to left edge
    let desiredTop = triggerRect.top - panel.offsetHeight - margin
    let desiredLeft = triggerRect.left

    // If it doesn't fit above, position below
    if (desiredTop < margin) {
      desiredTop = triggerRect.bottom + margin
    }

    // Ensure it doesn't go off the right edge
    if (desiredLeft + panel.offsetWidth > viewportWidth - margin) {
      desiredLeft = Math.max(margin, viewportWidth - panel.offsetWidth - margin)
    }

    // Ensure it doesn't go off the left edge
    if (desiredLeft < margin) {
      desiredLeft = margin
    }

    // Ensure it doesn't go off the bottom
    if (desiredTop + panel.offsetHeight > viewportHeight - margin) {
      desiredTop = Math.max(margin, viewportHeight - panel.offsetHeight - margin)
    }

    setFloatingPosition({ top: desiredTop, left: desiredLeft })
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => {
        document.removeEventListener("mousedown", handleClickOutside)
      }
    }
  }, [isOpen, setIsOpen])

  useLayoutEffect(() => {
    if (!isOpen) return
    updateFloatingPosition()
  }, [isOpen, updateFloatingPosition])

  useEffect(() => {
    if (!isOpen) return

    const handleWindowUpdate = () => updateFloatingPosition()
    window.addEventListener("resize", handleWindowUpdate)
    window.addEventListener("scroll", handleWindowUpdate, true)
    return () => {
      window.removeEventListener("resize", handleWindowUpdate)
      window.removeEventListener("scroll", handleWindowUpdate, true)
    }
  }, [isOpen, updateFloatingPosition])

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isOpen) {
      const triggerEl = triggerRef.current
      if (triggerEl) {
        const triggerRect = triggerEl.getBoundingClientRect()
        setFloatingPosition({ top: triggerRect.top - 200, left: triggerRect.left })
      }
    }
    setIsOpen(prev => !prev)
  }

  return (
    <div ref={containerRef} className={`${styles.popoverContainer} ${className || ""}`}>
      <span
        ref={triggerRef}
        onClick={handleTriggerClick}
        style={{ display: "inline-block", lineHeight: 0, cursor: "pointer" }}
      >
        {trigger}
      </span>

      {isOpen &&
        createPortal(
          <div
            ref={panelRef}
            className={`${styles.popoverPanel} ${panelClassName || ""}`}
            style={{
              top: `${floatingPosition.top}px`,
              left: `${floatingPosition.left}px`,
              width: typeof width === "number" ? `${width}px` : width,
            }}
            data-testid={panelTestId}
          >
            {children}
          </div>,
          document.body
        )}
    </div>
  )
}

export default Popover
