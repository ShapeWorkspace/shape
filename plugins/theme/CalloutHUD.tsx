import React, { useState } from "react"
import { X } from "lucide-react"
import * as styles from "./CalloutHUD.css"

export type CalloutHUDProps = {
  /**
   * The icon to display on the left side of the callout HUD.
   * Typically a Lucide icon component.
   */
  icon: React.ReactNode
  /**
   * The text content to display in the callout HUD.
   */
  children: React.ReactNode
  /**
   * Whether the callout HUD can be dismissed by the user.
   * If true, displays a close button that hides the bar when clicked.
   */
  closeable?: boolean
  /**
   * Optional click handler to make the entire callout HUD interactive.
   * When provided, the callout HUD becomes clickable.
   */
  onClick?: () => void
  /**
   * Optional test ID for testing purposes.
   */
  testId?: string
  /**
   * Optional CSS class name to apply to the container.
   */
  className?: string
  /**
   * Visual intent for the callout. Defaults to "normal".
   */
  tone?: "normal" | "contrast"
}

/**
 * CalloutHUD displays helpful hints or notifications to users in a subtle,
 * non-intrusive banner format. It can optionally be dismissed by the user.
 */
export const CalloutHUD: React.FC<CalloutHUDProps> = ({
  icon,
  children,
  closeable = false,
  onClick,
  testId,
  className,
  tone = "normal",
}) => {
  const [isVisible, setIsVisible] = useState(true)

  if (!isVisible) {
    return null
  }

  const handleClose = (event: React.MouseEvent) => {
    // Prevent click event from bubbling to the container when close button is clicked
    event.stopPropagation()
    setIsVisible(false)
  }

  const toneClassName = tone === "contrast" ? styles.containerContrast : ""
  const baseContainerClassName = [styles.container, toneClassName].filter(Boolean).join(" ")

  const baseClassName = onClick
    ? `${baseContainerClassName} ${styles.clickableContainer}`
    : baseContainerClassName
  const containerClassName = className ? `${baseClassName} ${className}` : baseClassName

  const containerProps = onClick
    ? {
        className: containerClassName,
        onClick,
        role: "button",
        tabIndex: 0,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onClick()
          }
        },
        "data-testid": testId,
      }
    : {
        className: containerClassName,
        "data-testid": testId,
      }

  return (
    <div {...containerProps}>
      <div className={styles.iconContainer}>{icon}</div>
      <div className={styles.content}>{children}</div>
      {closeable && (
        <button
          type="button"
          className={styles.closeButton}
          onClick={handleClose}
          aria-label="Dismiss tip"
          data-testid={testId ? `${testId}-close` : undefined}
        >
          <X size={16} aria-hidden={true} />
        </button>
      )}
    </div>
  )
}
