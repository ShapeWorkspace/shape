import type { InAppNotification } from "@shape/engine/models/notification"
import type { NotificationService } from "@shape/engine/services/notification-service"
import { isTauriDesktopApp } from "@shape/engine/utils/tauri-runtime"
import { getNotificationFallbackVerb } from "./notification-display"

// Track window focus state so we only show notifications when the app is in the background.
let isWindowFocused = typeof document !== "undefined" ? document.hasFocus() : true
let focusTrackingInitialized = false

// Initialize focus tracking. Called automatically when setting up desktop notifications.
const initializeDesktopNotificationFocusTracking = (): void => {
  if (typeof window === "undefined" || focusTrackingInitialized) {
    return
  }
  focusTrackingInitialized = true
  window.addEventListener("focus", () => {
    isWindowFocused = true
  })
  window.addEventListener("blur", () => {
    isWindowFocused = false
  })
}

// Callback type for resolving user display names from user IDs.
type ActorNameResolver = (userId: string) => string

// Show a native OS notification for an incoming SSE notification event.
// Only fires on desktop when the window is not focused and the notification is unread.
const showDesktopNotificationForSseEvent = async (
  notification: InAppNotification,
  resolveActorName: ActorNameResolver
): Promise<void> => {
  if (!isTauriDesktopApp()) {
    return
  }
  if (isWindowFocused) {
    return
  }
  // Don't show notifications for items that are already read (e.g., from another device).
  if (notification.readAt) {
    return
  }

  try {
    // Dynamic import to avoid bundling Tauri plugin in web builds where it's not available.
    // Using the same choochmeque package that handles mobile push notifications.
    const { sendNotification, isPermissionGranted, requestPermission } = await import(
      "@choochmeque/tauri-plugin-notifications-api"
    )

    let hasPermission = await isPermissionGranted()
    if (!hasPermission) {
      const permissionResult = await requestPermission()
      hasPermission = permissionResult === "granted"
    }
    if (!hasPermission) {
      return
    }

    const actorId = notification.latestActorId || notification.actorUserId
    const actorName = resolveActorName(actorId)
    const verb = getNotificationFallbackVerb(notification.actionType, notification.targetEntityType)
    await sendNotification({
      title: "Shape",
      body: `${actorName} ${verb}`,
    })
  } catch {
    // Desktop notifications are best-effort; failures should not block the app.
  }
}

// Set up desktop notifications triggered by SSE events. Returns an unsubscribe function.
// The resolveActorName callback should return a display name for a given user ID.
export const setupDesktopNotificationsFromSse = (
  notificationService: NotificationService,
  resolveActorName: ActorNameResolver
): (() => void) => {
  if (!isTauriDesktopApp()) {
    return () => {}
  }

  initializeDesktopNotificationFocusTracking()

  return notificationService.onNotificationSseEvent(notification => {
    void showDesktopNotificationForSseEvent(notification, resolveActorName)
  })
}
