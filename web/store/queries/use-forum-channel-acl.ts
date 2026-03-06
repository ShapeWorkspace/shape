import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useEngineStore } from "../engine-store"
import { queryKeys } from "./query-keys"
import type { ACLEntry, ACLPermission, ACLSubjectType } from "../../../engine/models/acl-entry"
import type { AvailableSubjects } from "../../../engine/models/team"

/**
 * Query hook for fetching ACL entries for a forum channel.
 * Returns list of users and teams with access to the channel.
 */
export function useForumChannelACLEntries(channelId: string) {
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useQuery({
    queryKey: queryKeys.forumChannelAcl.byChannel(workspaceId, channelId),
    queryFn: async () => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const entriesResult = await application.getGetEntityACLEntries().execute({ entityId: channelId })
      if (entriesResult.isFailed()) {
        throw new Error(entriesResult.getError())
      }
      return entriesResult.getValue()
    },
    enabled: !!application && !!channelId && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })
}

/**
 * Query hook for fetching the member count for a forum channel.
 * Expands team memberships to count individual users.
 */
export function useForumChannelACLMemberCount(channelId: string) {
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useQuery({
    queryKey: queryKeys.forumChannelAcl.count(workspaceId, channelId),
    queryFn: async () => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const countResult = await application.getGetEntityACLMemberCount().execute({ entityId: channelId })
      if (countResult.isFailed()) {
        throw new Error(countResult.getError())
      }
      return countResult.getValue()
    },
    enabled: !!application && !!channelId && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })
}

/**
 * Query hook for fetching teams and members that can be added to a forum channel.
 * Excludes subjects that already have access.
 */
export function useAvailableSubjectsForForumChannel(channelId: string) {
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useQuery({
    queryKey: queryKeys.forumChannelAcl.availableSubjects(workspaceId, channelId),
    queryFn: async (): Promise<AvailableSubjects> => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const subjectsResult = await application.getGetAvailableSubjectsForEntity().execute({ entityId: channelId })
      if (subjectsResult.isFailed()) {
        throw new Error(subjectsResult.getError())
      }
      return subjectsResult.getValue()
    },
    enabled: !!application && !!channelId && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })
}

/**
 * Options for creating an ACL entry.
 */
interface CreateACLEntryOptions {
  channelId: string
  subjectType: ACLSubjectType
  subjectId: string
  permission: ACLPermission
}

/**
 * Mutation hook for creating a new ACL entry.
 * Grants a user or team access to a forum channel.
 */
export function useCreateForumChannelACLEntry() {
  const queryClient = useQueryClient()
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useMutation({
    mutationFn: async ({ channelId, subjectType, subjectId, permission }: CreateACLEntryOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application?.isWorkspaceRemote()) {
        throw new Error("Forum member management is unavailable in local-only workspaces")
      }

      const createResult = await application.getCreateEntityACLEntry().execute({
        entityId: channelId,
        subjectType,
        subjectId,
        permission,
      })
      if (createResult.isFailed()) {
        throw new Error(createResult.getError())
      }
      return createResult.getValue()
    },
    onSuccess: (_data, variables) => {
      // Invalidate the ACL entries query to refresh
      queryClient.invalidateQueries({
        queryKey: queryKeys.forumChannelAcl.byChannel(workspaceId, variables.channelId),
      })
      // Invalidate member count
      queryClient.invalidateQueries({
        queryKey: queryKeys.forumChannelAcl.count(workspaceId, variables.channelId),
      })
      // Invalidate available subjects
      queryClient.invalidateQueries({
        queryKey: queryKeys.forumChannelAcl.availableSubjects(workspaceId, variables.channelId),
      })
    },
  })
}

/**
 * Options for updating an ACL entry.
 */
interface UpdateACLEntryOptions {
  channelId: string
  entryId: string
  permission: ACLPermission
}

/**
 * Mutation hook for updating an existing ACL entry's permission.
 */
export function useUpdateForumChannelACLEntry() {
  const queryClient = useQueryClient()
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useMutation({
    mutationFn: async ({ channelId, entryId, permission }: UpdateACLEntryOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application?.isWorkspaceRemote()) {
        throw new Error("Forum member management is unavailable in local-only workspaces")
      }

      const updateResult = await application.getUpdateEntityACLEntry().execute({
        entityId: channelId,
        entryId,
        permission,
      })
      if (updateResult.isFailed()) {
        throw new Error(updateResult.getError())
      }
      return updateResult.getValue()
    },
    onSuccess: (updatedEntry, variables) => {
      // Update the specific entry in the cache
      queryClient.setQueryData<ACLEntry[]>(
        queryKeys.forumChannelAcl.byChannel(workspaceId, variables.channelId),
        (old = []) => old.map(entry => (entry.id === variables.entryId ? updatedEntry : entry))
      )
    },
  })
}

/**
 * Options for deleting an ACL entry.
 */
interface DeleteACLEntryOptions {
  channelId: string
  entryId: string
}

/**
 * Mutation hook for deleting an ACL entry.
 * Revokes access for a user or team.
 */
export function useDeleteForumChannelACLEntry() {
  const queryClient = useQueryClient()
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useMutation({
    mutationFn: async ({ channelId, entryId }: DeleteACLEntryOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application?.isWorkspaceRemote()) {
        throw new Error("Forum member management is unavailable in local-only workspaces")
      }

      const deleteResult = await application.getDeleteEntityACLEntry().execute({ entityId: channelId, entryId })
      if (deleteResult.isFailed()) {
        throw new Error(deleteResult.getError())
      }

      return { channelId, entryId }
    },
    onMutate: async ({ channelId, entryId }) => {
      // Cancel outstanding queries
      await queryClient.cancelQueries({
        queryKey: queryKeys.forumChannelAcl.byChannel(workspaceId, channelId),
      })

      // Save current entries for rollback
      const previousEntries = queryClient.getQueryData<ACLEntry[]>(
        queryKeys.forumChannelAcl.byChannel(workspaceId, channelId)
      )

      // Optimistically remove the entry
      queryClient.setQueryData<ACLEntry[]>(
        queryKeys.forumChannelAcl.byChannel(workspaceId, channelId),
        (old = []) => old.filter(entry => entry.id !== entryId)
      )

      return { previousEntries, channelId }
    },
    onError: (_err, _variables, context) => {
      if (context?.previousEntries && context?.channelId) {
        queryClient.setQueryData(
          queryKeys.forumChannelAcl.byChannel(workspaceId, context.channelId),
          context.previousEntries
        )
      }
    },
    onSuccess: (_data, variables) => {
      // Invalidate member count
      queryClient.invalidateQueries({
        queryKey: queryKeys.forumChannelAcl.count(workspaceId, variables.channelId),
      })
      // Invalidate available subjects
      queryClient.invalidateQueries({
        queryKey: queryKeys.forumChannelAcl.availableSubjects(workspaceId, variables.channelId),
      })
    },
  })
}
