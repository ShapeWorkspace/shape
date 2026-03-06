import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useEngineStore } from "../engine-store"
import { queryKeys } from "./query-keys"
import type { ACLEntry, ACLPermission, ACLSubjectType } from "../../../engine/models/acl-entry"
import type { AvailableSubjects } from "../../../engine/models/team"

/**
 * Query hook for fetching ACL entries for a project.
 * Returns list of users and teams with access to the project.
 */
export function useProjectACLEntries(projectId: string) {
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useQuery({
    queryKey: queryKeys.projectAcl.byProject(workspaceId, projectId),
    queryFn: async () => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const entriesResult = await application.getGetEntityACLEntries().execute({ entityId: projectId })
      if (entriesResult.isFailed()) {
        throw new Error(entriesResult.getError())
      }
      return entriesResult.getValue()
    },
    enabled: !!application && !!projectId && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })
}

/**
 * Query hook for fetching the member count for a project.
 * Expands team memberships to count individual users.
 */
export function useProjectACLMemberCount(projectId: string) {
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useQuery({
    queryKey: queryKeys.projectAcl.count(workspaceId, projectId),
    queryFn: async () => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const countResult = await application.getGetEntityACLMemberCount().execute({ entityId: projectId })
      if (countResult.isFailed()) {
        throw new Error(countResult.getError())
      }
      return countResult.getValue()
    },
    enabled: !!application && !!projectId && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })
}

/**
 * Query hook for fetching teams and members that can be added to a project.
 * Excludes subjects that already have access.
 */
export function useAvailableSubjectsForProject(projectId: string) {
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useQuery({
    queryKey: queryKeys.projectAcl.availableSubjects(workspaceId, projectId),
    queryFn: async (): Promise<AvailableSubjects> => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const subjectsResult = await application.getGetAvailableSubjectsForEntity().execute({ entityId: projectId })
      if (subjectsResult.isFailed()) {
        throw new Error(subjectsResult.getError())
      }
      return subjectsResult.getValue()
    },
    enabled: !!application && !!projectId && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })
}

/**
 * Options for creating an ACL entry.
 */
interface CreateACLEntryOptions {
  projectId: string
  subjectType: ACLSubjectType
  subjectId: string
  permission: ACLPermission
}

/**
 * Mutation hook for creating a new ACL entry.
 * Grants a user or team access to a project.
 */
export function useCreateProjectACLEntry() {
  const queryClient = useQueryClient()
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useMutation({
    mutationFn: async ({ projectId, subjectType, subjectId, permission }: CreateACLEntryOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application?.isWorkspaceRemote()) {
        throw new Error("Project sharing is unavailable in local-only workspaces")
      }

      const createResult = await application.getCreateEntityACLEntry().execute({
        entityId: projectId,
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
      // Invalidate all ACL-related queries for this project
      queryClient.invalidateQueries({
        queryKey: queryKeys.projectAcl.byProject(workspaceId, variables.projectId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.projectAcl.count(workspaceId, variables.projectId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.projectAcl.availableSubjects(workspaceId, variables.projectId),
      })
    },
  })
}

/**
 * Options for updating an ACL entry.
 */
interface UpdateACLEntryOptions {
  projectId: string
  entryId: string
  permission: ACLPermission
}

/**
 * Mutation hook for updating an ACL entry's permission level.
 */
export function useUpdateProjectACLEntry() {
  const queryClient = useQueryClient()
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useMutation({
    mutationFn: async ({ projectId, entryId, permission }: UpdateACLEntryOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application?.isWorkspaceRemote()) {
        throw new Error("Project sharing is unavailable in local-only workspaces")
      }

      const updateResult = await application.getUpdateEntityACLEntry().execute({
        entityId: projectId,
        entryId,
        permission,
      })
      if (updateResult.isFailed()) {
        throw new Error(updateResult.getError())
      }
      return updateResult.getValue()
    },
    onMutate: async ({ projectId, entryId, permission }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: queryKeys.projectAcl.byProject(workspaceId, projectId),
      })

      // Snapshot previous value
      const previousEntries = queryClient.getQueryData<ACLEntry[]>(
        queryKeys.projectAcl.byProject(workspaceId, projectId)
      )

      // Optimistically update
      queryClient.setQueryData<ACLEntry[]>(
        queryKeys.projectAcl.byProject(workspaceId, projectId),
        (old = []) => old.map(entry => (entry.id === entryId ? { ...entry, permission } : entry))
      )

      return { previousEntries, projectId }
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousEntries) {
        queryClient.setQueryData(
          queryKeys.projectAcl.byProject(workspaceId, context.projectId),
          context.previousEntries
        )
      }
    },
    onSuccess: (_data, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.projectAcl.byProject(workspaceId, projectId),
      })
    },
  })
}

/**
 * Options for deleting an ACL entry.
 */
interface DeleteACLEntryOptions {
  projectId: string
  entryId: string
}

/**
 * Mutation hook for deleting an ACL entry.
 * Revokes access for a user or team.
 */
export function useDeleteProjectACLEntry() {
  const queryClient = useQueryClient()
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useMutation({
    mutationFn: async ({ projectId, entryId }: DeleteACLEntryOptions) => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application?.isWorkspaceRemote()) {
        throw new Error("Project sharing is unavailable in local-only workspaces")
      }

      const deleteResult = await application.getDeleteEntityACLEntry().execute({ entityId: projectId, entryId })
      if (deleteResult.isFailed()) {
        throw new Error(deleteResult.getError())
      }

      return { projectId, entryId }
    },
    onMutate: async ({ projectId, entryId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: queryKeys.projectAcl.byProject(workspaceId, projectId),
      })

      // Snapshot previous value
      const previousEntries = queryClient.getQueryData<ACLEntry[]>(
        queryKeys.projectAcl.byProject(workspaceId, projectId)
      )

      // Optimistically remove
      queryClient.setQueryData<ACLEntry[]>(
        queryKeys.projectAcl.byProject(workspaceId, projectId),
        (old = []) => old.filter(entry => entry.id !== entryId)
      )

      return { previousEntries, projectId }
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousEntries) {
        queryClient.setQueryData(
          queryKeys.projectAcl.byProject(workspaceId, context.projectId),
          context.previousEntries
        )
      }
    },
    onSuccess: (_data, { projectId }) => {
      // Invalidate all ACL-related queries
      queryClient.invalidateQueries({
        queryKey: queryKeys.projectAcl.byProject(workspaceId, projectId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.projectAcl.count(workspaceId, projectId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.projectAcl.availableSubjects(workspaceId, projectId),
      })
    },
  })
}

/**
 * Query hook for fetching all teams in the current workspace.
 */
export function useWorkspaceTeams() {
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useQuery({
    queryKey: queryKeys.teams.byWorkspace(workspaceId),
    queryFn: async () => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const teamsResult = await application.getGetWorkspaceTeams().execute({ workspaceId })
      if (teamsResult.isFailed()) {
        throw new Error(teamsResult.getError())
      }
      return teamsResult.getValue()
    },
    enabled: !!application && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })
}
