import React from "react"
import Tooltip from "./Tooltip"
import * as styles from "./MiniContextMenu.css"

export interface MiniContextMenuItem {
  icon: React.ReactNode
  onClick: () => void
  ariaLabel: string
  testId?: string
  tooltip?: string
  buttonRef?: React.Ref<HTMLButtonElement>
}

interface MiniContextMenuProps {
  items: MiniContextMenuItem[]
  isVisible: boolean
  className?: string
  onMouseEnter?: () => void
  onMouseLeave?: () => void
}

/**
 * MiniContextMenu - A compact horizontal action bar for quick message actions
 *
 * Displays icon buttons in a horizontal row, typically shown on hover.
 * Used for common actions like copy, quote, add to inbox, and more options.
 */
export const MiniContextMenu: React.FC<MiniContextMenuProps> = ({
  items,
  isVisible,
  className,
  onMouseEnter,
  onMouseLeave,
}) => {
  if (!isVisible || items.length === 0) {
    return null
  }

  return (
    <div
      className={`${styles.miniMenuContainer} ${className || ""}`}
      style={{ opacity: isVisible ? 1 : 0, pointerEvents: isVisible ? "auto" : "none" }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {items.map((item, index) => {
        const button = (
          <button
            key={index}
            ref={item.buttonRef}
            type="button"
            className={styles.miniMenuButton}
            onClick={e => {
              e.stopPropagation()
              item.onClick()
            }}
            aria-label={item.ariaLabel}
            data-testid={item.testId}
          >
            {item.icon}
          </button>
        )

        if (item.tooltip) {
          return (
            <Tooltip key={index} content={item.tooltip} placement="top">
              {button}
            </Tooltip>
          )
        }

        return button
      })}
    </div>
  )
}

export default MiniContextMenu
