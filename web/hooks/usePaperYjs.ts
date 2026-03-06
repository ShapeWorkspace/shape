/**
 * usePaperYjs hook manages Yjs document lifecycle for collaborative Papers.
 *
 * Responsibilities:
 * 1. Creates and manages Y.Doc instance for the paper
 * 2. Loads existing blocks from server on mount
 * 3. Subscribes to SSE for remote block updates via BlockStore
 * 4. Debounces local updates (500ms) and sends to server via CreateBlockDraft
 * 5. Queues paper for search indexing after content changes
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import * as Y from "yjs"
import { useEngineStore } from "../store/engine-store"
import { usePaperBlocks, useCreatePaperBlock } from "../store/queries/use-papers"
import type { EntityBlockCreatedEventData } from "@shape/engine/services/sse-types"
import { decodeBlocksFromBase64 } from "@shape/engine/usecase/crypto/block-crypto-utils"
import { useDebouncedSave } from "./useDebouncedSave"
import { useEntityKey } from "./useEntityKey"
import { AUTOSAVE_DEBOUNCE_MS } from "../constants/save"

interface UsePaperYjsOptions {
  paperId: string
  title: string
  folderId: string | null
  createdAt: number
  updatedAt: number
}

interface UsePaperYjsResult {
  ydoc: Y.Doc
  isLoading: boolean
  isSynced: boolean
  isSavingBlocks: boolean
  error: string | null
}

export function usePaperYjs({
  paperId,
  title,
  folderId,
  createdAt,
  updatedAt,
}: UsePaperYjsOptions): UsePaperYjsResult {
  const { application } = useEngineStore()
  const getEntityKey = useEntityKey()

  const ydocRef = useRef<Y.Doc | null>(null)
  if (!ydocRef.current) {
    ydocRef.current = new Y.Doc()
  }
  const ydoc = ydocRef.current

  const [isLoading, setIsLoading] = useState(true)
  const [isSynced, setIsSynced] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isApplyingRemoteRef = useRef(false)

  const createBlockMutation = useCreatePaperBlock()
  const { data: blocks, isLoading: blocksLoading, error: blocksError } = usePaperBlocks(paperId)

  const indexPaperBlocksForSearch = useCallback(async () => {
    if (!application) {
      return
    }

    const indexBlockEntity = application.getIndexBlockEntity()
    const indexResult = await indexBlockEntity.execute(paperId)
    if (indexResult.isFailed()) {
      console.warn("Failed to index paper blocks for search:", indexResult.getError())
    }
  }, [application, paperId])

  const applyBlocks = useCallback(async () => {
    if (!blocks || blocks.length === 0) {
      setIsLoading(false)
      setIsSynced(true)
      return
    }

    if (!application) {
      setError("Application not initialized")
      setIsLoading(false)
      return
    }

    const entityKey = getEntityKey(paperId)
    if (!entityKey) {
      setError("Failed to get entity key")
      setIsLoading(false)
      return
    }

    try {
      isApplyingRemoteRef.current = true
      const decryptDelta = application.getDecryptDelta()

      for (const block of blocks) {
        const blocksMessage = decodeBlocksFromBase64(block.encrypted_data)
        if (!blocksMessage) {
          console.warn("Failed to decode block:", block.id)
          continue
        }

        for (const encryptedDelta of blocksMessage.deltas) {
          const yjsUpdate = decryptDelta.execute({ delta: encryptedDelta, entityKey })
          if (yjsUpdate) {
            Y.applyUpdate(ydoc, yjsUpdate)
          }
        }
      }

      setIsSynced(true)
      await indexPaperBlocksForSearch()
    } catch (err) {
      console.error("Failed to apply blocks:", err)
      setError("Failed to load paper content")
    } finally {
      isApplyingRemoteRef.current = false
      setIsLoading(false)
    }
  }, [blocks, application, getEntityKey, paperId, ydoc, indexPaperBlocksForSearch])

  // Send batched Yjs updates to the engine via CreateBlockDraft (handles encryption).
  const handleSavePendingUpdates = useCallback(
    async (pendingUpdates: Uint8Array[]) => {
      if (!application) {
        return
      }

      await createBlockMutation.mutateAsync({
        paperId,
        yjsUpdates: pendingUpdates,
      })

      await indexPaperBlocksForSearch()
    },
    [application, paperId, createBlockMutation, indexPaperBlocksForSearch]
  )

  const {
    queueUpdate,
    flushNow,
    isSaving: isSavingBlocks,
  } = useDebouncedSave<Uint8Array>({
    debounceMs: AUTOSAVE_DEBOUNCE_MS,
    onSave: handleSavePendingUpdates,
  })

  useEffect(() => {
    const handleUpdate = (update: Uint8Array, origin: unknown) => {
      if (isApplyingRemoteRef.current) return
      if (origin === "remote") return

      queueUpdate(update)
    }

    ydoc.on("update", handleUpdate)

    return () => {
      ydoc.off("update", handleUpdate)
    }
  }, [ydoc, queueUpdate])

  useEffect(() => {
    if (!blocksLoading && blocks !== undefined) {
      applyBlocks()
    }
  }, [blocksLoading, blocks, applyBlocks])

  useEffect(() => {
    if (isSynced) {
      void indexPaperBlocksForSearch()
    }
  }, [title, folderId, createdAt, updatedAt, isSynced, indexPaperBlocksForSearch])

  useEffect(() => {
    if (blocksError) {
      setError(blocksError.message)
      setIsLoading(false)
    }
  }, [blocksError])

  // Subscribe to real-time block updates via BlockStore (SSE-backed)
  useEffect(() => {
    if (!application) return
    const cacheStores = application.getCacheStores()

    const unsubscribe = cacheStores.blockStore.subscribeToBlockUpdates(
      "paper",
      paperId,
      async (blockData: EntityBlockCreatedEventData) => {
        const entityKey = getEntityKey(paperId)
        if (!entityKey) {
          console.error("Failed to get entity key for SSE update")
          return
        }

        try {
          const decryptDelta = application.getDecryptDelta()
          const blocksMessage = decodeBlocksFromBase64(blockData.encryptedData)
          if (!blocksMessage) {
            console.warn("Failed to decode SSE block")
            return
          }

          isApplyingRemoteRef.current = true

          for (const encryptedDelta of blocksMessage.deltas) {
            const yjsUpdate = decryptDelta.execute({ delta: encryptedDelta, entityKey })
            if (yjsUpdate) {
              Y.applyUpdate(ydoc, yjsUpdate, "remote")
            }
          }

          await indexPaperBlocksForSearch()
        } catch (err) {
          console.error("Failed to apply SSE update:", err)
        } finally {
          isApplyingRemoteRef.current = false
        }
      }
    )

    return () => {
      unsubscribe()
    }
  }, [application, paperId, getEntityKey, ydoc, indexPaperBlocksForSearch])

  // Flush pending updates on unmount to ensure no data loss.
  useEffect(() => {
    return () => {
      flushNow()
    }
  }, [flushNow])

  const result = useMemo(
    () => ({
      ydoc,
      isLoading,
      isSynced,
      isSavingBlocks,
      error,
    }),
    [ydoc, isLoading, isSynced, isSavingBlocks, error]
  )

  return result
}
