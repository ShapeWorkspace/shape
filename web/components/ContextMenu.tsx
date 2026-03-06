import React, { useState, useEffect, useRef } from "react"
import { ChevronRight } from "lucide-react"
import * as styles from "../styles/context-menu.css"

export interface ContextMenuItem {
  id: string
  label: string
  icon?: React.ReactNode
  action?: () => void
  children?: ContextMenuItem[]
}

interface ContextMenuProps {
  isOpen: boolean
  onClose: () => void
  items: ContextMenuItem[]
  position?: { x: number; y: number }
}

export function ContextMenu({ isOpen, onClose, items, position }: ContextMenuProps) {
  const [menuStack, setMenuStack] = useState<{ items: ContextMenuItem[]; selectedIndex: number }[]>([
    { items, selectedIndex: 0 },
  ])
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen) {
      setMenuStack([{ items, selectedIndex: 0 }])
      containerRef.current?.focus()
    }
  }, [isOpen, items])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const currentLevel = menuStack[menuStack.length - 1]
  const currentItems = currentLevel.items
  const selectedIndex = currentLevel.selectedIndex

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setMenuStack(stack => {
          const newStack = [...stack]
          newStack[newStack.length - 1] = {
            ...currentLevel,
            selectedIndex: Math.min(selectedIndex + 1, currentItems.length - 1),
          }
          return newStack
        })
        break

      case "ArrowUp":
        e.preventDefault()
        setMenuStack(stack => {
          const newStack = [...stack]
          newStack[newStack.length - 1] = {
            ...currentLevel,
            selectedIndex: Math.max(selectedIndex - 1, 0),
          }
          return newStack
        })
        break

      case "Enter":
      case "ArrowRight": {
        e.preventDefault()
        const selectedItem = currentItems[selectedIndex]
        if (selectedItem) {
          if (selectedItem.children && selectedItem.children.length > 0) {
            setMenuStack(stack => [...stack, { items: selectedItem.children!, selectedIndex: 0 }])
          } else if (selectedItem.action) {
            selectedItem.action()
            onClose()
          }
        }
        break
      }

      case "Backspace":
      case "ArrowLeft":
        e.preventDefault()
        if (menuStack.length > 1) {
          setMenuStack(stack => stack.slice(0, -1))
        } else {
          onClose()
        }
        break

      case "Escape":
        e.preventDefault()
        onClose()
        break
    }
  }

  const handleItemClick = (item: ContextMenuItem, index: number) => {
    setMenuStack(stack => {
      const newStack = [...stack]
      newStack[newStack.length - 1] = { ...currentLevel, selectedIndex: index }
      return newStack
    })

    if (item.children && item.children.length > 0) {
      setMenuStack(stack => [...stack, { items: item.children!, selectedIndex: 0 }])
    } else if (item.action) {
      item.action()
      onClose()
    }
  }

  const getBreadcrumb = () => {
    if (menuStack.length <= 1) return null
    const labels = menuStack.slice(0, -1).map((_, idx) => {
      const prevLevel = menuStack[idx]
      return prevLevel.items[prevLevel.selectedIndex]?.label || ""
    })
    return labels.join(" > ")
  }

  const breadcrumb = getBreadcrumb()

  return (
    <div
      className={styles.contextMenuOverlay}
      style={position ? { position: "fixed", top: position.y, left: position.x } : undefined}
    >
      <div className={styles.contextMenu} ref={containerRef} tabIndex={0} onKeyDown={handleKeyDown}>
        {breadcrumb && <div className={styles.contextMenuBreadcrumb}>{breadcrumb}</div>}
        {currentItems.map((item, index) => (
          <div
            key={item.id}
            className={styles.contextMenuItem}
            data-selected={index === selectedIndex}
            onClick={() => handleItemClick(item, index)}
          >
            {item.icon && <span className={styles.contextMenuIcon}>{item.icon}</span>}
            <span className={styles.contextMenuLabel}>{item.label}</span>
            {item.children && item.children.length > 0 && (
              <ChevronRight size={14} className={styles.contextMenuArrow} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
