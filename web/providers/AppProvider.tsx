import { ReactNode, useEffect, useRef, useState } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { queryClient } from "../store/queries/query-client"
import { useEngineStore } from "../store/engine-store"
import { useAuthStore } from "../store/auth-store"
import { useWorkspaceStore } from "../store/workspace-store"
import { useLogStore } from "../store/log-store"
import { StatusBar } from "../components/StatusBar"
import { logger } from "../../engine/utils/logger"

interface AppProviderProps {
  children: ReactNode
}

/**
 * AppInitializer handles the initialization sequence:
 * 1. Initialize GlobalClient
 * 2. Hydrate auth state from session (fast, from cache)
 * 3. Hydrate workspace state from session (fast, from cache)
 * 4. Fetch fresh workspace data from server (background, non-blocking)
 */
function AppInitializer({ children }: { children: ReactNode }) {
  const { initializeGlobalClient, isInitialized, isInitializing } = useEngineStore()
  const { hasAuthenticatedAccounts, hydrateFromSession: hydrateAuth } = useAuthStore()
  const { hydrateFromSession: hydrateWorkspace, fetchWorkspaces, resumePendingWorkspaceRegistration } =
    useWorkspaceStore()
  const { initializeLogListener } = useLogStore()
  const [isHydrated, setIsHydrated] = useState(false)
  const lastWorkspaceEntryIdRef = useRef<string | null>(null)

  // Register the log listener as early as possible to capture startup failures.
  useEffect(() => {
    initializeLogListener()
  }, [initializeLogListener])

  // Initialize GlobalClient on mount
  useEffect(() => {
    initializeGlobalClient()
  }, [initializeGlobalClient])

  // Once GlobalClient is initialized, hydrate state from session
  useEffect(() => {
    if (isInitialized && !isHydrated) {
      // Hydrate auth and workspace state before rendering children.
      // hydrateWorkspace is async (initializes Application), so we must await it
      // to prevent WorkspaceGuard from racing to create a duplicate Application.
      const hydrate = async () => {
        hydrateAuth()
        const allowLocalWorkspaceAutoCreate = !window.location.pathname.startsWith("/invite/")
        await hydrateWorkspace({ allowLocalWorkspaceAutoCreate })

        const { currentUser: hydratedUser } = useAuthStore.getState()
        if (hydratedUser) {
          // Run cleanup synchronously before rendering to avoid mid-session workspace removals.
          await resumePendingWorkspaceRegistration({ shouldRegisterEmptyLocalWorkspaces: false })
        }

        setIsHydrated(true)
      }
      hydrate()
    }
  }, [isInitialized, isHydrated, hydrateAuth, hydrateWorkspace, resumePendingWorkspaceRegistration])

  // Keep the active account in sync with workspace selection changes.
  useEffect(() => {
    const unsubscribe = useWorkspaceStore.subscribe(state => {
      const workspaceEntryId = state.currentWorkspace?.workspaceEntryId ?? null
      if (workspaceEntryId === lastWorkspaceEntryIdRef.current) {
        return
      }
      lastWorkspaceEntryIdRef.current = workspaceEntryId
      useAuthStore.getState().syncCurrentUserForWorkspaceSelection()
    })

    return unsubscribe
  }, [])

  // After hydration, fetch fresh workspace data from server (non-blocking)
  // This ensures we pick up any new workspaces created on other devices
  useEffect(() => {
    if (isHydrated && hasAuthenticatedAccounts) {
      fetchWorkspaces().catch((error: unknown) => {
        // Non-fatal: we still have cached data, just log the error
        logger.warn("Failed to fetch fresh workspaces:", error)
      })
    }
  }, [isHydrated, hasAuthenticatedAccounts, fetchWorkspaces])

  // Pending registration cleanup runs synchronously during hydration.

  // Show loading while initializing or hydrating
  // We must wait for hydration to complete before rendering children,
  // otherwise the router will render before auth/workspace state is restored
  if (isInitializing || !isInitialized || !isHydrated) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}></div>
    )
  }

  return <>{children}</>
}

/**
 * AppProvider wraps the entire application with all necessary providers:
 * - QueryClientProvider for TanStack Query
 * - AppInitializer for engine/auth/workspace initialization
 *
 * Zustand stores don't need a provider - they use module-level state.
 */
export function AppProvider({ children }: AppProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInitializer>{children}</AppInitializer>
      <StatusBar />
    </QueryClientProvider>
  )
}
