import React, { useState, useRef, useEffect, ReactElement, useCallback } from "react"
import { createPortal } from "react-dom"
import * as styles from "./ContextMenu.css"

export interface RightClickMenuItem {
  label: string
  icon?: React.ReactNode
  onClick?: () => void
  destructive?: boolean
  isSectionHeader?: boolean
  isSeparator?: boolean
}

interface RightClickContextMenuProps {
  items: RightClickMenuItem[]
  children: ReactElement
  onContextMenu?: (e: React.MouseEvent) => void
  className?: string
}

export const RightClickContextMenu: React.FC<RightClickContextMenuProps> = ({
  items,
  children,
  onContextMenu,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const menuRef = useRef<HTMLDivElement>(null)
  const childRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") setIsOpen(false)
      }
      document.addEventListener("keydown", handleKeyDown)
      return () => {
        document.removeEventListener("mousedown", handleClickOutside)
        document.removeEventListener("keydown", handleKeyDown)
      }
    }
  }, [isOpen])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (onContextMenu) {
      onContextMenu(e)
    }

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const menuWidth = 200
    const menuHeight = items.length * 40

    let x = e.clientX
    let y = e.clientY

    if (x + menuWidth > viewportWidth) {
      x = viewportWidth - menuWidth - 10
    }

    if (y + menuHeight > viewportHeight) {
      y = viewportHeight - menuHeight - 10
    }

    setPosition({ x, y })
    setIsOpen(true)
  }

  const handleItemClick = (e: React.MouseEvent, item: RightClickMenuItem) => {
    e.stopPropagation()
    if (item.isSectionHeader) return
    item.onClick?.()
    setIsOpen(false)
  }

  // Merge child's own handlers/class without adding extra DOM wrappers
  const onlyChild = React.Children.only(children) as ReactElement<{
    onContextMenu?: (e: React.MouseEvent) => void
    className?: string
    ref?: React.Ref<HTMLElement>
  }>

  // Preserve any ref provided by the caller while also keeping a handle to the host element for stacking tweaks.
  const assignChildRef = useCallback(
    (node: HTMLElement | null) => {
      childRef.current = node
      const elementWithRef = onlyChild as unknown as { ref?: React.Ref<HTMLElement> }
      const originalRef = elementWithRef.ref
      if (!originalRef) return
      if (typeof originalRef === "function") {
        originalRef(node)
      } else if (typeof originalRef === "object") {
        ;(originalRef as React.MutableRefObject<HTMLElement | null>).current = node
      }
    },
    [onlyChild]
  )

  const mergedOnContextMenu = (e: React.MouseEvent) => {
    // Let child's handler run first; if it prevents default, don't open our menu
    onlyChild.props.onContextMenu?.(e)
    if (e.defaultPrevented) return
    handleContextMenu(e)
  }

  const mergedClassName = [onlyChild.props.className, className].filter(Boolean).join(" ")

  useEffect(() => {
    // Track how many menus are open for this row so we can safely remove the lift attribute
    // even if multiple entry points (right-click and the inline trigger) are open at once.
    const host = childRef.current
    if (!host || !isOpen) return

    const currentCount = Number(host.dataset.contextMenuStack ?? "0")
    host.dataset.contextMenuStack = String(currentCount + 1)
    host.dataset.contextMenuOpen = "true"

    return () => {
      const latestCount = Number(host.dataset.contextMenuStack ?? "1") - 1
      if (latestCount <= 0) {
        delete host.dataset.contextMenuStack
        host.removeAttribute("data-context-menu-open")
      } else {
        host.dataset.contextMenuStack = String(latestCount)
      }
    }
  }, [isOpen])

  return (
    <>
      {React.cloneElement(onlyChild, {
        onContextMenu: mergedOnContextMenu,
        className: mergedClassName,
        ref: assignChildRef,
      })}

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            className={styles.contextMenuFloating}
            style={{ left: `${position.x}px`, top: `${position.y}px` }}
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
                >
                  {item.icon && <span className={styles.contextMenuItemIcon}>{item.icon}</span>}
                  <span>{item.label}</span>
                </button>
              )
            )}
          </div>,
          document.body
        )}
    </>
  )
}

export default RightClickContextMenu
