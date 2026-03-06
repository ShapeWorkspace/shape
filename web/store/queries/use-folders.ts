import { useState, useEffect } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import type { ClientEntity, DecryptedFolder } from "@shape/engine/models/entity"
import type { QueryEntitiesAndCache } from "../../../engine/usecase/entities/entities"
import { useEngineStore } from "../engine-store"
import { queryKeys } from "./query-keys"

function isFolderEntity(entity: ClientEntity): entity is DecryptedFolder {
  return entity.entityType === "folder"
}

type EntityQueryNode = Parameters<QueryEntitiesAndCache["execute"]>[0]

function buildFoldersQuery(): EntityQueryNode {
  return {
    type: "predicate",
    field: "entity_type",
    operator: "eq",
    value: "folder",
  }
}

/**
 * Query hook for fetching all folders in the current workspace.
 *
 * Architecture: Entity cache is the source of truth.
 * - Data comes from entity store via useState + subscription
 * - React Query only manages async state (loading, error, refetch)
 */
export function useFolders() {
  const { globalClient, application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const cacheStores = application?.getCacheStores() ?? null

  const [folders, setFolders] = useState<DecryptedFolder[]>(() => {
    if (!cacheStores) return []
    return cacheStores.entityStore.getAllByEntityType("folder").filter(isFolderEntity)
  })

  useEffect(() => {
    if (!cacheStores) return
    const unsubscribe = cacheStores.entityStore.subscribeToEntityType("folder", updatedEntities => {
      setFolders(updatedEntities.filter(isFolderEntity))
    })
    return unsubscribe
  }, [cacheStores])

  useEffect(() => {
    if (!cacheStores) {
      setFolders([])
      return
    }
    setFolders(cacheStores.entityStore.getAllByEntityType("folder").filter(isFolderEntity))
  }, [cacheStores])

  const { isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.folders.byWorkspace(workspaceId),
    queryFn: async () => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return null
      }

      const queryEntities = application.getQueryEntities()
      const result = await queryEntities.execute(buildFoldersQuery())
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
    data: folders,
    isLoading: isLoading && folders.length === 0,
    isFetching,
    isError,
    error,
    refetch,
  }
}

/**
 * Query hook for fetching a single folder by ID.
 */
export function useFolder(folderId: string) {
  const { globalClient, application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const cacheStores = application?.getCacheStores() ?? null

  const [folder, setFolder] = useState<DecryptedFolder | null>(() => {
    if (!cacheStores || !folderId) return null
    const cached = cacheStores.entityStore.get(folderId)
    return cached && isFolderEntity(cached) ? cached : null
  })

  useEffect(() => {
    if (!cacheStores) return
    const unsubscribe = cacheStores.entityStore.subscribeToEntityType("folder", updatedEntities => {
      const found = updatedEntities.find(e => e.id === folderId)
      setFolder(found && isFolderEntity(found) ? found : null)
    })
    return unsubscribe
  }, [cacheStores, folderId])

  useEffect(() => {
    if (!cacheStores || !folderId) {
      setFolder(null)
      return
    }
    const cached = cacheStores.entityStore.get(folderId)
    setFolder(cached && isFolderEntity(cached) ? cached : null)
  }, [cacheStores, folderId])

  const { isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.folders.detail(workspaceId, folderId),
    queryFn: async () => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return null
      }

      const queryEntity = application.getQueryEntityById()
      const result = await queryEntity.execute(folderId)
      if (result.isFailed()) {
        throw new Error(result.getError())
      }
      return null
    },
    enabled: !!globalClient && !!application && !!folderId && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })

  return {
    data: folder,
    isLoading: isLoading && !folder,
    isError,
    error,
    refetch,
  }
}

/**
 * Mutation hook for creating a new folder.
 */
export function useCreateFolder() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ name, parentFolderId }: { name: string; parentFolderId: string | null }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      // If creating inside a parent folder, fetch the parent for key derivation
      let parent: ClientEntity | undefined
      if (parentFolderId) {
        const parentResult = await application.getGetOrFetchEntity().execute(parentFolderId)
        if (parentResult.isFailed()) {
          throw new Error(parentResult.getError())
        }
        parent = parentResult.getValue()
      }

      const createEntity = application.getCreateEntity()
      const result = await createEntity.execute({
        entityType: "folder",
        content: { name },
        parent,
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return result.getValue()
    },
  })
}

/**
 * Mutation hook for renaming a folder.
 */
export function useUpdateFolder() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ folderId, name }: { folderId: string; name: string }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const updateEntity = application.getUpdateEntity()
      const result = await updateEntity.execute({
        id: folderId,
        content: { name },
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return result.getValue()
    },
  })
}

/**
 * Mutation hook for moving a folder to a new parent.
 */
export function useMoveFolder() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ folderId, parentFolderId }: { folderId: string; parentFolderId: string | null }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const cacheStores = application.getCacheStores()
      const cached = cacheStores.entityStore.get(folderId)
      if (!cached || !isFolderEntity(cached)) {
        throw new Error("Folder not found in cache")
      }

      const updateEntity = application.getUpdateEntity()
      const result = await updateEntity.execute({
        id: folderId,
        content: cached.content,
        parentUpdate: parentFolderId
          ? { mode: "set", parent: { id: parentFolderId, type: "folder" as const } }
          : { mode: "clear" },
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return result.getValue()
    },
  })
}

/**
 * Mutation hook for deleting a folder.
 * Deletes the folder and all its contents recursively.
 */
export function useDeleteFolder() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async (folderId: string) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const deleteEntity = application.getDeleteEntity()
      const result = await deleteEntity.execute(folderId)

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return folderId
    },
  })
}
