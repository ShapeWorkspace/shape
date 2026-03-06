import React, { useState, useRef, useEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import * as styles from "./Tooltip.css"

interface TooltipProps {
  /**
   * The text content or React node to display in the tooltip
   */
  content: React.ReactNode
  /**
   * The element that triggers the tooltip on hover
   */
  children: React.ReactElement
  /**
   * Delay in milliseconds before showing the tooltip. Defaults to 0 for instant display.
   */
  delay?: number
  /**
   * Preferred placement of the tooltip relative to the trigger element
   */
  placement?: "top" | "right" | "bottom" | "left"
  /**
   * Whether to allow multi-line content. When true, removes nowrap constraint.
   */
  multiline?: boolean
}

/**
 * A custom tooltip component that appears instantly (or with configurable delay) on hover.
 * The tooltip is rendered using a portal to ensure it appears above other content.
 * Dismisses when clicking anywhere or when focus is lost.
 *
 * Usage:
 * ```tsx
 * <Tooltip content="Click to open inbox">
 *   <button>Inbox</button>
 * </Tooltip>
 * ```
 */
interface TooltipPositionStyle {
  top: number
  left: number
  transform: string
}

const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  delay = 0,
  placement = "right",
  multiline = false,
}) => {
  const [isVisible, setIsVisible] = useState(false)
  const [position, setPosition] = useState<TooltipPositionStyle>({
    top: 0,
    left: 0,
    transform: "",
  })
  const triggerRef = useRef<HTMLElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<number | null>(null)
  const hideTimeoutRef = useRef<number | null>(null)
  const isOverTriggerRef = useRef(false)
  const isOverTooltipRef = useRef(false)

  // Calculate tooltip position based on trigger element and placement
  const calculatePosition = useCallback(() => {
    if (!triggerRef.current) return

    // Prefer the first rendered child if we're wrapping a DOM node in the helper span.
    const targetElement =
      triggerRef.current.firstElementChild instanceof HTMLElement
        ? (triggerRef.current.firstElementChild as HTMLElement)
        : triggerRef.current

    const rect = targetElement.getBoundingClientRect()
    const offset = 8 // Consistent gap between trigger and tooltip

    // We address centering via CSS transforms so we only need the trigger's box metrics.
    let top = rect.top
    let left = rect.left
    let transform = ""

    switch (placement) {
      case "top":
        // Anchor at the target's horizontal midpoint and translate upward.
        top = rect.top - offset
        left = rect.left + rect.width / 2
        transform = "translate(-50%, -100%)"
        break
      case "bottom":
        // Anchor at the midpoint and fall through the bottom edge.
        top = rect.bottom + offset
        left = rect.left + rect.width / 2
        transform = "translate(-50%, 0)"
        break
      case "left":
        // Anchor at the vertical midpoint and shift the tooltip fully to the left.
        top = rect.top + rect.height / 2
        left = rect.left - offset
        transform = "translate(-100%, -50%)"
        break
      case "right":
      default:
        // Anchor at the vertical midpoint and shift slightly to the right.
        top = rect.top + rect.height / 2
        left = rect.right + offset
        transform = "translate(0, -50%)"
        break
    }

    setPosition({ top, left, transform })
  }, [placement])

  const scheduleHide = useCallback(() => {
    // Clear any existing hide timeout
    if (hideTimeoutRef.current !== null) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }

    // Small delay to allow mouse to move between trigger and tooltip
    hideTimeoutRef.current = window.setTimeout(() => {
      if (!isOverTriggerRef.current && !isOverTooltipRef.current) {
        setIsVisible(false)
      }
    }, 100)
  }, [])

  const handleTriggerMouseEnter = useCallback(() => {
    isOverTriggerRef.current = true

    // Clear any pending hide
    if (hideTimeoutRef.current !== null) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }

    // Clear any pending show
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = window.setTimeout(() => {
      calculatePosition()
      setIsVisible(true)
    }, delay)
  }, [delay, calculatePosition])

  const handleTriggerMouseLeave = useCallback(() => {
    isOverTriggerRef.current = false

    // Clear any pending show
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    // Schedule hide if not over tooltip
    scheduleHide()
  }, [scheduleHide])

  const handleTooltipMouseEnter = useCallback(() => {
    isOverTooltipRef.current = true

    // Clear any pending hide
    if (hideTimeoutRef.current !== null) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
  }, [])

  const handleTooltipMouseLeave = useCallback(() => {
    isOverTooltipRef.current = false
    scheduleHide()
  }, [scheduleHide])

  const handleDismiss = useCallback(() => {
    // Immediately hide tooltip on click or blur
    isOverTriggerRef.current = false
    isOverTooltipRef.current = false

    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (hideTimeoutRef.current !== null) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }

    setIsVisible(false)
  }, [])

  // Recalculate position after tooltip is rendered to account for its actual width
  useEffect(() => {
    if (isVisible && tooltipRef.current) {
      // Use requestAnimationFrame to ensure the tooltip is rendered and measured
      requestAnimationFrame(() => {
        calculatePosition()
      })
    }
  }, [isVisible, calculatePosition])

  // Update position when window is resized or scrolled
  useEffect(() => {
    if (!isVisible) return

    const handleUpdate = () => {
      calculatePosition()
    }

    window.addEventListener("resize", handleUpdate)
    window.addEventListener("scroll", handleUpdate, true)

    return () => {
      window.removeEventListener("resize", handleUpdate)
      window.removeEventListener("scroll", handleUpdate, true)
    }
  }, [isVisible, calculatePosition])

  // Dismiss tooltip on any click in the document
  useEffect(() => {
    if (!isVisible) return

    const handleDocumentClick = () => {
      handleDismiss()
    }

    // Add a small delay to let the current click event finish processing
    const timeoutId = window.setTimeout(() => {
      document.addEventListener("click", handleDocumentClick, { capture: true })
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener("click", handleDocumentClick, { capture: true })
    }
  }, [isVisible, handleDismiss])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current)
      }
      if (hideTimeoutRef.current !== null) {
        clearTimeout(hideTimeoutRef.current)
      }
    }
  }, [])

  return (
    <>
      <span
        ref={triggerRef as React.RefObject<HTMLSpanElement>}
        onMouseEnter={handleTriggerMouseEnter}
        onMouseLeave={handleTriggerMouseLeave}
        style={{ display: "inline-block", lineHeight: 0 }}
      >
        {children}
      </span>
      {isVisible &&
        createPortal(
          <div
            ref={tooltipRef}
            className={styles.tooltip}
            data-placement={placement}
            data-multiline={multiline}
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
              transform: position.transform,
            }}
            role="tooltip"
            onMouseEnter={handleTooltipMouseEnter}
            onMouseLeave={handleTooltipMouseLeave}
          >
            {content}
          </div>,
          document.body
        )}
    </>
  )
}

export default Tooltip
