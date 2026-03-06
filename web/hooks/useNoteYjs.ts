/**
 * useNoteYjs hook manages Yjs document lifecycle for block-based Notes.
 *
 * Responsibilities:
 * 1. Creates and manages Y.Doc instance for the note
 * 2. Loads existing blocks from server on mount
 * 3. Subscribes to SSE for remote block updates via BlockStore
 * 4. Debounces local updates (500ms) and sends to server via CreateBlockDraft
 * 5. Queues notes for search indexing after content changes
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import * as Y from "yjs"
import { useEngineStore } from "../store/engine-store"
import { useNoteBlocks, useCreateNoteBlock } from "../store/queries/use-notes"
import type { EntityBlockCreatedEventData } from "@shape/engine/services/sse-types"
import { decodeBlocksFromBase64 } from "@shape/engine/usecase/crypto/block-crypto-utils"
import { useDebouncedSave } from "./useDebouncedSave"
import { useEntityKey } from "./useEntityKey"
import { AUTOSAVE_DEBOUNCE_MS } from "../constants/save"

interface UseNoteYjsOptions {
  noteId: string
  title: string
  createdAt: number
  updatedAt: number
}

interface UseNoteYjsResult {
  ydoc: Y.Doc
  isLoading: boolean
  isSynced: boolean
  isSavingBlocks: boolean
  error: string | null
}

export function useNoteYjs({ noteId, title, createdAt, updatedAt }: UseNoteYjsOptions): UseNoteYjsResult {
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

  const createBlockMutation = useCreateNoteBlock()
  const { data: blocks, isLoading: blocksLoading, error: blocksError } = useNoteBlocks(noteId)

  const indexNoteBlocksForSearch = useCallback(async () => {
    if (!application) {
      return
    }

    // Delegate indexing to the engine so block-based entities are indexed consistently.
    const indexBlockEntity = application.getIndexBlockEntity()
    const indexResult = await indexBlockEntity.execute(noteId)
    if (indexResult.isFailed()) {
      console.warn("Failed to index note blocks for search:", indexResult.getError())
    }
  }, [application, noteId])

  const applyLoadedBlocksToYDoc = useCallback(async () => {
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

    const entityKey = getEntityKey(noteId)
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
      await indexNoteBlocksForSearch()
    } catch (err) {
      console.error("Failed to apply blocks:", err)
      setError("Failed to load note content")
    } finally {
      isApplyingRemoteRef.current = false
      setIsLoading(false)
    }
  }, [blocks, application, getEntityKey, ydoc, noteId, indexNoteBlocksForSearch])

  // Send batched Yjs updates to the engine via CreateBlockDraft (handles encryption).
  const handleSavePendingUpdates = useCallback(
    async (pendingUpdates: Uint8Array[]) => {
      if (!application) {
        return
      }

      await createBlockMutation.mutateAsync({
        noteId,
        yjsUpdates: pendingUpdates,
      })

      await indexNoteBlocksForSearch()
    },
    [application, noteId, createBlockMutation, indexNoteBlocksForSearch]
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
      // Ignore updates that we're applying from remote sources.
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
      applyLoadedBlocksToYDoc()
    }
  }, [blocksLoading, blocks, applyLoadedBlocksToYDoc])

  useEffect(() => {
    if (isSynced) {
      void indexNoteBlocksForSearch()
    }
  }, [title, createdAt, updatedAt, isSynced, indexNoteBlocksForSearch])

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
      "note",
      noteId,
      async (blockData: EntityBlockCreatedEventData) => {
        const entityKey = getEntityKey(noteId)
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

          await indexNoteBlocksForSearch()
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
  }, [application, noteId, getEntityKey, ydoc, indexNoteBlocksForSearch])

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
