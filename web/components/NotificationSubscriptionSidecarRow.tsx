import { useEffect, useState } from "react"
import { Bell, BellOff } from "lucide-react"
import { SidecarRow } from "./SidecarUI"
import { FlipText } from "./FlipText"

interface NotificationSubscriptionSidecarRowProps {
  index: number
  isSubscribed: boolean
  isLoading?: boolean
  isSaving: boolean
  isDisabled?: boolean
  disabledMeta?: string
  onToggle: () => void
  subscribedLabel?: string
  unsubscribedLabel?: string
  testId?: string
}

// Only show "Saving..." if the operation takes longer than this threshold.
// Prevents glitchy flashing for fast operations.
const SAVING_INDICATOR_DELAY_MS = 500

export function NotificationSubscriptionSidecarRow({
  index,
  isSubscribed,
  isLoading = false,
  isSaving,
  isDisabled = false,
  disabledMeta,
  onToggle,
  subscribedLabel,
  unsubscribedLabel,
  testId,
}: NotificationSubscriptionSidecarRowProps) {
  // Delay showing the saving indicator to avoid flashing on fast operations.
  const [showSavingIndicator, setShowSavingIndicator] = useState(false)

  useEffect(() => {
    if (isSaving) {
      const timer = setTimeout(() => setShowSavingIndicator(true), SAVING_INDICATOR_DELAY_MS)
      return () => clearTimeout(timer)
    } else {
      setShowSavingIndicator(false)
    }
  }, [isSaving])

  // While loading, show a neutral bell icon and no title to prevent distracting flip animation.
  // By not rendering FlipText until loaded, we avoid animating the initial value.
  const icon = isLoading ? <Bell size={14} /> : isSubscribed ? <BellOff size={14} /> : <Bell size={14} />
  const titleText = isSubscribed ? subscribedLabel ?? "Mute notifications" : unsubscribedLabel ?? "Unmute notifications"
  const title = isLoading ? null : <FlipText text={titleText} />
  const meta = showSavingIndicator ? "Saving..." : isDisabled ? disabledMeta ?? "Unavailable" : undefined
  const isRowDisabled = isLoading || isSaving || isDisabled

  return (
    <SidecarRow
      index={index}
      icon={icon}
      title={title}
      meta={meta}
      onClick={onToggle}
      disabled={isRowDisabled}
      testId={testId}
    />
  )
}
