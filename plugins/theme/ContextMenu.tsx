import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react"
import { createPortal } from "react-dom"
import { MoreHorizontal } from "lucide-react"
import * as styles from "./ContextMenu.css"

export interface ContextMenuItem {
  label: string
  icon?: React.ReactNode
  rightIcon?: React.ReactNode
  onClick?: () => void
  destructive?: boolean
  isSectionHeader?: boolean
  isSeparator?: boolean
  testId?: string
}

interface ContextMenuProps {
  items: ContextMenuItem[]
  trigger?: React.ReactNode
  className?: string
  /** Accessible label for the trigger button. Defaults to "Open activity menu" */
  ariaLabel?: string
  /**
   * Deterministic test id for the trigger button. Defaults to "context-menu-trigger" so end-to-end tests can
   * reliably open menus without relying on translated text or icon structure.
   */
  triggerTestId?: string
  /**
   * When true, the trigger button is rendered with the `contextMenuVisible` style
   * making it fully visible even when not hovered. This is useful for contexts
   * (e.g. detail views) where hovering over the tiny trigger is difficult or
   * where the surrounding container does not apply its own hover styles.
   */
  alwaysVisible?: boolean
  /**
   * Controlled open state. When provided, the menu's open state is controlled externally.
   * Use with `onOpenChange` to fully control the menu's visibility.
   */
  isOpen?: boolean
  /**
   * Callback when the menu's open state changes. Use with `isOpen` for controlled mode.
   */
  onOpenChange?: (isOpen: boolean) => void
  /**
   * External position for the menu. When provided, the menu will be positioned at these coordinates
   * instead of relative to the trigger button. Useful for programmatically opening the menu.
   */
  externalPosition?: { top: number; left: number } | null
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  items,
  trigger,
  className,
  ariaLabel = "Open activity menu",
  triggerTestId = "context-menu-trigger",
  alwaysVisible = false,
  isOpen: controlledIsOpen,
  onOpenChange,
  externalPosition,
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
  const menuRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [floatingPosition, setFloatingPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  // Keep the dropdown portalled to <body> so column scroll containers never clip the menu.
  const updateFloatingPosition = useCallback(() => {
    if (externalPosition) {
      setFloatingPosition(externalPosition)
      return
    }

    const trigger = triggerRef.current
    const menu = menuRef.current
    if (!trigger || !menu) {
      return
    }

    const margin = 8
    const triggerRect = trigger.getBoundingClientRect()
    let desiredTop = triggerRect.bottom + margin
    let desiredLeft = triggerRect.right - menu.offsetWidth

    if (desiredLeft < margin) {
      desiredLeft = margin
    }

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    if (desiredLeft + menu.offsetWidth > viewportWidth - margin) {
      desiredLeft = Math.max(margin, viewportWidth - menu.offsetWidth - margin)
    }

    if (desiredTop + menu.offsetHeight > viewportHeight - margin) {
      const alternateTop = triggerRect.top - menu.offsetHeight - margin
      desiredTop =
        alternateTop >= margin ? alternateTop : Math.max(margin, viewportHeight - menu.offsetHeight - margin)
    }

    setFloatingPosition({ top: desiredTop, left: desiredLeft })
  }, [externalPosition])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
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

  useEffect(() => {
    // Lift the entire activity row above neighboring stacking contexts while a menu is visible.
    // Resolved rows apply opacity, which creates a new stacking context; without this lift the dropdown
    // can render underneath the compose panel and other UI chrome.
    const container = containerRef.current
    if (!container || !isOpen) return

    const activityRow = container.closest<HTMLElement>("[data-activity-item]")
    if (!activityRow) return

    const currentOpenCount = Number(activityRow.dataset.contextMenuStack ?? "0")
    activityRow.dataset.contextMenuStack = String(currentOpenCount + 1)
    activityRow.dataset.contextMenuOpen = "true"

    return () => {
      const latestCount = Number(activityRow.dataset.contextMenuStack ?? "1") - 1
      if (latestCount <= 0) {
        delete activityRow.dataset.contextMenuStack
        activityRow.removeAttribute("data-context-menu-open")
      } else {
        activityRow.dataset.contextMenuStack = String(latestCount)
      }
    }
  }, [isOpen])

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isOpen) {
      // Seed the initial position before the menu renders so we avoid a frame where it flashes at 0,0.
      const trigger = triggerRef.current
      if (trigger) {
        const triggerRect = trigger.getBoundingClientRect()
        setFloatingPosition({ top: triggerRect.bottom + 8, left: triggerRect.left })
      }
    }
    setIsOpen(prev => !prev)
  }

  const handleItemClick = (e: React.MouseEvent, item: ContextMenuItem) => {
    e.stopPropagation()
    if (item.isSectionHeader) return
    item.onClick?.()
    setIsOpen(false)
  }

  // Choose the correct trigger class based on state / props
  const triggerClass = isOpen || alwaysVisible ? styles.contextMenuVisible : styles.contextMenuTrigger

  useLayoutEffect(() => {
    if (!isOpen) {
      return
    }
    updateFloatingPosition()
  }, [isOpen, updateFloatingPosition, items.length, externalPosition])

  useEffect(() => {
    if (!isOpen) {
      return
    }
    // When the viewport moves (resizes or scrolls), re-anchor the floating menu so it continues targeting the trigger.
    const handleWindowUpdate = () => updateFloatingPosition()
    window.addEventListener("resize", handleWindowUpdate)
    window.addEventListener("scroll", handleWindowUpdate, true)
    return () => {
      window.removeEventListener("resize", handleWindowUpdate)
      window.removeEventListener("scroll", handleWindowUpdate, true)
    }
  }, [isOpen, updateFloatingPosition])

  return (
    <div ref={containerRef} className={`${styles.contextMenuContainer} ${className || ""}`}>
      <button
        ref={triggerRef}
        className={triggerClass}
        onClick={handleTriggerClick}
        aria-label={ariaLabel}
        data-testid={triggerTestId}
      >
        {trigger || <MoreHorizontal size={16} />}
      </button>

      {isOpen &&
        // Render inside a fixed-position portal so dropdowns can escape scroll containers.
        createPortal(
          <div
            ref={menuRef}
            className={styles.contextMenuFloating}
            style={{ top: `${floatingPosition.top}px`, left: `${floatingPosition.left}px` }}
          >
            {items.map((item, index) =>
              item.isSeparator ? (
                <div key={index} className={styles.contextMenuSeparator} aria-hidden />
              ) : item.isSectionHeader ? (
                <div key={index} className={styles.contextMenuSectionHeader} aria-hidden>
                  {item.label}
                </div>
              ) : (
                <button
                  key={index}
                  className={item.destructive ? styles.contextMenuItemDestructive : styles.contextMenuItem}
                  onClick={e => handleItemClick(e, item)}
                  data-testid={item.testId}
                >
                  {item.icon && <span className={styles.contextMenuItemIcon}>{item.icon}</span>}
                  <span>{item.label}</span>
                  {item.rightIcon && (
                    <span className={styles.contextMenuItemRightIcon}>{item.rightIcon}</span>
                  )}
                </button>
              )
            )}
          </div>,
          document.body
        )}
    </div>
  )
}

export default ContextMenu
