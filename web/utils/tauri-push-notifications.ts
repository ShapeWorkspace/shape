import { registerForPushNotifications } from "@choochmeque/tauri-plugin-notifications-api"
import type { NotificationService } from "@shape/engine/services/notification-service"
import {
  isTauriRuntime,
  resolveMobilePlatformFromUserAgent,
  TauriMobilePlatform,
} from "@shape/engine/utils/tauri-runtime"

const pushTokenStoragePrefix = "shape.push_token"
let hasAttemptedPushRegistration = false

const buildPushTokenStorageKey = (platform: TauriMobilePlatform): string => {
  return `${pushTokenStoragePrefix}.${platform}`
}

export const registerTauriPushNotifications = async (
  notificationService: NotificationService
): Promise<void> => {
  if (!notificationService) {
    return
  }
  if (!isTauriRuntime()) {
    return
  }

  const platform = resolveMobilePlatformFromUserAgent()
  if (!platform) {
    return
  }

  if (hasAttemptedPushRegistration) {
    return
  }
  hasAttemptedPushRegistration = true

  try {
    // The Tauri plugin owns the iOS/Android permission flow and returns a device token.
    const deviceToken = await registerForPushNotifications()
    if (!deviceToken) {
      return
    }

    const storageKey = buildPushTokenStorageKey(platform)
    const existingToken = typeof localStorage !== "undefined" ? localStorage.getItem(storageKey) : null
    if (existingToken === deviceToken) {
      return
    }

    await notificationService.registerDeviceToken(deviceToken, platform)

    if (typeof localStorage !== "undefined") {
      localStorage.setItem(storageKey, deviceToken)
    }
  } catch {
    // Push registration is best-effort; failures should not block app startup.
  }
}
