import { useState, useEffect, useCallback } from "react"
import { useQuery, useMutation } from "@tanstack/react-query"
import type { ClientEntity, DecryptedFile } from "@shape/engine/models/entity"
import type { EntityType } from "@shape/engine/utils/encryption-types"
import type { QueryEntitiesAndCache } from "../../../engine/usecase/entities/entities"
import type { ProgressCallback, UploadStreamSource } from "../../../engine/usecase/files/files"
import { useEngineStore } from "../engine-store"
import { queryKeys } from "./query-keys"

function isFileEntity(entity: ClientEntity): entity is DecryptedFile {
  return entity.entityType === "file"
}

type EntityQueryNode = Parameters<QueryEntitiesAndCache["execute"]>[0]

function buildFilesQuery(): EntityQueryNode {
  return {
    type: "predicate",
    field: "entity_type",
    operator: "eq",
    value: "file",
  }
}

function buildFilesByEntityQuery(entityId: string): EntityQueryNode {
  return {
    type: "group",
    operator: "and",
    children: [
      {
        type: "predicate",
        field: "entity_type",
        operator: "eq",
        value: "file",
      },
      {
        type: "predicate",
        field: "parent_id",
        operator: "eq",
        value: entityId,
      },
    ],
  }
}

/**
 * Query hook for fetching all files in the current workspace.
 * Excludes entity-bound files (e.g., paper attachments) by default.
 *
 * Architecture: Entity cache is the source of truth.
 * - Data comes from entity store via useState + subscription
 * - React Query only manages async state (loading, error, refetch)
 */
export function useFiles() {
  const { globalClient, application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const cacheStores = application?.getCacheStores() ?? null

  const [files, setFiles] = useState<DecryptedFile[]>(() => {
    if (!cacheStores) return []
    return cacheStores.entityStore.getAllByEntityType("file").filter(isFileEntity)
  })

  useEffect(() => {
    if (!cacheStores) return
    const unsubscribe = cacheStores.entityStore.subscribeToEntityType("file", updatedEntities => {
      setFiles(updatedEntities.filter(isFileEntity))
    })
    return unsubscribe
  }, [cacheStores])

  useEffect(() => {
    if (!cacheStores) {
      setFiles([])
      return
    }
    setFiles(cacheStores.entityStore.getAllByEntityType("file").filter(isFileEntity))
  }, [cacheStores])

  const { isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.files.byWorkspace(workspaceId),
    queryFn: async () => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return null
      }

      const queryEntities = application.getQueryEntities()
      const result = await queryEntities.execute(buildFilesQuery())
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
    data: files,
    isLoading: isLoading && files.length === 0,
    isFetching,
    isError,
    error,
    refetch,
  }
}

/**
 * Query hook for fetching files bound to a specific entity (e.g., paper attachments).
 */
export function useFilesByEntity(entityId: string, entityType: string) {
  const { globalClient, application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const cacheStores = application?.getCacheStores() ?? null

  const [files, setFiles] = useState<DecryptedFile[]>(() => {
    if (!cacheStores || !entityId) return []
    return cacheStores.entityStore
      .getAllByEntityType("file")
      .filter(isFileEntity)
      .filter(f => f.parentId === entityId)
  })

  useEffect(() => {
    if (!cacheStores || !entityId) return
    const unsubscribe = cacheStores.entityStore.subscribeToEntityType("file", updatedEntities => {
      setFiles(
        updatedEntities
          .filter(isFileEntity)
          .filter(f => f.parentId === entityId)
      )
    })
    return unsubscribe
  }, [cacheStores, entityId])

  useEffect(() => {
    if (!cacheStores || !entityId) {
      setFiles([])
      return
    }
    setFiles(
      cacheStores.entityStore
        .getAllByEntityType("file")
        .filter(isFileEntity)
        .filter(f => f.parentId === entityId)
    )
  }, [cacheStores, entityId])

  const { isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.files.byEntity(workspaceId, entityId, entityType),
    queryFn: async () => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return null
      }

      const queryEntities = application.getQueryEntities()
      const result = await queryEntities.execute(buildFilesByEntityQuery(entityId))
      if (result.isFailed()) {
        throw new Error(result.getError())
      }
      return null
    },
    enabled:
      !!globalClient &&
      !!application &&
      !!entityId &&
      !!entityType &&
      application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })

  return {
    data: files,
    isLoading: isLoading && files.length === 0,
    isFetching,
    isError,
    error,
    refetch,
  }
}

/**
 * Query hook for fetching a single file by ID.
 */
export function useFile(fileId: string) {
  const { globalClient, application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""
  const cacheStores = application?.getCacheStores() ?? null

  const [file, setFile] = useState<DecryptedFile | null>(() => {
    if (!cacheStores || !fileId) return null
    const cached = cacheStores.entityStore.get(fileId)
    return cached && isFileEntity(cached) ? cached : null
  })

  useEffect(() => {
    if (!cacheStores) return
    const unsubscribe = cacheStores.entityStore.subscribeToEntityType("file", updatedEntities => {
      const found = updatedEntities.find(e => e.id === fileId)
      setFile(found && isFileEntity(found) ? found : null)
    })
    return unsubscribe
  }, [cacheStores, fileId])

  useEffect(() => {
    if (!cacheStores || !fileId) {
      setFile(null)
      return
    }
    const cached = cacheStores.entityStore.get(fileId)
    setFile(cached && isFileEntity(cached) ? cached : null)
  }, [cacheStores, fileId])

  const { isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.files.detail(workspaceId, fileId),
    queryFn: async () => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        return null
      }

      const queryEntity = application.getQueryEntityById()
      const result = await queryEntity.execute(fileId)
      if (result.isFailed()) {
        throw new Error(result.getError())
      }
      return null
    },
    enabled: !!globalClient && !!application && !!fileId && application?.isWorkspaceRemote(),
    staleTime: 0,
    networkMode: "always",
  })

  return {
    data: file,
    isLoading: isLoading && !file,
    isError,
    error,
    refetch,
  }
}

/**
 * Mutation hook for uploading a new file.
 * Uses the engine's UploadFile use case which handles encryption + chunking.
 */
export function useUploadFile() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({
      file,
      folderId,
      onProgress,
    }: {
      file: File
      folderId: string | null
      onProgress?: ProgressCallback
    }) => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        throw new Error("File uploads are unavailable in local-only workspaces")
      }

      const uploadFile = application.getUploadFile()
      const result = await uploadFile.execute({
        rawFile: file,
        onProgress,
        parentEntity: folderId ? { id: folderId, type: "folder" } : undefined,
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return result.getValue()
    },
  })
}

/**
 * Mutation hook for uploading a file from a stream (recordings).
 */
export function useUploadFileFromStream() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({
      streamSource,
      fileName,
      mimeType,
      folderId,
      onProgress,
    }: {
      streamSource: UploadStreamSource
      fileName: string
      mimeType: string
      folderId: string | null
      onProgress?: ProgressCallback
    }) => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        throw new Error("File uploads are unavailable in local-only workspaces")
      }

      const uploadFileFromStream = application.getUploadFileFromStream()
      const result = await uploadFileFromStream.execute({
        uploadSource: streamSource,
        uploadName: fileName,
        uploadMimeType: mimeType,
        onProgress,
        parentEntity: folderId ? { id: folderId, type: "folder" } : undefined,
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return result.getValue()
    },
  })
}

/**
 * Mutation hook for uploading a file bound to an entity (e.g., paper attachment).
 * Entity-bound files are NOT added to the Files tool cache since they are hidden there.
 */
export function useUploadFileWithEntityBinding() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({
      file,
      entityId,
      entityType,
      onProgress,
    }: {
      file: File
      entityId: string
      entityType: string
      onProgress?: ProgressCallback
    }) => {
      if (!application) {
        throw new Error("Not initialized")
      }
      if (!application.isWorkspaceRemote()) {
        throw new Error("File uploads are unavailable in local-only workspaces")
      }

      const uploadFile = application.getUploadFile()
      const result = await uploadFile.execute({
        rawFile: file,
        onProgress,
        parentEntity: { id: entityId, type: entityType as EntityType },
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return result.getValue()
    },
  })
}

/**
 * Mutation hook for renaming a file.
 */
export function useUpdateFile() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({
      fileId,
      name,
      mimeType,
    }: {
      fileId: string
      name: string
      mimeType: string
    }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const updateEntity = application.getUpdateEntity()
      const result = await updateEntity.execute({
        id: fileId,
        content: { name, mimeType },
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return result.getValue()
    },
  })
}

/**
 * Mutation hook for deleting a file.
 */
export function useDeleteFile() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async (fileId: string) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const deleteEntity = application.getDeleteEntity()
      const result = await deleteEntity.execute(fileId)

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      return fileId
    },
  })
}

/**
 * Mutation hook for moving a file to a different folder.
 */
export function useMoveFile() {
  const { application } = useEngineStore()

  return useMutation({
    mutationFn: async ({ fileId, folderId }: { fileId: string; folderId: string | null }) => {
      if (!application) {
        throw new Error("Not initialized")
      }

      const cacheStores = application.getCacheStores()
      const cached = cacheStores.entityStore.get(fileId)
      if (!cached || !isFileEntity(cached)) {
        throw new Error("File not found in cache")
      }

      const updateEntity = application.getUpdateEntity()
      const result = await updateEntity.execute({
        id: fileId,
        content: cached.content,
        parentUpdate: folderId
          ? { mode: "set", parent: { id: folderId, type: "folder" as const } }
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
 * Hook for downloading and decrypting a file.
 * Returns the decrypted blob for preview or download.
 */
export function useDownloadFile(fileId: string, enabled: boolean = false) {
  const { globalClient, application } = useEngineStore()
  const workspaceId = application?.workspaceId ?? ""

  return useQuery({
    queryKey: queryKeys.files.download(workspaceId, fileId),
    queryFn: async ({ signal }) => {
      if (!globalClient || !application) {
        throw new Error("Not initialized")
      }

      const downloadFile = application.getDownloadFile()
      const result = await downloadFile.execute({
        fileId,
        abortSignal: signal,
      })

      if (result.isFailed()) {
        throw new Error(result.getError())
      }

      const { file, blob } = result.getValue()
      return {
        file,
        blob,
        url: URL.createObjectURL(blob),
      }
    },
    enabled:
      !!globalClient &&
      !!application &&
      !!fileId &&
      enabled &&
      application?.isWorkspaceRemote(),
    staleTime: Infinity,
    gcTime: 1000 * 60 * 5,
  })
}

/**
 * Hook that returns a memoized function to download a file and get its blob URL.
 * Useful for imperative file downloads (e.g., after uploading an image).
 */
export function useEngineForFileDownload() {
  const { application } = useEngineStore()

  return useCallback(
    async (fileId: string): Promise<string | null> => {
      if (!application) {
        console.error("Not initialized for file download")
        return null
      }
      if (!application.isWorkspaceRemote()) {
        console.error("File downloads are unavailable in local-only workspaces")
        return null
      }

      const downloadFile = application.getDownloadFile()
      const result = await downloadFile.execute({ fileId })

      if (result.isFailed()) {
        console.error("Failed to download file:", result.getError())
        return null
      }

      const { blob } = result.getValue()
      return URL.createObjectURL(blob)
    },
    [application]
  )
}
