import { useEffect, useMemo, useRef } from "react"
import { useLocation } from "react-router-dom"
import { useAuthStore } from "../../store/auth-store"
import { useSidecar } from "../../contexts/SidecarContext"
import { getSidecarRouteFromSearch } from "../sidecar-routing"
import { resolveSidecarStackForRoute } from "../sidecar-routes"

/**
 * Syncs sidecar stack state with the `?sidecar=` URL param.
 * Keeps deep-linking centralized while allowing tools to set sidecars normally.
 */
export function useSidecarRouteSync(currentSidecarRoute: string | null) {
  const location = useLocation()
  const { hasAuthenticatedAccounts } = useAuthStore()
  const { replaceSidecarStack, clearSidecar } = useSidecar()
  const previousSidecarRouteFromUrlRef = useRef<string | null>(null)

  const sidecarRouteFromUrl = useMemo(() => {
    return getSidecarRouteFromSearch(location.search)
  }, [location.search])

  useEffect(() => {
    const previousSidecarRouteFromUrl = previousSidecarRouteFromUrlRef.current
    previousSidecarRouteFromUrlRef.current = sidecarRouteFromUrl

    if (sidecarRouteFromUrl === currentSidecarRoute) {
      return
    }

    if (!sidecarRouteFromUrl) {
      // Only clear when the URL param was explicitly removed (e.g., user navigated back).
      if (currentSidecarRoute && previousSidecarRouteFromUrl) {
        clearSidecar()
      }
      return
    }

    const isSidecarRoutePendingRemoval =
      !currentSidecarRoute && previousSidecarRouteFromUrl === sidecarRouteFromUrl
    if (isSidecarRoutePendingRemoval) {
      // The sidecar stack already popped back while the URL is still updating.
      // Avoid re-applying the same route so the stack can settle on the root sidecar.
      return
    }

    if (hasAuthenticatedAccounts && sidecarRouteFromUrl.startsWith("/auth/")) {
      clearSidecar()
      return
    }

    const resolvedStack = resolveSidecarStackForRoute(sidecarRouteFromUrl)
    if (resolvedStack) {
      replaceSidecarStack(resolvedStack)
    }
  }, [sidecarRouteFromUrl, currentSidecarRoute, hasAuthenticatedAccounts, replaceSidecarStack, clearSidecar])
}
