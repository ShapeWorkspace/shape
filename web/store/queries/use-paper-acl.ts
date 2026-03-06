import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useEngineStore } from "../engine-store"
import { queryKeys } from "./query-keys"
import type { ACLEntry, ACLPermission, ACLSubjectType } from "../../../engine/models/acl-entry"
import type { AvailableSubjects } from "../../../engine/models/team"

/**
 * Query hook for fetching ACL entries for a paper.
 * Returns list of users and teams with access to the paper.
 */
export function usePaperACLEntries(paperId: string) {
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useQuery({
    queryKey: queryKeys.paperAcl.byPaper(workspaceId, paperId),
    queryFn: async () => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const entriesResult = await application.getGetEntityACLEntries().execute({ entityId: paperId })
      if (entriesResult.isFailed()) {
        throw new Error(entriesResult.getError())
      }
      return entriesResult.getValue()
    },
    enabled: !!application && !!paperId && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })
}

/**
 * Query hook for fetching the member count for a paper.
 * Expands team memberships to count individual users.
 */
export function usePaperACLMemberCount(paperId: string) {
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useQuery({
    queryKey: queryKeys.paperAcl.count(workspaceId, paperId),
    queryFn: async () => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const countResult = await application.getGetEntityACLMemberCount().execute({ entityId: paperId })
      if (countResult.isFailed()) {
        throw new Error(countResult.getError())
      }
      return countResult.getValue()
    },
    enabled: !!application && !!paperId && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })
}

/**
 * Query hook for fetching teams and members that can be added to a paper.
 * Excludes subjects that already have access.
 */
export function useAvailableSubjectsForPaper(paperId: string) {
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useQuery({
    queryKey: queryKeys.paperAcl.availableSubjects(workspaceId, paperId),
    queryFn: async (): Promise<AvailableSubjects> => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const subjectsResult = await application.getGetAvailableSubjectsForEntity().execute({ entityId: paperId })
      if (subjectsResult.isFailed()) {
        throw new Error(subjectsResult.getError())
      }
      return subjectsResult.getValue()
    },
    enabled: !!application && !!paperId && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })
}

/**
 * Options for creating a paper ACL entry.
 */
interface CreatePaperACLEntryOptions {
  paperId: string
  subjectType: ACLSubjectType
  subjectId: string
  permission: ACLPermission
}

/**
 * Mutation hook for creating a new paper ACL entry.
 * Grants a user or team access to a paper.
 */
export function useCreatePaperACLEntry() {
  const queryClient = useQueryClient()
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useMutation({
    mutationFn: async ({ paperId, subjectType, subjectId, permission }: CreatePaperACLEntryOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application?.isWorkspaceRemote()) {
        throw new Error("Paper sharing is unavailable in local-only workspaces")
      }

      const createResult = await application.getCreateEntityACLEntry().execute({
        entityId: paperId,
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
      // Invalidate all ACL-related queries for this paper
      queryClient.invalidateQueries({
        queryKey: queryKeys.paperAcl.byPaper(workspaceId, variables.paperId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.paperAcl.count(workspaceId, variables.paperId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.paperAcl.availableSubjects(workspaceId, variables.paperId),
      })
      // Ensure mention suggestions update immediately for the active paper editor.
      queryClient.invalidateQueries({
        queryKey: queryKeys.mentionSuggestions.byResource(workspaceId, "paper", variables.paperId),
      })
    },
  })
}

/**
 * Options for updating a paper ACL entry.
 */
interface UpdatePaperACLEntryOptions {
  paperId: string
  entryId: string
  permission: ACLPermission
}

/**
 * Mutation hook for updating a paper ACL entry's permission level.
 */
export function useUpdatePaperACLEntry() {
  const queryClient = useQueryClient()
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useMutation({
    mutationFn: async ({ paperId, entryId, permission }: UpdatePaperACLEntryOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application?.isWorkspaceRemote()) {
        throw new Error("Paper sharing is unavailable in local-only workspaces")
      }

      const updateResult = await application.getUpdateEntityACLEntry().execute({ entityId: paperId, entryId, permission })
      if (updateResult.isFailed()) {
        throw new Error(updateResult.getError())
      }
      return updateResult.getValue()
    },
    onMutate: async ({ paperId, entryId, permission }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.paperAcl.byPaper(workspaceId, paperId),
      })

      const previousEntries = queryClient.getQueryData<ACLEntry[]>(
        queryKeys.paperAcl.byPaper(workspaceId, paperId)
      )

      // Optimistically update
      queryClient.setQueryData<ACLEntry[]>(queryKeys.paperAcl.byPaper(workspaceId, paperId), (old = []) =>
        old.map(entry => (entry.id === entryId ? { ...entry, permission } : entry))
      )

      return { previousEntries, paperId }
    },
    onError: (_err, _variables, context) => {
      if (context?.previousEntries) {
        queryClient.setQueryData(
          queryKeys.paperAcl.byPaper(workspaceId, context.paperId),
          context.previousEntries
        )
      }
    },
    onSuccess: (_data, { paperId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.paperAcl.byPaper(workspaceId, paperId),
      })
    },
  })
}

/**
 * Options for deleting a paper ACL entry.
 */
interface DeletePaperACLEntryOptions {
  paperId: string
  entryId: string
}

/**
 * Mutation hook for deleting a paper ACL entry.
 * Revokes access for a user or team.
 */
export function useDeletePaperACLEntry() {
  const queryClient = useQueryClient()
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useMutation({
    mutationFn: async ({ paperId, entryId }: DeletePaperACLEntryOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application?.isWorkspaceRemote()) {
        throw new Error("Paper sharing is unavailable in local-only workspaces")
      }

      const deleteResult = await application.getDeleteEntityACLEntry().execute({ entityId: paperId, entryId })
      if (deleteResult.isFailed()) {
        throw new Error(deleteResult.getError())
      }

      return { paperId, entryId }
    },
    onMutate: async ({ paperId, entryId }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.paperAcl.byPaper(workspaceId, paperId),
      })

      const previousEntries = queryClient.getQueryData<ACLEntry[]>(
        queryKeys.paperAcl.byPaper(workspaceId, paperId)
      )

      // Optimistically remove
      queryClient.setQueryData<ACLEntry[]>(queryKeys.paperAcl.byPaper(workspaceId, paperId), (old = []) =>
        old.filter(entry => entry.id !== entryId)
      )

      return { previousEntries, paperId }
    },
    onError: (_err, _variables, context) => {
      if (context?.previousEntries) {
        queryClient.setQueryData(
          queryKeys.paperAcl.byPaper(workspaceId, context.paperId),
          context.previousEntries
        )
      }
    },
    onSuccess: (_data, { paperId }) => {
      // Invalidate all ACL-related queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.paperAcl.byPaper(workspaceId, paperId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.paperAcl.count(workspaceId, paperId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.paperAcl.availableSubjects(workspaceId, paperId),
      })
      // Ensure mention suggestions update immediately for the active paper editor.
      queryClient.invalidateQueries({
        queryKey: queryKeys.mentionSuggestions.byResource(workspaceId, "paper", paperId),
      })
    },
  })
}
