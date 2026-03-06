import { Navigate } from "react-router-dom"
import { useAuthStore } from "../store/auth-store"
import { useEngineStore } from "../store/engine-store"

/**
 * RootRedirect handles the root URL (/) and redirects based on workspace state:
 * - Anonymous with local workspace -> /w/:workspaceId
 * - Authenticated but no workspace -> /workspaces
 * - Authenticated with workspace -> /w/:workspaceId
 */
export function RootRedirect() {
  const { hasAuthenticatedAccounts } = useAuthStore()
  const { application } = useEngineStore()
  const activeWorkspaceId = application?.workspaceId

  if (!hasAuthenticatedAccounts && activeWorkspaceId) {
    return <Navigate to={`/w/${activeWorkspaceId}`} replace />
  }

  if (!hasAuthenticatedAccounts && !activeWorkspaceId) {
    return <Navigate to="/auth/signin" replace />
  }

  if (hasAuthenticatedAccounts && !activeWorkspaceId) {
    return <Navigate to="/workspaces" replace />
  }

  if (activeWorkspaceId) {
    return <Navigate to={`/w/${activeWorkspaceId}`} replace />
  }

  return <Navigate to="/workspaces" replace />
}
