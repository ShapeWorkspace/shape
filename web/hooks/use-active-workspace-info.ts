import { useMemo } from "react"
import { useEngineStore } from "../store/engine-store"
import { useWorkspaceStore } from "../store/workspace-store"
import type { WorkspaceInfo } from "../store/types"

/**
 * Returns the WorkspaceInfo for the current Application workspace, if available.
 * Prefers account-matched workspace entries to avoid cross-account collisions.
 */
export function useActiveWorkspaceInfo(): WorkspaceInfo | null {
  const { application } = useEngineStore()
  const workspaces = useWorkspaceStore(state => state.workspaces)
  const activeWorkspaceId = application?.workspaceId ?? ""
  const activeAccountUserId = application?.getAccountUserId()

  return useMemo(() => {
    if (!activeWorkspaceId) {
      return null
    }

    // Prefer the workspace entry that matches both the workspace ID and the active account.
    const workspaceWithMatchingAccount = workspaces.find(
      workspace =>
        workspace.uuid === activeWorkspaceId &&
        (!activeAccountUserId || workspace.accountId === activeAccountUserId)
    )
    if (workspaceWithMatchingAccount) {
      return workspaceWithMatchingAccount
    }

    // Fall back to any workspace entry that matches the workspace ID.
    return workspaces.find(workspace => workspace.uuid === activeWorkspaceId) ?? null
  }, [workspaces, activeWorkspaceId, activeAccountUserId])
}
