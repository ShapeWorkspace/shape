const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/, "")

const isAbsoluteUrl = (value: string): boolean => /^https?:\/\//i.test(value)

const normalizeRelativeApiPath = (value: string): string => {
  const trimmed = value.replace(/^\/+/, "").replace(/\/+$/, "")
  if (trimmed.length === 0) {
    return "/api"
  }
  return `/${trimmed}`
}

const isTauriOrigin = (origin: string): boolean => origin.startsWith("tauri://")

const isLocalDevelopmentUrl = (value: string): boolean =>
  /^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/i.test(value)

/**
 * Resolves the default API base URL using Vite env and runtime origin.
 * Mirrors the logic used during GlobalClient initialization so the UI stays aligned.
 */
export const resolveApiUrlFromEnvironment = (): string => {
  const envApiUrl = import.meta.env.VITE_API_URL?.trim()

  if (typeof window === "undefined" || !window.location) {
    throw new Error("Unable to determine API URL")
  }

  const origin = window.location.origin
  const isTauri = isTauriOrigin(origin)

  if (!envApiUrl || envApiUrl.length === 0) {
    if (isTauri) {
      throw new Error("VITE_API_URL must be set for Tauri builds")
    }
    return `${origin}/api`
  }

  if (isTauri) {
    return trimTrailingSlashes(envApiUrl)
  }

  if (isLocalDevelopmentUrl(envApiUrl)) {
    return `${origin}/api`
  }

  if (isAbsoluteUrl(envApiUrl)) {
    return trimTrailingSlashes(envApiUrl)
  }

  const normalizedPath = normalizeRelativeApiPath(envApiUrl)
  return `${origin}${normalizedPath}`
}

/**
 * Normalizes a user-provided API base URL by trimming whitespace and trailing slashes.
 */
export const normalizeApiUrlInput = (value: string): string => trimTrailingSlashes(value.trim())

/**
 * Validates a user-provided API base URL.
 * Requires /api suffix because engine endpoints are relative to that base.
 */
export const validateApiUrlInput = (value: string): string | null => {
  const trimmed = value.trim()
  if (!trimmed) {
    return "API server is required"
  }

  const normalized = normalizeApiUrlInput(trimmed)
  const isRelativePath = normalized.startsWith("/")

  if (isRelativePath) {
    if (typeof window !== "undefined" && window.location && isTauriOrigin(window.location.origin)) {
      return "Desktop builds require a full https:// URL"
    }
  } else if (!isAbsoluteUrl(normalized)) {
    return "API server must be a valid URL"
  }

  return null
}
