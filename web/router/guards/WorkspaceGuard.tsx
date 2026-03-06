import { ReactNode, useEffect, useState } from "react"
import { Navigate, useParams, useNavigate, useLocation } from "react-router-dom"
import { useWorkspaceStore } from "../../store/workspace-store"
import type { WorkspaceInfo } from "../../store/types"
import { useAuthStore } from "../../store/auth-store"

interface WorkspaceGuardProps {
  children: ReactNode
}

/**
 * WorkspaceGuard ensures a workspace is selected before rendering children.
 * If the URL contains a workspace ID, it will attempt to select that workspace.
 * If the workspace doesn't exist or user has no access, redirects to workspace selector.
 *
 * IMPORTANT: We avoid synchronous redirects during render to prevent race conditions
 * when navigating immediately after workspace creation. The workspace state might not
 * have propagated yet, so we give the selection process a chance to complete.
 */
export function WorkspaceGuard({ children }: WorkspaceGuardProps) {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const location = useLocation()
  const { hasAuthenticatedAccounts } = useAuthStore()
  const { currentWorkspace, workspaces, selectWorkspace, workspacesLoaded } = useWorkspaceStore()
  const navigate = useNavigate()
  const [isSelecting, setIsSelecting] = useState(false)
  const isAuthenticatedUser = hasAuthenticatedAccounts
  const areWorkspacesReady = workspacesLoaded || !isAuthenticatedUser

  const navigationState = (location.state ?? null) as {
    accountId?: string
    workspaceEntryId?: string
  } | null
  const workspaceEntryIdFromNavigationState = navigationState?.workspaceEntryId
  const accountIdFromNavigationState = navigationState?.accountId

  // Check if current workspace matches both the URL and any navigation state.
  // Navigation state (accountId, workspaceEntryId) is passed when intentionally switching
  // workspaces to disambiguate which account's view to use for a shared workspace UUID.
  const workspaceUuidMatches = currentWorkspace?.uuid === workspaceId
  const navigationStateMatches =
    (!workspaceEntryIdFromNavigationState ||
      currentWorkspace?.workspaceEntryId === workspaceEntryIdFromNavigationState) &&
    (!accountIdFromNavigationState || currentWorkspace?.accountId === accountIdFromNavigationState)

  // If navigation state is present, require it to match (intentional switch).
  // If no navigation state, UUID match is sufficient (page refresh or direct URL).
  const isCurrentWorkspaceMatch = workspaceUuidMatches && (navigationStateMatches || !navigationState)

  useEffect(() => {
    // If current workspace matches URL + account context, we're good
    if (isCurrentWorkspaceMatch) {
      setIsSelecting(false)
      return
    }

    // Need to select a workspace if:
    // 1. URL has a workspace ID that doesn't match current workspace UUID, OR
    // 2. URL has same workspace UUID but different account (switching between accounts for shared workspace)
    const needsWorkspaceSelection =
      workspaceId && (currentWorkspace?.uuid !== workspaceId || !navigationStateMatches)

    if (needsWorkspaceSelection) {
      // Find the workspace entry to select based on navigation state
      const workspace = workspaceEntryIdFromNavigationState
        ? workspaces.find(
            (entry: WorkspaceInfo) => entry.workspaceEntryId === workspaceEntryIdFromNavigationState
          )
        : accountIdFromNavigationState
          ? workspaces.find(
              (entry: WorkspaceInfo) =>
                entry.uuid === workspaceId && entry.accountId === accountIdFromNavigationState
            )
          : undefined

      if (workspace) {
        setIsSelecting(true)
        // selectWorkspace is async (initializes search worker), await it
        selectWorkspace(workspaceId, workspace.accountId).finally(() => {
          setIsSelecting(false)
        })
        return
      }

      // No navigation state - try to find any matching workspace by UUID
      if (!workspaceEntryIdFromNavigationState && !accountIdFromNavigationState) {
        if (workspaces.some((entry: WorkspaceInfo) => entry.uuid === workspaceId)) {
          setIsSelecting(true)
          selectWorkspace(workspaceId, undefined).finally(() => {
            setIsSelecting(false)
          })
          return
        }
      }

      if (!areWorkspacesReady) {
        // Workspaces are still loading; attempt selection directly in case the manager
        // already has cached data but the store hasn't synchronized yet.
        setIsSelecting(true)
        selectWorkspace(workspaceId, accountIdFromNavigationState ?? undefined).finally(() => {
          setIsSelecting(false)
        })
        return
      }

      // Workspace not found and our workspace list is settled - redirect appropriately
      navigate(isAuthenticatedUser ? "/workspaces" : "/", { replace: true })
    }
  }, [
    workspaceId,
    currentWorkspace,
    isCurrentWorkspaceMatch,
    navigationStateMatches,
    workspaces,
    areWorkspacesReady,
    isAuthenticatedUser,
    selectWorkspace,
    navigate,
    workspaceEntryIdFromNavigationState,
    accountIdFromNavigationState,
  ])

  // If we have both a workspace ID in the URL and a matching current workspace, render children
  if (isCurrentWorkspaceMatch) {
    return <>{children}</>
  }

  // If we have a current workspace but URL doesn't match (shouldn't happen normally),
  // still render children - the URL sync hook will correct the URL
  if (currentWorkspace && !workspaceId) {
    return <>{children}</>
  }

  // If we're in the process of selecting, or workspaces haven't loaded yet,
  // show a loading state instead of redirecting
  if (isSelecting || (workspaceId && !areWorkspacesReady)) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div></div>
      </div>
    )
  }

  // No workspace ID in URL and no current workspace - redirect to workspace selector
  if (!workspaceId && !currentWorkspace) {
    return <Navigate to={isAuthenticatedUser ? "/workspaces" : "/"} replace />
  }

  // Fallback: render loading while waiting for effect to handle navigation
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
      <div></div>
    </div>
  )
}
