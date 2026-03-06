import { createContext, useContext, useEffect, useMemo, useState } from "react"
import { useEngineStore } from "../store/engine-store"
import type { BlockDraft, Draft } from "../../engine/models/entity"
import type { EntityType } from "../../engine/utils/encryption-types"

interface DraftContextValue {
  draftEntities: Draft[]
  draftBlocks: BlockDraft[]
  getDraftEntity: (entityType: EntityType, entityId: string) => Draft | null
  getDraftBlocks: (entityType: EntityType, entityId: string) => BlockDraft[]
  syncAllDrafts: () => Promise<void>
  retryDraft: (entityType: EntityType, entityId: string) => Promise<void>
  discardDraft: (entityType: EntityType, entityId: string) => Promise<void>
  forceSaveWithExpectedHash: (entityType: EntityType, entityId: string, expectedHash: string) => Promise<void>
  restoreDraftAsNew: (entityType: EntityType, entityId: string) => Promise<void>
}

const DraftContext = createContext<DraftContextValue | null>(null)

export function DraftProvider({ children }: { children: React.ReactNode }) {
  const { application } = useEngineStore()
  const [draftEntities, setDraftEntities] = useState<Draft[]>([])
  const [draftBlocks, setDraftBlocks] = useState<BlockDraft[]>([])

  useEffect(() => {
    if (!application) {
      setDraftEntities([])
      setDraftBlocks([])
      return
    }

    const cacheStores = application.getCacheStores()

    // Drafts live inside the workspace cache stores; subscribe to cache changes.
    const syncDraftStateFromCache = () => {
      setDraftEntities(Array.from(cacheStores.draftCache.values()))
      const blockGroups = Array.from(cacheStores.draftBlockCache.values())
      setDraftBlocks(blockGroups.flat())
    }

    syncDraftStateFromCache()

    const unsubscribeDrafts = cacheStores.draftCache.subscribe(syncDraftStateFromCache)
    const unsubscribeBlocks = cacheStores.draftBlockCache.subscribe(syncDraftStateFromCache)

    return () => {
      unsubscribeDrafts()
      unsubscribeBlocks()
    }
  }, [application])

  useEffect(() => {
    if (!application) {
      return
    }

    let syncTimer: number | null = null

    const handleOnline = () => {
      // Delay startup/online flush slightly so draft caches can hydrate first.
      if (syncTimer !== null) {
        window.clearTimeout(syncTimer)
      }
      syncTimer = window.setTimeout(() => {
        application
          .getSyncAllDrafts()
          .execute()
          .catch(error => {
            console.warn("Failed to sync drafts after reconnect:", error)
          })
        syncTimer = null
      }, 750)
    }

    window.addEventListener("online", handleOnline)

    if (navigator.onLine) {
      handleOnline()
    }

    return () => {
      window.removeEventListener("online", handleOnline)
      if (syncTimer !== null) {
        window.clearTimeout(syncTimer)
        syncTimer = null
      }
    }
  }, [application])

  const value = useMemo<DraftContextValue>(() => {
    return {
      draftEntities,
      draftBlocks,
      getDraftEntity: (entityType, entityId) => {
        return (
          draftEntities.find(
            draft => draft.entity.entity_type === entityType && draft.id === entityId
          ) ?? null
        )
      },
      getDraftBlocks: (entityType, entityId) => {
        return draftBlocks.filter(block => block.entityType === entityType && block.entityId === entityId)
      },
      syncAllDrafts: async () => {
        if (!application) return
        await application.getSyncAllDrafts().execute()
      },
      retryDraft: async (entityType, entityId) => {
        if (!application) return
        const draft = application.getCacheStores().draftCache.get(entityId)
        if (!draft || draft.entity.entity_type !== entityType) {
          return
        }
        const syncDraft = application.getSyncDraft()
        await syncDraft.execute(entityId, { resetAttempts: true })
      },
      discardDraft: async (entityType, entityId) => {
        if (!application) return
        const draft = application.getCacheStores().draftCache.get(entityId)
        if (!draft || draft.entity.entity_type !== entityType) {
          return
        }
        const clearDraft = application.getClearDraft()
        await clearDraft.execute(entityId)
      },
      forceSaveWithExpectedHash: async (entityType, entityId, expectedHash) => {
        if (!application) return
        const draft = application.getCacheStores().draftCache.get(entityId)
        if (!draft || draft.entity.entity_type !== entityType) {
          return
        }
        const syncDraft = application.getSyncDraft()
        await syncDraft.execute(entityId, { forceSaveWithExpectedHash: expectedHash, resetAttempts: true })
      },
      restoreDraftAsNew: async (entityType, entityId) => {
        if (!application) return
        const draft = application.getCacheStores().draftCache.get(entityId)
        if (!draft || draft.entity.entity_type !== entityType) {
          return
        }
        const syncDraft = application.getSyncDraft()
        await syncDraft.execute(entityId, { restoreDraftAsNew: true, resetAttempts: true })
      },
    }
  }, [application, draftEntities, draftBlocks])

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>
}

export function useDrafts(): DraftContextValue {
  const context = useContext(DraftContext)
  if (!context) {
    throw new Error("useDrafts must be used within DraftProvider")
  }
  return context
}
