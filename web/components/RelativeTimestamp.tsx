/**
 * RelativeTimestamp displays a human-readable relative time that auto-updates.
 *
 * Time display rules:
 * - < 5s: "just now"
 * - 5s-59s: "Xs ago" (updates every 5s: "5s ago", "10s ago", etc.)
 * - 1m-59m: "Xm ago"
 * - >= 1h: Full datetime string
 *
 * The component automatically refreshes itself at appropriate intervals
 * to keep the display current.
 */
import { useEffect, useState } from "react"

interface RelativeTimestampProps {
  // Unix timestamp in milliseconds
  timestamp: number
}

/**
 * Calculates the relative time display string for a given timestamp.
 * Returns the display string and the interval (in ms) until the next update is needed.
 */
function calculateRelativeTimeDisplay(timestamp: number): { display: string; refreshInterval: number } {
  const now = Date.now()
  const diffMs = now - timestamp
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)

  // Less than 5 seconds: "just now"
  if (diffSeconds < 5) {
    // Refresh when we hit 5 seconds
    const msUntilFive = (5 - diffSeconds) * 1000 - (diffMs % 1000)
    return { display: "just now", refreshInterval: Math.max(100, msUntilFive) }
  }

  // 5-59 seconds: "Xs ago" in 5-second increments
  if (diffSeconds < 60) {
    // Round down to nearest 5 seconds for display
    const roundedSeconds = Math.floor(diffSeconds / 5) * 5
    // Calculate when next 5-second boundary will be crossed
    const nextBoundarySeconds = roundedSeconds + 5
    const msUntilNextBoundary = (nextBoundarySeconds - diffSeconds) * 1000 - (diffMs % 1000)
    return { display: `${roundedSeconds}s ago`, refreshInterval: Math.max(100, msUntilNextBoundary) }
  }

  // 1-59 minutes: "Xm ago"
  if (diffMinutes < 60) {
    // Refresh when the minute changes
    const secondsIntoCurrentMinute = diffSeconds % 60
    const msUntilNextMinute = (60 - secondsIntoCurrentMinute) * 1000 - (diffMs % 1000)
    return { display: `${diffMinutes}m ago`, refreshInterval: Math.max(100, msUntilNextMinute) }
  }

  // 1 hour or more: full datetime string
  const date = new Date(timestamp)
  const formattedDate = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  const formattedTime = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })
  // No need to refresh frequently once we're showing full date
  return { display: `${formattedDate}, ${formattedTime}`, refreshInterval: 60000 }
}

export function RelativeTimestamp({ timestamp }: RelativeTimestampProps) {
  const [display, setDisplay] = useState(() => calculateRelativeTimeDisplay(timestamp).display)

  useEffect(() => {
    // Immediately recalculate when timestamp changes
    const { display: newDisplay, refreshInterval } = calculateRelativeTimeDisplay(timestamp)
    setDisplay(newDisplay)

    // Set up auto-refresh timer
    let timeoutId: ReturnType<typeof setTimeout>

    const scheduleRefresh = () => {
      const { display: updatedDisplay, refreshInterval: nextInterval } =
        calculateRelativeTimeDisplay(timestamp)
      setDisplay(updatedDisplay)
      timeoutId = setTimeout(scheduleRefresh, nextInterval)
    }

    timeoutId = setTimeout(scheduleRefresh, refreshInterval)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [timestamp])

  return <>{display}</>
}
