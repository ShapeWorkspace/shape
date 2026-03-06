/**
 * Encodes a sidecar route so it can safely live inside a query param.
 */
export function encodeSidecarRouteForQueryParam(route: string): string {
  return encodeURIComponent(route)
}

/**
 * Decodes a sidecar route from a query param value.
 */
export function decodeSidecarRouteFromQueryParam(value: string | null): string | null {
  if (!value) {
    return null
  }

  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * Extracts the sidecar route from a URL search string.
 */
export function getSidecarRouteFromSearch(search: string): string | null {
  if (!search) {
    return null
  }

  const params = new URLSearchParams(search)
  return decodeSidecarRouteFromQueryParam(params.get("sidecar"))
}
