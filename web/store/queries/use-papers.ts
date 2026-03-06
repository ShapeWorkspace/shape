import { useState, useEffect, useCallback } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import type { BlockDraft, ClientEntity, DecryptedPaper, ServerBlock } from "@shape/engine/models/entity"
import type { QueryEntitiesAndCache } from "../../../engine/usecase/entities/entities"
import { useEngineStore } from "../engine-store"
import { queryKeys } from "./query-keys"

function isPaperEntity(entity: ClientEntity): entity is DecryptedPaper {
  return entity.entityType === "paper"
}

type EntityQueryNode = Parameters<QueryEntitiesAndCache["execute"]>[0]

function buildPapersQuery(): EntityQueryNode {
  return {
    type: "predicate",
    field: "entity_type",
    operator: "eq",
    value: "paper",
  }
}

function mapDraftBlockToServerBlock(draft: BlockDraft): ServerBlock {
  return {
    id: draft.id,
    entity_id: draft.entityId,
    entity_type: draft.entityType,
    entity_field: draft.entityField,
    author_id: "",
    encrypted_data: draft.encryptedData,
    data_version: draft.dataVersion,
    created_at: draft.createdAt,
  }
}

async function getPaperBlocksIncludingDrafts(
  application: NonNullable<ReturnType<typeof useEngineStore.getState>["application"]>,
  paperId: string
): Promise<ServerBlock[]> {
  const repositoryStore = application.getRepositoryStore()
  const [blocks, draftBlocks] = await Promise.all([
    repositoryStore.blockRepository.getBlocksByEntity(paperId),
    repositoryStore.draftBlockRepository.getBlocks(),
  ])

  const draftBlocksForPaper = draftBlocks.filter(block => block.entityId === paperId)
  const mergedBlocks = [...blocks, ...draftBlocksForPaper.map(mapDraftBlockToServerBlock)]
  mergedBlocks.sort((left, right) => left.created_at.localeCompare(right.created_at))
  return mergedBlocks
}

/**
 * Query hook for fetching all papers in the current workspace.
 *
 * Architecture: Entity cache is the source of truth.
 * - Data comes from entity store via useState + subscription
 * - React Query only manages async state (loading, error, refetch)
 */
export function usePapers() {
  const { globalClient, application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const cacheStores = application?.getCacheStores() ?? null

  const [papers, setPapers] = useState<DecryptedPaper[]>(() => {
    if (!cacheStores) return []
    return cacheStores.entityStore.getAllByEntityType("paper").filter(isPaperEntity)
  })

  useEffect(() => {
    if (!cacheStores) return
    const unsubscribe = cacheStores.entityStore.subscribeToEntityType("paper", updatedEntities => {
      setPapers(updatedEntities.filter(isPaperEntity))
    })
    return unsubscribe
  }, [cacheStores])

  useEffect(() => {
    if (!cacheStores) {
      setPapers([])
      return
    }
    setPapers(cacheStores.entityStore.getAllByEntityType("paper").filter(isPaperEntity))
  }, [cacheStores])

  const { isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.papers.byWorkspace(workspaceId),
    queryFn: async () => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return null
      }

      const queryEntities = application.getQueryEntities()
      const result = await queryEntities.execute(buildPapersQuery())
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
    data: papers,
    isLoading: isLoading && papers.length === 0,
    isFetching,
    isError,
    error,
    refetch,
  }
}

/**
 * Query hook for fetching a single paper by ID.
 */
export function usePaper(paperId: string) {
  const { globalClient, application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const cacheStores = application?.getCacheStores() ?? null

  const [paper, setPaper] = useState<DecryptedPaper | null>(() => {
    if (!cacheStores || !paperId) return null
    const cached = cacheStores.entityStore.get(paperId)
    return cached && isPaperEntity(cached) ? cached : null
  })

  useEffect(() => {
    if (!cacheStores) return
    const unsubscribe = cacheStores.entityStore.subscribeToEntityType("paper", updatedEntities => {
      const found = updatedEntities.find(e => e.id === paperId)
      setPaper(found && isPaperEntity(found) ? found : null)
    })
    return unsubscribe
  }, [cacheStores, paperId])

  useEffect(() => {
    if (!cacheStores || !paperId) {
      setPaper(null)
      return
    }
    const cached = cacheStores.entityStore.get(paperId)
    setPaper(cached && isPaperEntity(cached) ? cached : null)
  }, [cacheStores, paperId])

  const { isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.papers.detail(workspaceId, paperId),
    queryFn: async () => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return null
      }

      const queryEntity = application.getQueryEntityById()
      const result = await queryEntity.execute(paperId)
      if (result.isFailed()) {
        throw new Error(result.getError())
      }
      return null
    },
    enabled:
      !!globalClient &&
      !!application &&
      !!paperId &&
      application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })

  return {
    data: paper,
    isLoading: isLoading && !paper,
    isError,
    error,
    refetch,
  }
}

/**
 * Query hook for fetching blocks for a paper.
 * Blocks are fetched from local repository (populated by sync / QueryEntityById).
 */
export function usePaperBlocks(paperId: string) {
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useQuery<ServerBlock[]>({
    queryKey: queryKeys.papers.blocks(workspaceId, paperId),
    queryFn: async () => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const mergedBlocks = await getPaperBlocksIncludingDrafts(application, paperId)
      if (!application.isWorkspaceRemote()) {
        return mergedBlocks
      }

      // Prefer local blocks/drafts immediately and refresh in the background.
      if (mergedBlocks.length > 0) {
        void application
          .getQueryEntityById()
          .execute(paperId)
          .catch(() => {})
        return mergedBlocks
      }

      const fetchResult = await application.getQueryEntityById().execute(paperId)
      if (fetchResult.isFailed()) {
        throw new Error(fetchResult.getError())
      }

      return await getPaperBlocksIncludingDrafts(application, paperId)
    },
    enabled: !!application && !!paperId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    networkMode: "always",
  })
}

/**
 * Mutation hook for creating a new paper.
 */
export function useCreatePaper() {
  const { application, globalClient } = useEngineStore()
  type CreatePaperInput = {
    name: string
    folderId?: string | null
    id?: string
  }

  const mutation = useMutation({
    mutationFn: async ({ name, folderId, id }: CreatePaperInput) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const createEntity = application.getCreateEntity()
      const result = await createEntity.execute({
        entityType: "paper",
        content: { name },
        id,
        metaFields: folderId ? { folder_id: folderId } : undefined,
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      const entity = result.getValue()
      if (!isPaperEntity(entity)) {
        throw new Error("Unexpected entity type")
      }
      return entity
    },
    networkMode: "always",
  })

  const createOptimistically = useCallback(
    (input: { name: string; folderId?: string | null }) => {
      if (!globalClient) {
        throw new Error("Not initialized")
      }

      const id = globalClient.getCrypto().generateUUID()
      return {
        id,
        name: input.name,
        folderId: input.folderId ?? null,
        promise: mutation.mutateAsync({ ...input, id }),
      }
    },
    [globalClient, mutation]
  )

  return {
    ...mutation,
    createOptimistically,
  }
}

/**
 * Mutation hook for updating a paper's name.
 */
export function useUpdatePaper() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ paperId, name }: { paperId: string; name: string }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const updateEntity = application.getUpdateEntity()
      const result = await updateEntity.execute({
        id: paperId,
        content: { name },
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      const entity = result.getValue()
      if (!isPaperEntity(entity)) {
        throw new Error("Unexpected entity type")
      }
      return entity
    },
    networkMode: "always",
  })
}

/**
 * Mutation hook for updating paper mentions.
 */
export function useUpdatePaperMentions() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ paperId, mentionedUserIds }: { paperId: string; mentionedUserIds: string[] }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const cacheStores = application.getCacheStores()
      const cached = cacheStores.entityStore.get(paperId)
      if (!cached || !isPaperEntity(cached)) {
        throw new Error("Paper not found in cache")
      }

      const updateEntity = application.getUpdateEntity()
      const result = await updateEntity.execute({
        id: paperId,
        content: cached.content,
        mentionedUserIds,
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return null
    },
    networkMode: "always",
  })
}

/**
 * Mutation hook for deleting a paper.
 */
export function useDeletePaper() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async (paperId: string) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const deleteEntity = application.getDeleteEntity()
      const result = await deleteEntity.execute(paperId)

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return paperId
    },
    networkMode: "always",
  })
}

/**
 * Mutation hook for moving a paper to a different folder.
 */
export function useMovePaper() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ paperId, folderId }: { paperId: string; folderId: string | null }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const cacheStores = application.getCacheStores()
      const cached = cacheStores.entityStore.get(paperId)
      if (!cached || !isPaperEntity(cached)) {
        throw new Error("Paper not found in cache")
      }

      const updateEntity = application.getUpdateEntity()
      const result = await updateEntity.execute({
        id: paperId,
        content: cached.content,
        metaFields: { folder_id: folderId ?? undefined },
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      const entity = result.getValue()
      if (!isPaperEntity(entity)) {
        throw new Error("Unexpected entity type")
      }
      return entity
    },
  })
}

/**
 * Mutation hook for creating a paper block draft (encrypted Yjs delta).
 * CreateBlockDraft handles encryption internally.
 */
export function useCreatePaperBlock() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({
      paperId,
      yjsUpdates,
    }: {
      paperId: string
      yjsUpdates: Uint8Array[] | Uint8Array
    }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const createBlockDraft = application.getCreateBlockDraft()
      const result = await createBlockDraft.execute({
        entityId: paperId,
        entityType: "paper",
        yjsUpdates,
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return result.getValue()
    },
    networkMode: "always",
  })
}
