import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useEngineStore } from "../engine-store"
import { queryKeys } from "./query-keys"
import type { ACLEntry, ACLPermission, ACLSubjectType } from "../../../engine/models/acl-entry"
import type { AvailableSubjects } from "../../../engine/models/team"

/**
 * Query hook for fetching ACL entries for a folder.
 * Returns list of users and teams with access to the folder.
 */
export function useFolderACLEntries(folderId: string) {
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useQuery({
    queryKey: queryKeys.folderAcl.byFolder(workspaceId, folderId),
    queryFn: async () => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const entriesResult = await application.getGetEntityACLEntries().execute({ entityId: folderId })
      if (entriesResult.isFailed()) {
        throw new Error(entriesResult.getError())
      }
      return entriesResult.getValue()
    },
    enabled: !!application && !!folderId && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })
}

/**
 * Query hook for fetching the member count for a folder.
 * Expands team memberships to count individual users.
 */
export function useFolderACLMemberCount(folderId: string) {
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useQuery({
    queryKey: queryKeys.folderAcl.count(workspaceId, folderId),
    queryFn: async () => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const countResult = await application.getGetEntityACLMemberCount().execute({ entityId: folderId })
      if (countResult.isFailed()) {
        throw new Error(countResult.getError())
      }
      return countResult.getValue()
    },
    enabled: !!application && !!folderId && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })
}

/**
 * Query hook for fetching teams and members that can be added to a folder.
 * Excludes subjects that already have access.
 */
export function useAvailableSubjectsForFolder(folderId: string) {
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useQuery({
    queryKey: queryKeys.folderAcl.availableSubjects(workspaceId, folderId),
    queryFn: async (): Promise<AvailableSubjects> => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const subjectsResult = await application.getGetAvailableSubjectsForEntity().execute({ entityId: folderId })
      if (subjectsResult.isFailed()) {
        throw new Error(subjectsResult.getError())
      }
      return subjectsResult.getValue()
    },
    enabled: !!application && !!folderId && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })
}

/**
 * Options for creating a folder ACL entry.
 */
interface CreateFolderACLEntryOptions {
  folderId: string
  subjectType: ACLSubjectType
  subjectId: string
  permission: ACLPermission
}

/**
 * Mutation hook for creating a new folder ACL entry.
 * Grants a user or team access to a folder.
 */
export function useCreateFolderACLEntry() {
  const queryClient = useQueryClient()
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useMutation({
    mutationFn: async ({ folderId, subjectType, subjectId, permission }: CreateFolderACLEntryOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application?.isWorkspaceRemote()) {
        throw new Error("Folder sharing is unavailable in local-only workspaces")
      }

      const createResult = await application.getCreateEntityACLEntry().execute({
        entityId: folderId,
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
      // Invalidate all ACL-related queries for this folder
      queryClient.invalidateQueries({
        queryKey: queryKeys.folderAcl.byFolder(workspaceId, variables.folderId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.folderAcl.count(workspaceId, variables.folderId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.folderAcl.availableSubjects(workspaceId, variables.folderId),
      })
    },
  })
}

/**
 * Options for updating a folder ACL entry.
 */
interface UpdateFolderACLEntryOptions {
  folderId: string
  entryId: string
  permission: ACLPermission
}

/**
 * Mutation hook for updating a folder ACL entry's permission level.
 */
export function useUpdateFolderACLEntry() {
  const queryClient = useQueryClient()
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useMutation({
    mutationFn: async ({ folderId, entryId, permission }: UpdateFolderACLEntryOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application?.isWorkspaceRemote()) {
        throw new Error("Folder sharing is unavailable in local-only workspaces")
      }

      const updateResult = await application.getUpdateEntityACLEntry().execute({ entityId: folderId, entryId, permission })
      if (updateResult.isFailed()) {
        throw new Error(updateResult.getError())
      }
      return updateResult.getValue()
    },
    onMutate: async ({ folderId, entryId, permission }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.folderAcl.byFolder(workspaceId, folderId),
      })

      const previousEntries = queryClient.getQueryData<ACLEntry[]>(
        queryKeys.folderAcl.byFolder(workspaceId, folderId)
      )

      // Optimistically update
      queryClient.setQueryData<ACLEntry[]>(queryKeys.folderAcl.byFolder(workspaceId, folderId), (old = []) =>
        old.map(entry => (entry.id === entryId ? { ...entry, permission } : entry))
      )

      return { previousEntries, folderId }
    },
    onError: (_err, _variables, context) => {
      if (context?.previousEntries) {
        queryClient.setQueryData(
          queryKeys.folderAcl.byFolder(workspaceId, context.folderId),
          context.previousEntries
        )
      }
    },
    onSuccess: (_data, { folderId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.folderAcl.byFolder(workspaceId, folderId),
      })
    },
  })
}

/**
 * Options for deleting a folder ACL entry.
 */
interface DeleteFolderACLEntryOptions {
  folderId: string
  entryId: string
}

/**
 * Mutation hook for deleting a folder ACL entry.
 * Revokes access for a user or team.
 */
export function useDeleteFolderACLEntry() {
  const queryClient = useQueryClient()
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useMutation({
    mutationFn: async ({ folderId, entryId }: DeleteFolderACLEntryOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application?.isWorkspaceRemote()) {
        throw new Error("Folder sharing is unavailable in local-only workspaces")
      }

      const deleteResult = await application.getDeleteEntityACLEntry().execute({ entityId: folderId, entryId })
      if (deleteResult.isFailed()) {
        throw new Error(deleteResult.getError())
      }

      return { folderId, entryId }
    },
    onMutate: async ({ folderId, entryId }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.folderAcl.byFolder(workspaceId, folderId),
      })

      const previousEntries = queryClient.getQueryData<ACLEntry[]>(
        queryKeys.folderAcl.byFolder(workspaceId, folderId)
      )

      // Optimistically remove
      queryClient.setQueryData<ACLEntry[]>(queryKeys.folderAcl.byFolder(workspaceId, folderId), (old = []) =>
        old.filter(entry => entry.id !== entryId)
      )

      return { previousEntries, folderId }
    },
    onError: (_err, _variables, context) => {
      if (context?.previousEntries) {
        queryClient.setQueryData(
          queryKeys.folderAcl.byFolder(workspaceId, context.folderId),
          context.previousEntries
        )
      }
    },
    onSuccess: (_data, { folderId }) => {
      // Invalidate all ACL-related queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.folderAcl.byFolder(workspaceId, folderId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.folderAcl.count(workspaceId, folderId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.folderAcl.availableSubjects(workspaceId, folderId),
      })
    },
  })
}
