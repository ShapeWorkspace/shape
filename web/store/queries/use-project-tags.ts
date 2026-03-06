import { useEffect, useState } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import type { ClientEntity, DecryptedProjectTag } from "@shape/engine/models/entity"
import type { QueryEntitiesAndCache } from "../../../engine/usecase/entities/entities"
import { useEngineStore } from "../engine-store"
import { queryKeys } from "./query-keys"

function isProjectTagEntity(entity: ClientEntity): entity is DecryptedProjectTag {
  return entity.entityType === "project-tag"
}

type EntityQueryNode = Parameters<QueryEntitiesAndCache["execute"]>[0]

function buildProjectTagsQuery(projectId: string): EntityQueryNode {
  return {
    type: "group",
    operator: "and",
    children: [
      {
        type: "predicate",
        field: "entity_type",
        operator: "eq",
        value: "project-tag",
      },
      {
        type: "predicate",
        field: "parent_id",
        operator: "eq",
        value: projectId,
      },
    ],
  }
}

/**
 * Query hook for fetching all tags for a project.
 *
 * Architecture: Entity cache is the source of truth.
 * - Data comes from the project tag index via useState + subscription
 * - React Query only manages async state (loading, error, refetch)
 */
export function useProjectTags(projectId: string) {
  const { globalClient, application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const cacheStores = application?.getCacheStores() ?? null

  const [tags, setTags] = useState<DecryptedProjectTag[]>(() => {
    if (!cacheStores || !projectId) return []
    return cacheStores.projectTagIndex.get(projectId).filter(isProjectTagEntity)
  })

  useEffect(() => {
    if (!cacheStores || !projectId) return
    const unsubscribe = cacheStores.projectTagIndex.subscribe(projectId, updatedTags => {
      setTags(updatedTags.filter(isProjectTagEntity))
    })
    return unsubscribe
  }, [cacheStores, projectId])

  // Reset tags when projectId changes to prevent showing stale tags
  useEffect(() => {
    if (!cacheStores || !projectId) {
      setTags([])
      return
    }
    setTags(cacheStores.projectTagIndex.get(projectId).filter(isProjectTagEntity))
  }, [cacheStores, projectId])

  const { isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.projectTags.byProject(workspaceId, projectId),
    queryFn: async () => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return null
      }

      const queryEntities = application.getQueryEntities()
      const result = await queryEntities.execute(buildProjectTagsQuery(projectId))
      if (result.isFailed()) {
        throw new Error(result.getError())
      }
      return null
    },
    enabled:
      !!globalClient &&
      !!application &&
      !!projectId &&
      application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })

  return {
    data: tags,
    isLoading: isLoading && tags.length === 0,
    isFetching,
    isError,
    error,
    refetch,
  }
}

/**
 * Mutation hook for creating a new project tag.
 * Entity drafts + cache updates are handled by the engine.
 */
export function useCreateProjectTag() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ projectId, name, color }: { projectId: string; name: string; color: string }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      // Fetch parent project entity for key derivation
      const parentResult = await application.getGetOrFetchEntity().execute(projectId)
      if (parentResult.isFailed()) {
        throw new Error(parentResult.getError())
      }

      const createEntity = application.getCreateEntity()
      const result = await createEntity.execute({
        entityType: "project-tag",
        parent: parentResult.getValue(),
        content: { name, color },
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return result.getValue()
    },
  })
}

/**
 * Mutation hook for updating an existing project tag.
 * Entity drafts + cache updates are handled by the engine.
 */
export function useUpdateProjectTag() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({
      tagId,
      name,
      color,
    }: {
      projectId: string
      tagId: string
      name: string
      color: string
    }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const updateEntity = application.getUpdateEntity()
      const result = await updateEntity.execute({
        id: tagId,
        content: { name, color },
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return result.getValue()
    },
  })
}

/**
 * Mutation hook for deleting a project tag.
 * Entity drafts + cache updates are handled by the engine.
 */
export function useDeleteProjectTag() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ tagId }: { projectId: string; tagId: string }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const deleteEntity = application.getDeleteEntity()
      const result = await deleteEntity.execute(tagId)

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return { tagId }
    },
  })
}
