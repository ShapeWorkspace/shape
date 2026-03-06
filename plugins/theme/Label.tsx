import React from "react"
import * as styles from "./Label.css"

export type LabelSignal = "success" | "warning" | "danger"

export interface LabelProps {
  /**
   * Signal type determining the color scheme
   */
  signal: LabelSignal
  /**
   * Icon to display (typically a React element from lucide-react)
   */
  icon?: React.ReactNode
  /**
   * Text content to display
   */
  text: string
  /**
   * Optional supporting copy shown underneath the primary text
   */
  supportingText?: string
  /**
   * Optional test ID for testing
   */
  testId?: string
}

/**
 * Label - A clean, simple component for displaying informational panels
 * with icons and text using success, warning, or danger signals.
 */
export const Label: React.FC<LabelProps> = ({ signal, icon, text, supportingText, testId }) => {
  const badgeClassNames = [styles.badge]
  const iconClassNames = [styles.icon]

  if (signal === "success") {
    badgeClassNames.push(styles.signalSuccess)
    iconClassNames.push(styles.iconSuccess)
  } else if (signal === "warning") {
    badgeClassNames.push(styles.signalWarning)
    iconClassNames.push(styles.iconWarning)
  } else if (signal === "danger") {
    badgeClassNames.push(styles.signalDanger)
    iconClassNames.push(styles.iconDanger)
  }

  const trimmedSupportingText = supportingText?.trim() ?? ""
  const hasSupportingText = trimmedSupportingText.length > 0
  const textNode = hasSupportingText ? (
    <span className={styles.textGroup}>
      <span className={styles.primaryText}>{text}</span>
      <span className={styles.supportingText}>{trimmedSupportingText}</span>
    </span>
  ) : (
    <span className={styles.primaryText}>{text}</span>
  )

  return (
    <div className={styles.container} data-testid={testId}>
      <span className={badgeClassNames.join(" ")}>
        {icon ? <span className={iconClassNames.join(" ")}>{icon}</span> : null}
        {textNode}
      </span>
    </div>
  )
}
