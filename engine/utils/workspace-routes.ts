declare global {
  interface Window {
    __SHAPE_SHARED_COOKIE_DOMAIN?: string
    __SHAPE_IS_WORKSPACE_HOST?: boolean
    __SHAPE_WORKSPACE_SUBDOMAIN?: string
  }
}

type WorkspaceHostMetadata = {
  isWorkspaceHost: boolean
  subdomain?: string
}

const normalizeSuffix = (suffix?: string): string => {
  if (!suffix) {
    return ""
  }
  return suffix.startsWith("/") ? suffix : `/${suffix}`
}

const normalizePrefix = (prefix?: string): string => {
  if (!prefix) {
    return ""
  }
  return prefix.startsWith("/") ? prefix : `/${prefix}`
}

const buildPrefixedWorkspacePath = (
  workspaceIdentifier: string,
  suffix: string = "",
  prefix?: string
): string => {
  const normalizedSuffix = normalizeSuffix(suffix)
  const normalizedPrefix = normalizePrefix(prefix)
  return `${normalizedPrefix}/workspaces/${workspaceIdentifier}${normalizedSuffix}`
}

const computeMetadata = (): WorkspaceHostMetadata => {
  if (typeof window === "undefined") {
    return { isWorkspaceHost: false }
  }

  const isWorkspaceHost = Boolean(window.__SHAPE_IS_WORKSPACE_HOST)
  const subdomain = window.__SHAPE_WORKSPACE_SUBDOMAIN?.trim()

  return {
    isWorkspaceHost,
    subdomain: subdomain && subdomain.length > 0 ? subdomain : undefined,
  }
}

export const isWorkspaceScopedHost = (): boolean => {
  return computeMetadata().isWorkspaceHost
}

export const getWorkspaceSubdomainFromHost = (): string | undefined => {
  return computeMetadata().subdomain
}

export const buildWorkspacePath = (workspaceId: string, suffix: string = ""): string => {
  const normalizedSuffix = normalizeSuffix(suffix)
  if (isWorkspaceScopedHost()) {
    return normalizedSuffix || "/"
  }
  return `/workspaces/${workspaceId}${normalizedSuffix}`
}

export const buildWorkspaceCollectionPath = (): string => {
  return isWorkspaceScopedHost() ? "/" : "/workspaces"
}

export const buildWorkspacePathOrCollection = (workspaceId?: string): string => {
  if (workspaceId) {
    return buildWorkspacePath(workspaceId)
  }
  return buildWorkspaceCollectionPath()
}

export const buildWorkspaceMatchPattern = (suffix: string = ""): string => {
  const normalizedSuffix = normalizeSuffix(suffix)
  if (isWorkspaceScopedHost()) {
    return normalizedSuffix || "/"
  }
  return `/workspaces/:workspaceId${normalizedSuffix}`
}

export const buildApiWorkspacePath = (workspaceIdentifier: string, suffix: string = ""): string => {
  return buildPrefixedWorkspacePath(workspaceIdentifier, suffix)
}

export const buildApiV2WorkspacePath = (workspaceIdentifier: string, suffix: string = ""): string => {
  return buildPrefixedWorkspacePath(workspaceIdentifier, suffix, "/v2")
}

export const buildSseWorkspacePath = (workspaceIdentifier: string, suffix: string = ""): string => {
  return buildPrefixedWorkspacePath(workspaceIdentifier, suffix, "/sse")
}
