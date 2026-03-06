import { useEffect, useState, useCallback } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import type { BlockDraft, ClientEntity, DecryptedNote } from "@shape/engine/models/entity"
import type { QueryEntitiesAndCache } from "../../../engine/usecase/entities/entities"
import type { ServerBlock } from "../../../engine/models/entity"
import { useEngineStore } from "../engine-store"
import { queryKeys } from "./query-keys"
import { Note } from "../types"

function isNoteEntity(entity: ClientEntity): entity is DecryptedNote {
  return entity.entityType === "note"
}

type EntityQueryNode = Parameters<QueryEntitiesAndCache["execute"]>[0]

function buildNotesQuery(): EntityQueryNode {
  return {
    type: "predicate",
    field: "entity_type",
    operator: "eq",
    value: "note",
  }
}

/**
 * Converts a DecryptedNote entity to a store Note for UI consumption.
 */
function entityToStoreNote(entity: DecryptedNote): Note {
  return {
    id: entity.id,
    title: entity.content.title,
    contentHash: entity.contentHash,
    pinned: false,
    tags: [],
    createdAt: entity.createdAt.getTime(),
    updatedAt: entity.updatedAt.getTime(),
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

async function getNoteBlocksIncludingDrafts(
  application: NonNullable<ReturnType<typeof useEngineStore.getState>["application"]>,
  noteId: string
): Promise<ServerBlock[]> {
  const repositoryStore = application.getRepositoryStore()
  const [blocks, draftBlocks] = await Promise.all([
    repositoryStore.blockRepository.getBlocksByEntity(noteId),
    repositoryStore.draftBlockRepository.getBlocks(),
  ])

  const draftBlocksForNote = draftBlocks.filter(block => block.entityId === noteId)
  const mergedBlocks = [...blocks, ...draftBlocksForNote.map(mapDraftBlockToServerBlock)]
  mergedBlocks.sort((left, right) => left.created_at.localeCompare(right.created_at))
  return mergedBlocks
}

/**
 * Query hook for fetching all notes in the current workspace.
 *
 * Architecture: Entity cache is the source of truth.
 * - Data comes from the entity store via useState + subscription
 * - React Query only manages async state (loading, error, refetch)
 */
export function useNotes() {
  const { globalClient, application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const cacheStores = application?.getCacheStores() ?? null

  const [notes, setNotes] = useState<Note[]>(() => {
    if (!cacheStores) return []
    return cacheStores.entityStore.getAllByEntityType("note").filter(isNoteEntity).map(entityToStoreNote)
  })

  useEffect(() => {
    if (!cacheStores) return
    const unsubscribe = cacheStores.entityStore.subscribeToEntityType("note", updatedEntities => {
      setNotes(updatedEntities.filter(isNoteEntity).map(entityToStoreNote))
    })
    return unsubscribe
  }, [cacheStores])

  useEffect(() => {
    if (!cacheStores) {
      setNotes([])
      return
    }
    setNotes(cacheStores.entityStore.getAllByEntityType("note").filter(isNoteEntity).map(entityToStoreNote))
  }, [cacheStores])

  const { isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.notes.byWorkspace(workspaceId),
    queryFn: async () => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return null
      }

      const queryEntities = application.getQueryEntities()
      const result = await queryEntities.execute(buildNotesQuery())
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
    data: notes,
    isLoading: isLoading && notes.length === 0,
    isFetching,
    isError,
    error,
    refetch,
  }
}

/**
 * Query hook for fetching a single note by ID.
 * Returns the note from the entity cache.
 */
export function useNote(noteId: string) {
  const { globalClient, application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const cacheStores = application?.getCacheStores() ?? null

  const [note, setNote] = useState<Note | null>(() => {
    if (!cacheStores || !noteId) return null
    const cached = cacheStores.entityStore.get(noteId)
    return cached && isNoteEntity(cached) ? entityToStoreNote(cached) : null
  })

  useEffect(() => {
    if (!cacheStores || !noteId) return
    const unsubscribe = cacheStores.entityStore.subscribeToEntityType("note", updatedEntities => {
      const found = updatedEntities.find(entity => entity.id === noteId)
      setNote(found && isNoteEntity(found) ? entityToStoreNote(found) : null)
    })
    return unsubscribe
  }, [cacheStores, noteId])

  useEffect(() => {
    if (!cacheStores || !noteId) {
      setNote(null)
      return
    }
    const cached = cacheStores.entityStore.get(noteId)
    setNote(cached && isNoteEntity(cached) ? entityToStoreNote(cached) : null)
  }, [cacheStores, noteId])

  const { isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.notes.detail(workspaceId, noteId),
    queryFn: async () => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return null
      }

      const queryEntity = application.getQueryEntityById()
      const result = await queryEntity.execute(noteId)
      if (result.isFailed()) {
        throw new Error(result.getError())
      }
      return null
    },
    enabled:
      !!globalClient &&
      !!application &&
      !!noteId &&
      application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })

  return {
    data: note,
    isLoading: isLoading && !note,
    isError,
    error,
    refetch,
  }
}

/**
 * Mutation hook for creating a new note.
 * Entity drafts + cache updates are handled by the engine.
 */
export function useCreateNote() {
  const { application, globalClient } = useEngineStore()
  type CreateNoteInput = {
    title: string
    id?: string
  }

  const mutation = useMutation({
    mutationFn: async (input: CreateNoteInput) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const createEntity = application.getCreateEntity()
      const result = await createEntity.execute({
        entityType: "note",
        content: { title: input.title },
        id: input.id,
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      const entity = result.getValue()
      if (!isNoteEntity(entity)) {
        throw new Error("Created entity is not a note")
      }

      return entityToStoreNote(entity)
    },
    // Allow draft-backed creation while offline (no network required).
    networkMode: "always",
  })

  const createOptimistically = useCallback(
    (input: { title: string }) => {
      if (!globalClient) {
        throw new Error("Not initialized")
      }

      const id = globalClient.getCrypto().generateUUID()
      return {
        id,
        title: input.title,
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
 * Mutation hook for updating an existing note.
 * Entity drafts + cache updates are handled by the engine.
 */
export function useUpdateNote() {
  const { application } = useEngineStore()
  const cacheStores = application?.getCacheStores() ?? null

  const getNoteFromCache = useCallback(
    (noteId: string): DecryptedNote | undefined => {
      if (!cacheStores) return undefined
      const cached = cacheStores.entityStore.get(noteId)
      return cached && isNoteEntity(cached) ? cached : undefined
    },
    [cacheStores]
  )

  return useMutation({
    mutationFn: async ({
      noteId,
      updates,
    }: {
      noteId: string
      updates: Partial<Note>
    }) => {
      const { title } = updates
      if (!application) {
        throw new Error("Not initialized")
      }

      const cachedNote = getNoteFromCache(noteId)

      if (title === undefined) {
        if (!cachedNote) {
          throw new Error("Note not found in cache")
        }
        return {
          id: noteId,
          title: cachedNote.content.title,
          contentHash: cachedNote.contentHash,
        }
      }

      const updateEntity = application.getUpdateEntity()
      const result = await updateEntity.execute({
        id: noteId,
        content: { title: title ?? cachedNote?.content.title ?? "" },
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      const updatedEntity = result.getValue()

      return {
        id: noteId,
        title: isNoteEntity(updatedEntity) ? updatedEntity.content.title : title ?? "",
        contentHash: updatedEntity.contentHash,
      }
    },
    // Ensure title updates persist as drafts when offline.
    networkMode: "always",
  })
}

/**
 * Mutation hook for deleting a note.
 * Entity drafts + cache updates are handled by the engine.
 */
export function useDeleteNote() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async (noteId: string) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const deleteEntity = application.getDeleteEntity()
      const result = await deleteEntity.execute(noteId)

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return noteId
    },
    // Allow delete drafts to be created while offline.
    networkMode: "always",
  })
}

/**
 * Options for fetching note blocks.
 */
interface UseNoteBlocksOptions {
  /** When false, the query is disabled (no network or cache read). */
  enabled?: boolean
}

/**
 * Query hook for fetching note blocks (Yjs deltas).
 * Used when opening a note to load existing content.
 * Blocks are fetched from local repository (populated by sync / QueryEntityById).
 */
export function useNoteBlocks(noteId: string, options?: UseNoteBlocksOptions) {
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const shouldEnableQuery = options?.enabled ?? true

  return useQuery<ServerBlock[]>({
    queryKey: queryKeys.notes.blocks(workspaceId, noteId),
    queryFn: async () => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const mergedBlocks = await getNoteBlocksIncludingDrafts(application, noteId)
      if (!application.isWorkspaceRemote()) {
        return mergedBlocks
      }

      // Prefer local cache/drafts immediately; refresh remote in the background.
      if (mergedBlocks.length > 0) {
        void application
          .getQueryEntityById()
          .execute(noteId)
          .catch(() => {})
        return mergedBlocks
      }

      const fetchResult = await application.getQueryEntityById().execute(noteId)
      if (fetchResult.isFailed()) {
        throw new Error(fetchResult.getError())
      }

      return await getNoteBlocksIncludingDrafts(application, noteId)
    },
    enabled: !!application && !!noteId && shouldEnableQuery,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    // Allow loading cached/draft blocks while offline.
    networkMode: "always",
  })
}

/**
 * Query hook for fetching note blocks from cache only (no network).
 * Used for lightweight list previews to avoid N+1 requests.
 */
export function useNoteBlocksFromCacheOnly(noteId: string, options?: UseNoteBlocksOptions) {
  const { application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const shouldEnableQuery = options?.enabled ?? true

  return useQuery<ServerBlock[]>({
    queryKey: queryKeys.notes.blocksCacheOnly(workspaceId, noteId),
    queryFn: async () => {
      if (!application) {
        throw new Error("Not initialized")
      }

      return await getNoteBlocksIncludingDrafts(application, noteId)
    },
    enabled: !!application && !!noteId && shouldEnableQuery,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    // Allow cached/draft blocks even while offline.
    networkMode: "always",
  })
}

/**
 * Mutation hook for creating a note block draft (encrypted Yjs delta).
 * CreateBlockDraft handles encryption internally.
 */
export function useCreateNoteBlock() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ noteId, yjsUpdates }: { noteId: string; yjsUpdates: Uint8Array[] | Uint8Array }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const createBlockDraft = application.getCreateBlockDraft()
      const result = await createBlockDraft.execute({
        entityId: noteId,
        entityType: "note",
        yjsUpdates,
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return result.getValue()
    },
    // Persist Yjs deltas into draft blocks when offline.
    networkMode: "always",
  })
}
