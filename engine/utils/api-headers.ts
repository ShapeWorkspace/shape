import { isTauriRuntime } from "./tauri-runtime"

/**
 * Builds common headers for API requests.
 */
export function buildAPIHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }

  if (isTauriRuntime()) {
    headers["X-Client-Type"] = "tauri"
  }

  return headers
}

/**
 * Builds headers for authenticated API requests.
 */
export function buildAuthenticatedAPIHeaders(
  userId: string,
  appAuthToken?: string
): Record<string, string> {
  const headers = buildAPIHeaders()
  headers["X-Active-Account-ID"] = userId

  if (appAuthToken) {
    headers["Authorization"] = `Bearer ${appAuthToken}`
  }

  return headers
}
