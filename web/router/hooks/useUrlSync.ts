import { useEffect, useMemo, useRef } from "react"
import { useNavigate, useLocation, useParams } from "react-router-dom"
import { useWindowStore } from "../../store/window-store"
import { useEngineStore } from "../../store/engine-store"
import { parseWindowLocationFromUrl } from "../../utils/window-navigation"

/**
 * useUrlSync provides bidirectional synchronization between:
 * - URL state (react-router)
 * - Window store state (active window's stack)
 *
 * Direction 1: URL -> Store
 * When the URL changes (e.g., browser back/forward, direct navigation),
 * update the active window to match.
 *
 * Direction 2: Store -> URL
 * When the active window's stack changes (e.g., navigateTo/navigateBack),
 * update the URL to reflect the new state.
 */
export function useUrlSync(sidecarRoute?: string | null) {
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams<{ workspaceId?: string }>()

  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const { windows, activeWindowId, createWindow, syncFromUrl, buildUrlPath } = useWindowStore()

  // Track if we're programmatically updating to avoid infinite loops
  const isUpdatingRef = useRef(false)
  const parsedLocation = useMemo(
    () => parseWindowLocationFromUrl(location.pathname, location.search),
    [location.pathname, location.search]
  )

  // URL -> Store sync
  useEffect(() => {
    // Skip if we're the ones updating the URL
    if (isUpdatingRef.current) {
      return
    }

    // Only sync within workspace routes
    if (!params.workspaceId || !workspaceId) {
      return
    }
    // Avoid syncing windows while a workspace switch is in-flight (URL and store disagree).
    if (params.workspaceId !== workspaceId) {
      return
    }

    // Ensure there's at least one window
    if (windows.length === 0 && parsedLocation) {
      createWindow(parsedLocation.tool, parsedLocation.itemId, parsedLocation)
      return
    }

    // Sync URL state to active window
    syncFromUrl(parsedLocation)
  }, [
    location.pathname,
    location.search,
    params.workspaceId,
    workspaceId,
    windows.length,
    createWindow,
    syncFromUrl,
    parsedLocation,
  ])

  // Store -> URL sync
  useEffect(() => {
    if (!workspaceId) {
      return
    }
    // Prevent URL rewrites while the route still points at a different workspace.
    if (!params.workspaceId || params.workspaceId !== workspaceId) {
      return
    }

    const activeWindow = windows.find(w => w.id === activeWindowId)
    if (!activeWindow) {
      return
    }

    const newPath = buildUrlPath(workspaceId, sidecarRoute)

    // Compare full URL path including query params
    const currentFullPath = location.pathname + location.search

    // Only navigate if the path actually changed
    if (newPath !== currentFullPath) {
      isUpdatingRef.current = true
      navigate(newPath, { replace: false })

      // Reset the flag after navigation completes
      requestAnimationFrame(() => {
        isUpdatingRef.current = false
      })
    }
  }, [
    windows,
    activeWindowId,
    workspaceId,
    buildUrlPath,
    navigate,
    location.pathname,
    location.search,
    sidecarRoute,
    params.workspaceId,
  ])
}
