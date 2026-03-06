import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useEngineStore } from "../engine-store"
import { queryKeys } from "./query-keys"
import type { ACLEntry, ACLPermission, ACLSubjectType } from "../../../engine/models/acl-entry"
import type { AvailableSubjects } from "../../../engine/models/team"

/**
 * Query hook for fetching ACL entries for a file.
 * Returns list of users and teams with access to the file.
 */
export function useFileACLEntries(fileId: string) {
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useQuery({
    queryKey: queryKeys.fileAcl.byFile(workspaceId, fileId),
    queryFn: async () => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const entriesResult = await application.getGetEntityACLEntries().execute({ entityId: fileId })
      if (entriesResult.isFailed()) {
        throw new Error(entriesResult.getError())
      }
      return entriesResult.getValue()
    },
    enabled: !!application && !!fileId && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })
}

/**
 * Query hook for fetching the member count for a file.
 * Expands team memberships to count individual users.
 */
export function useFileACLMemberCount(fileId: string) {
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useQuery({
    queryKey: queryKeys.fileAcl.count(workspaceId, fileId),
    queryFn: async () => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const countResult = await application.getGetEntityACLMemberCount().execute({ entityId: fileId })
      if (countResult.isFailed()) {
        throw new Error(countResult.getError())
      }
      return countResult.getValue()
    },
    enabled: !!application && !!fileId && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })
}

/**
 * Query hook for fetching teams and members that can be added to a file.
 * Excludes subjects that already have access.
 */
export function useAvailableSubjectsForFile(fileId: string) {
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useQuery({
    queryKey: queryKeys.fileAcl.availableSubjects(workspaceId, fileId),
    queryFn: async (): Promise<AvailableSubjects> => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const subjectsResult = await application.getGetAvailableSubjectsForEntity().execute({ entityId: fileId })
      if (subjectsResult.isFailed()) {
        throw new Error(subjectsResult.getError())
      }
      return subjectsResult.getValue()
    },
    enabled: !!application && !!fileId && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })
}

/**
 * Options for creating a file ACL entry.
 */
interface CreateFileACLEntryOptions {
  fileId: string
  subjectType: ACLSubjectType
  subjectId: string
  permission: ACLPermission
}

/**
 * Mutation hook for creating a new file ACL entry.
 * Grants a user or team access to a file.
 */
export function useCreateFileACLEntry() {
  const queryClient = useQueryClient()
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useMutation({
    mutationFn: async ({ fileId, subjectType, subjectId, permission }: CreateFileACLEntryOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application?.isWorkspaceRemote()) {
        throw new Error("File sharing is unavailable in local-only workspaces")
      }

      const createResult = await application.getCreateEntityACLEntry().execute({
        entityId: fileId,
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
      // Invalidate all ACL-related queries for this file
      queryClient.invalidateQueries({
        queryKey: queryKeys.fileAcl.byFile(workspaceId, variables.fileId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.fileAcl.count(workspaceId, variables.fileId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.fileAcl.availableSubjects(workspaceId, variables.fileId),
      })
    },
  })
}

/**
 * Options for updating a file ACL entry.
 */
interface UpdateFileACLEntryOptions {
  fileId: string
  entryId: string
  permission: ACLPermission
}

/**
 * Mutation hook for updating a file ACL entry's permission level.
 */
export function useUpdateFileACLEntry() {
  const queryClient = useQueryClient()
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useMutation({
    mutationFn: async ({ fileId, entryId, permission }: UpdateFileACLEntryOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application?.isWorkspaceRemote()) {
        throw new Error("File sharing is unavailable in local-only workspaces")
      }

      const updateResult = await application
        .getUpdateEntityACLEntry()
        .execute({ entityId: fileId, entryId, permission })
      if (updateResult.isFailed()) {
        throw new Error(updateResult.getError())
      }
      return updateResult.getValue()
    },
    onMutate: async ({ fileId, entryId, permission }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.fileAcl.byFile(workspaceId, fileId),
      })

      const previousEntries = queryClient.getQueryData<ACLEntry[]>(
        queryKeys.fileAcl.byFile(workspaceId, fileId)
      )

      // Optimistically update
      queryClient.setQueryData<ACLEntry[]>(queryKeys.fileAcl.byFile(workspaceId, fileId), (old = []) =>
        old.map(entry => (entry.id === entryId ? { ...entry, permission } : entry))
      )

      return { previousEntries, fileId }
    },
    onError: (_err, _variables, context) => {
      if (context?.previousEntries) {
        queryClient.setQueryData(
          queryKeys.fileAcl.byFile(workspaceId, context.fileId),
          context.previousEntries
        )
      }
    },
    onSuccess: (_data, { fileId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.fileAcl.byFile(workspaceId, fileId),
      })
    },
  })
}

/**
 * Options for deleting a file ACL entry.
 */
interface DeleteFileACLEntryOptions {
  fileId: string
  entryId: string
}

/**
 * Mutation hook for deleting a file ACL entry.
 * Revokes access for a user or team.
 */
export function useDeleteFileACLEntry() {
  const queryClient = useQueryClient()
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useMutation({
    mutationFn: async ({ fileId, entryId }: DeleteFileACLEntryOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application?.isWorkspaceRemote()) {
        throw new Error("File sharing is unavailable in local-only workspaces")
      }

      const deleteResult = await application.getDeleteEntityACLEntry().execute({ entityId: fileId, entryId })
      if (deleteResult.isFailed()) {
        throw new Error(deleteResult.getError())
      }

      return { fileId, entryId }
    },
    onMutate: async ({ fileId, entryId }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.fileAcl.byFile(workspaceId, fileId),
      })

      const previousEntries = queryClient.getQueryData<ACLEntry[]>(
        queryKeys.fileAcl.byFile(workspaceId, fileId)
      )

      // Optimistically remove
      queryClient.setQueryData<ACLEntry[]>(queryKeys.fileAcl.byFile(workspaceId, fileId), (old = []) =>
        old.filter(entry => entry.id !== entryId)
      )

      return { previousEntries, fileId }
    },
    onError: (_err, _variables, context) => {
      if (context?.previousEntries) {
        queryClient.setQueryData(
          queryKeys.fileAcl.byFile(workspaceId, context.fileId),
          context.previousEntries
        )
      }
    },
    onSuccess: (_data, { fileId }) => {
      // Invalidate all ACL-related queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.fileAcl.byFile(workspaceId, fileId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.fileAcl.count(workspaceId, fileId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.fileAcl.availableSubjects(workspaceId, fileId),
      })
    },
  })
}
