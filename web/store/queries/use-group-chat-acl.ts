import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useEngineStore } from "../engine-store"
import { queryKeys } from "./query-keys"
import type { ACLEntry, ACLPermission, ACLSubjectType } from "../../../engine/models/acl-entry"
import type { AvailableSubjects } from "../../../engine/models/team"

/**
 * Query hook for fetching ACL entries for a group chat.
 * Returns list of users and teams with access to the group chat.
 */
export function useGroupChatACLEntries(groupChatId: string) {
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useQuery({
    queryKey: queryKeys.groupChatAcl.byGroupChat(workspaceId, groupChatId),
    queryFn: async () => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const entriesResult = await application.getGetEntityACLEntries().execute({ entityId: groupChatId })
      if (entriesResult.isFailed()) {
        throw new Error(entriesResult.getError())
      }
      return entriesResult.getValue()
    },
    enabled: !!application && !!groupChatId && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })
}

/**
 * Query hook for fetching the member count for a group chat.
 * Expands team memberships to count individual users.
 */
export function useGroupChatACLMemberCount(groupChatId: string) {
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useQuery({
    queryKey: queryKeys.groupChatAcl.count(workspaceId, groupChatId),
    queryFn: async () => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const countResult = await application.getGetEntityACLMemberCount().execute({ entityId: groupChatId })
      if (countResult.isFailed()) {
        throw new Error(countResult.getError())
      }
      return countResult.getValue()
    },
    enabled: !!application && !!groupChatId && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })
}

/**
 * Query hook for fetching teams and members that can be added to a group chat.
 * Excludes subjects that already have access.
 */
export function useAvailableSubjectsForGroupChat(groupChatId: string) {
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useQuery({
    queryKey: queryKeys.groupChatAcl.availableSubjects(workspaceId, groupChatId),
    queryFn: async (): Promise<AvailableSubjects> => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const subjectsResult = await application.getGetAvailableSubjectsForEntity().execute({ entityId: groupChatId })
      if (subjectsResult.isFailed()) {
        throw new Error(subjectsResult.getError())
      }
      return subjectsResult.getValue()
    },
    enabled: !!application && !!groupChatId && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })
}

/**
 * Options for creating an ACL entry.
 */
interface CreateACLEntryOptions {
  groupChatId: string
  subjectType: ACLSubjectType
  subjectId: string
  permission: ACLPermission
}

/**
 * Mutation hook for creating a new ACL entry.
 * Grants a user or team access to a group chat.
 */
export function useCreateGroupChatACLEntry() {
  const queryClient = useQueryClient()
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useMutation({
    mutationFn: async ({ groupChatId, subjectType, subjectId, permission }: CreateACLEntryOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application?.isWorkspaceRemote()) {
        throw new Error("Group member management is unavailable in local-only workspaces")
      }

      const createResult = await application.getCreateEntityACLEntry().execute({
        entityId: groupChatId,
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
      // Invalidate all ACL-related queries for this group chat
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupChatAcl.byGroupChat(workspaceId, variables.groupChatId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupChatAcl.count(workspaceId, variables.groupChatId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupChatAcl.availableSubjects(workspaceId, variables.groupChatId),
      })
      // Keep ACL-scoped mention suggestions in sync with membership changes.
      queryClient.invalidateQueries({
        queryKey: queryKeys.mentionSuggestions.byResource(workspaceId, "group_chat", variables.groupChatId),
      })
    },
  })
}

/**
 * Options for updating an ACL entry.
 */
interface UpdateACLEntryOptions {
  groupChatId: string
  entryId: string
  permission: ACLPermission
}

/**
 * Mutation hook for updating an ACL entry's permission level.
 */
export function useUpdateGroupChatACLEntry() {
  const queryClient = useQueryClient()
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useMutation({
    mutationFn: async ({ groupChatId, entryId, permission }: UpdateACLEntryOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application?.isWorkspaceRemote()) {
        throw new Error("Group member management is unavailable in local-only workspaces")
      }

      const updateResult = await application.getUpdateEntityACLEntry().execute({
        entityId: groupChatId,
        entryId,
        permission,
      })
      if (updateResult.isFailed()) {
        throw new Error(updateResult.getError())
      }
      return updateResult.getValue()
    },
    onMutate: async ({ groupChatId, entryId, permission }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: queryKeys.groupChatAcl.byGroupChat(workspaceId, groupChatId),
      })

      // Snapshot previous value
      const previousEntries = queryClient.getQueryData<ACLEntry[]>(
        queryKeys.groupChatAcl.byGroupChat(workspaceId, groupChatId)
      )

      // Optimistically update
      queryClient.setQueryData<ACLEntry[]>(
        queryKeys.groupChatAcl.byGroupChat(workspaceId, groupChatId),
        (old = []) => old.map(entry => (entry.id === entryId ? { ...entry, permission } : entry))
      )

      return { previousEntries, groupChatId }
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousEntries) {
        queryClient.setQueryData(
          queryKeys.groupChatAcl.byGroupChat(workspaceId, context.groupChatId),
          context.previousEntries
        )
      }
    },
    onSuccess: (_data, { groupChatId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupChatAcl.byGroupChat(workspaceId, groupChatId),
      })
    },
  })
}

/**
 * Options for deleting an ACL entry.
 */
interface DeleteACLEntryOptions {
  groupChatId: string
  entryId: string
}

/**
 * Mutation hook for deleting an ACL entry.
 * Revokes access for a user or team.
 */
export function useDeleteGroupChatACLEntry() {
  const queryClient = useQueryClient()
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useMutation({
    mutationFn: async ({ groupChatId, entryId }: DeleteACLEntryOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application?.isWorkspaceRemote()) {
        throw new Error("Group member management is unavailable in local-only workspaces")
      }

      const deleteResult = await application.getDeleteEntityACLEntry().execute({ entityId: groupChatId, entryId })
      if (deleteResult.isFailed()) {
        throw new Error(deleteResult.getError())
      }

      return { groupChatId, entryId }
    },
    onMutate: async ({ groupChatId, entryId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: queryKeys.groupChatAcl.byGroupChat(workspaceId, groupChatId),
      })

      // Snapshot previous value
      const previousEntries = queryClient.getQueryData<ACLEntry[]>(
        queryKeys.groupChatAcl.byGroupChat(workspaceId, groupChatId)
      )

      // Optimistically remove
      queryClient.setQueryData<ACLEntry[]>(
        queryKeys.groupChatAcl.byGroupChat(workspaceId, groupChatId),
        (old = []) => old.filter(entry => entry.id !== entryId)
      )

      return { previousEntries, groupChatId }
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousEntries) {
        queryClient.setQueryData(
          queryKeys.groupChatAcl.byGroupChat(workspaceId, context.groupChatId),
          context.previousEntries
        )
      }
    },
    onSuccess: (_data, { groupChatId }) => {
      // Invalidate all ACL-related queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupChatAcl.byGroupChat(workspaceId, groupChatId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupChatAcl.count(workspaceId, groupChatId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.groupChatAcl.availableSubjects(workspaceId, groupChatId),
      })
      // Keep ACL-scoped mention suggestions in sync with membership changes.
      queryClient.invalidateQueries({
        queryKey: queryKeys.mentionSuggestions.byResource(workspaceId, "group_chat", groupChatId),
      })
    },
  })
}
