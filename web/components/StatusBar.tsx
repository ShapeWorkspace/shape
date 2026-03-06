import { type ReactNode, useState, useEffect, useCallback } from "react"
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react"
import { useStatusStore, type StatusVariant, type StatusItem } from "../store/status-store"
import * as styles from "../styles/status-bar.css"

const iconByVariant: Record<StatusVariant, ReactNode> = {
  info: <Info size={14} />,
  warning: <AlertTriangle size={14} />,
  error: <AlertCircle size={14} />,
  success: <CheckCircle2 size={14} />,
}

// Duration for exit animation (must match CSS)
const EXIT_ANIMATION_DURATION_MS = 150

/**
 * Tracks animation state for each status.
 */
interface AnimatedStatus extends StatusItem {
  isEntering: boolean
  isExiting: boolean
}

/**
 * StatusBar renders persistent status rows at the bottom of the app.
 * It listens to StatusStore updates and stacks multiple rows vertically.
 * Statuses animate in (slide up) and out (fade down).
 */
export function StatusBar() {
  const { statuses, removeStatus } = useStatusStore()

  // Track animated statuses with their animation state
  const [animatedStatuses, setAnimatedStatuses] = useState<AnimatedStatus[]>([])

  // Sync store statuses to animated statuses, handling enter/exit animations
  useEffect(() => {
    const currentIds = new Set(statuses.map(s => s.id))

    setAnimatedStatuses(prev => {
      const prevIds = new Set(prev.map(s => s.id))

      // Keep exiting statuses that haven't finished animating
      const stillExiting = prev.filter(s => s.isExiting && !currentIds.has(s.id))

      // Mark statuses that were removed as exiting
      const nowExiting = prev
        .filter(s => !s.isExiting && !currentIds.has(s.id))
        .map(s => ({ ...s, isExiting: true }))

      // Add/update current statuses - new ones get isEntering: true
      const current = statuses.map(s => ({
        ...s,
        isEntering: !prevIds.has(s.id),
        isExiting: false,
      }))

      // Schedule removal of exiting statuses after animation completes
      for (const status of nowExiting) {
        setTimeout(() => {
          setAnimatedStatuses(prev => prev.filter(s => s.id !== status.id))
        }, EXIT_ANIMATION_DURATION_MS)
      }

      return [...current, ...stillExiting, ...nowExiting]
    })
  }, [statuses])

  // Handle dismiss with exit animation
  const handleDismiss = useCallback(
    (id: string) => {
      // Mark as exiting first (triggers animation)
      setAnimatedStatuses(prev => prev.map(s => (s.id === id ? { ...s, isExiting: true } : s)))

      // Remove from store after animation
      setTimeout(() => {
        removeStatus(id)
      }, EXIT_ANIMATION_DURATION_MS)
    },
    [removeStatus]
  )

  if (animatedStatuses.length === 0) {
    return null
  }

  return (
    <div className={styles.statusBarContainer} aria-live="polite" data-testid="status-bar">
      {animatedStatuses.map(status => {
        const animationClass = status.isExiting
          ? styles.statusBarItemExiting
          : status.isEntering
            ? styles.statusBarItemEntering
            : ""

        return (
          <div
            key={status.id}
            className={`${styles.statusBarItem} ${styles.statusBarItemVariant[status.variant]} ${animationClass}`}
            role="status"
            data-testid={`status-bar-item-${status.id}`}
          >
            <div className={styles.statusBarItemContent}>
              <span className={styles.statusBarItemIcon}>{iconByVariant[status.variant]}</span>
              <span className={styles.statusBarItemMessage}>{status.message}</span>
            </div>
            {status.isDismissible && (
              <button
                type="button"
                className={styles.statusBarDismissButton}
                onClick={() => handleDismiss(status.id)}
                aria-label="Dismiss status"
              >
                <X size={12} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
