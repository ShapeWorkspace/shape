import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEngineStore } from "../engine-store"
import { queryKeys } from "./query-keys"
import { WorkspaceMember } from "../../../engine/models/workspace-member"

/**
 * Query hook for fetching workspace members.
 *
 * Uses WorkspaceMemberManager for stale-while-revalidate caching:
 * 1. Returns cached members immediately (if available)
 * 2. Fetches from network in parallel
 * 3. Returns cached data when offline
 *
 * This enables the contacts list to work when offline.
 */
export function useWorkspaceMembers() {
  const { application } = useEngineStore()
  const queryClient = useQueryClient()
  const workspaceId = application?.workspaceId ?? ""

  useEffect(() => {
    if (!application || !application?.isWorkspaceRemote()) {
      return
    }

    let isActive = true
    const workspaceMemberManager = application.getWorkspaceMemberManager()

    // Keep React Query cache in sync with WorkspaceMemberManager updates.
    const unsubscribe = workspaceMemberManager.registerObserver(() => {
      if (!isActive) {
        return
      }
      const members = workspaceMemberManager.getWorkspaceMembers()
      queryClient.setQueryData(queryKeys.members.byWorkspace(workspaceId), members)
    })

    return () => {
      isActive = false
      unsubscribe()
    }
  }, [application, queryClient, workspaceId])

  return useQuery({
    queryKey: queryKeys.members.byWorkspace(workspaceId),
    queryFn: async (): Promise<WorkspaceMember[]> => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application?.isWorkspaceRemote()) {
        return []
      }

      // WorkspaceMemberManager.fetchWorkspaceMembers() implements stale-while-revalidate
      // with IndexedDB caching for offline support
      return application.getWorkspaceMemberManager().fetchWorkspaceMembers()
    },
    enabled: !!application && application?.isWorkspaceRemote(),
    // Always refetch on mount - WorkspaceMemberManager handles stale-while-revalidate internally
    staleTime: 0,
    // Don't pause when offline - WorkspaceMemberManager handles offline by returning cached data
    networkMode: "always",
  })
}

/**
 * Gets the in-memory cached members without triggering a fetch.
 * Useful for synchronous access to already-loaded members.
 */
export function useWorkspaceMembersSync() {
  const { application } = useEngineStore()

  return application?.getWorkspaceMemberManager().getWorkspaceMembers() ?? []
}

/**
 * Hook to get the current user's workspace member record.
 * Returns the member if found, or null if not yet loaded or user is not authenticated.
 * Useful for checking the current user's role in the workspace.
 */
export function useCurrentUserWorkspaceMember(): WorkspaceMember | null {
  const { application } = useEngineStore()
  const { data: members = [] } = useWorkspaceMembers()

  // Use the account tied to the current workspace selection.
  const currentUserId = application?.getAccountUserId() ?? null

  if (!currentUserId || members.length === 0) {
    return null
  }

  return members.find(member => member.userId === currentUserId) ?? null
}
