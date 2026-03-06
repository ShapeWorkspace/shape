/**
 * Tauri Runtime Helpers
 *
 * Lightweight utilities for detecting a Tauri runtime environment.
 */

export type TauriMobilePlatform = "ios" | "android"

// Detect if we're running inside Tauri.
export const isTauriRuntime = (): boolean => {
  return typeof window !== "undefined" && "__TAURI__" in window
}

// Resolve the mobile platform based on user agent inspection.
export const resolveMobilePlatformFromUserAgent = (): TauriMobilePlatform | null => {
  if (typeof navigator === "undefined") {
    return null
  }

  const userAgent = navigator.userAgent
  if (/iPad|iPhone|iPod/i.test(userAgent)) {
    return "ios"
  }
  if (/Android/i.test(userAgent)) {
    return "android"
  }

  return null
}

// Returns true when running as a native Tauri mobile app.
export const isTauriMobileApp = (): boolean => {
  if (!isTauriRuntime()) {
    return false
  }

  return resolveMobilePlatformFromUserAgent() !== null
}

// Returns true when running as a Tauri desktop app (not mobile).
export const isTauriDesktopApp = (): boolean => {
  if (!isTauriRuntime()) {
    return false
  }

  return resolveMobilePlatformFromUserAgent() === null
}
