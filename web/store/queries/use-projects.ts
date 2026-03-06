import { useEffect, useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import type { ClientEntity, DecryptedProject } from "@shape/engine/models/entity"
import type { QueryEntitiesAndCache } from "../../../engine/usecase/entities/entities"
import { useEngineStore } from "../engine-store"
import { queryKeys } from "./query-keys"

function isProjectEntity(entity: ClientEntity): entity is DecryptedProject {
  return entity.entityType === "project"
}

type EntityQueryNode = Parameters<QueryEntitiesAndCache["execute"]>[0]

function buildProjectsQuery(): EntityQueryNode {
  return {
    type: "predicate",
    field: "entity_type",
    operator: "eq",
    value: "project",
  }
}

/**
 * Query hook for fetching all projects in the current workspace.
 *
 * Architecture: Entity cache is the source of truth.
 * - Data comes from the entity store via useState + subscription
 * - React Query only manages async state (loading, error, refetch)
 */
export function useProjects() {
  const { globalClient, application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const cacheStores = application?.getCacheStores() ?? null

  const [projects, setProjects] = useState<DecryptedProject[]>(() => {
    if (!cacheStores) return []
    return cacheStores.entityStore.getAllByEntityType("project").filter(isProjectEntity)
  })

  useEffect(() => {
    if (!cacheStores) return
    const unsubscribe = cacheStores.entityStore.subscribeToEntityType("project", updatedEntities => {
      setProjects(updatedEntities.filter(isProjectEntity))
    })
    return unsubscribe
  }, [cacheStores])

  useEffect(() => {
    if (!cacheStores) {
      setProjects([])
      return
    }
    setProjects(cacheStores.entityStore.getAllByEntityType("project").filter(isProjectEntity))
  }, [cacheStores])

  const { isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.projects.byWorkspace(workspaceId),
    queryFn: async () => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return null
      }

      const queryEntities = application.getQueryEntities()
      const result = await queryEntities.execute(buildProjectsQuery())
      if (result.isFailed()) {
        throw new Error(result.getError())
      }
      return null
    },
    enabled: !!globalClient && !!application && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })

  return {
    data: projects,
    isLoading: isLoading && projects.length === 0,
    isFetching,
    isError,
    error,
    refetch,
  }
}

/**
 * Query hook for fetching a single project by ID.
 */
export function useProject(projectId: string) {
  const { globalClient, application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const cacheStores = application?.getCacheStores() ?? null

  const [project, setProject] = useState<DecryptedProject | null>(() => {
    if (!cacheStores || !projectId) return null
    const cached = cacheStores.entityStore.get(projectId)
    return cached && isProjectEntity(cached) ? cached : null
  })

  useEffect(() => {
    if (!cacheStores || !projectId) return
    const unsubscribe = cacheStores.entityStore.subscribeToEntityType("project", updatedEntities => {
      const found = updatedEntities.find(entity => entity.id === projectId)
      setProject(found && isProjectEntity(found) ? found : null)
    })
    return unsubscribe
  }, [cacheStores, projectId])

  useEffect(() => {
    if (!cacheStores || !projectId) {
      setProject(null)
      return
    }
    const cached = cacheStores.entityStore.get(projectId)
    setProject(cached && isProjectEntity(cached) ? cached : null)
  }, [cacheStores, projectId])

  const { isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.projects.detail(workspaceId, projectId),
    queryFn: async () => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return null
      }

      const queryEntity = application.getQueryEntityById()
      const result = await queryEntity.execute(projectId)
      if (result.isFailed()) {
        throw new Error(result.getError())
      }
      return null
    },
    enabled: !!globalClient && !!application && !!projectId && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })

  return {
    data: project,
    isLoading: isLoading && !project,
    isError,
    error,
    refetch,
  }
}

/**
 * Mutation hook for creating a new project.
 * Entity drafts + cache updates are handled by the engine.
 */
export function useCreateProject() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async (name: string) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const createEntity = application.getCreateEntity()
      const result = await createEntity.execute({
        entityType: "project",
        content: { name },
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return result.getValue()
    },
    // Allow draft-backed creation while offline.
    networkMode: "always",
  })
}

/**
 * Mutation hook for updating an existing project.
 * Entity drafts + cache updates are handled by the engine.
 */
export function useUpdateProject() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({
      projectId,
      name,
    }: {
      projectId: string
      name: string
    }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const updateEntity = application.getUpdateEntity()
      const result = await updateEntity.execute({
        id: projectId,
        content: { name },
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return result.getValue()
    },
    // Ensure updates persist as drafts when offline.
    networkMode: "always",
  })
}

/**
 * Mutation hook for deleting a project.
 * Entity drafts + cache updates are handled by the engine.
 */
export function useDeleteProject() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async (projectId: string) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const deleteEntity = application.getDeleteEntity()
      const result = await deleteEntity.execute(projectId)

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return projectId
    },
    // Allow delete drafts to be created while offline.
    networkMode: "always",
  })
}
