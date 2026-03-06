import { useEffect, useMemo, useState } from "react"
import { useDrafts } from "../contexts/DraftContext"
import { DRAFT_TRANSIENT_WINDOW_MS } from "../constants/drafts"
import type { BlockDraft, Draft } from "../../engine/models/entity"
import type { EntityType } from "../../engine/utils/encryption-types"
import { getLatestBlockTimestamp, getLatestDraftTimestamp, hasDraftSettled } from "../utils/drafts"

interface UseDraftStateParams {
  entityType: EntityType
  entityId: string
  canonicalContentHash?: string
  canonicalExists?: boolean
}

export interface DraftState {
  draftEntity: Draft | null
  draftBlocks: BlockDraft[]
  hasDraft: boolean
  isTransient: boolean
  isConflict: boolean
  isOrphaned: boolean
  hasError: boolean
}

export function useDraftState({
  entityType,
  entityId,
  canonicalContentHash,
  canonicalExists,
}: UseDraftStateParams): DraftState {
  const { getDraftEntity, getDraftBlocks } = useDrafts()
  const [, setTransientTick] = useState(0)

  useEffect(() => {
    const draftEntity = getDraftEntity(entityType, entityId)
    const draftBlocks = getDraftBlocks(entityType, entityId)

    const latestTimestamp = draftEntity
      ? getLatestDraftTimestamp(draftEntity, draftBlocks)
      : getLatestBlockTimestamp(draftBlocks)

    if (latestTimestamp === null) {
      return
    }

    const elapsed = Date.now() - latestTimestamp
    if (elapsed >= DRAFT_TRANSIENT_WINDOW_MS) {
      return
    }

    const timeoutMs = Math.max(0, DRAFT_TRANSIENT_WINDOW_MS - elapsed + 25)
    const timeoutId = setTimeout(() => {
      setTransientTick(tick => tick + 1)
    }, timeoutMs)

    return () => clearTimeout(timeoutId)
  }, [entityId, entityType, getDraftBlocks, getDraftEntity])

  return useMemo(() => {
    const draftEntity = getDraftEntity(entityType, entityId)
    const draftBlocks = getDraftBlocks(entityType, entityId)
    const hasDraftBlocks = draftBlocks.length > 0
    const hasDraft = Boolean(draftEntity) || hasDraftBlocks
    const settled = hasDraftSettled(draftEntity ?? null, draftBlocks)

    if (!draftEntity) {
      const isTransient = hasDraft && !settled
      return {
        draftEntity: null,
        draftBlocks,
        hasDraft,
        isTransient,
        isConflict: false,
        isOrphaned: false,
        hasError: false,
      }
    }

    const isTransient = hasDraft && !settled

    const canonicalExistsFlag = canonicalExists ?? canonicalContentHash !== undefined
    const isOrphaned = draftEntity.formedOnHash !== undefined && !canonicalExistsFlag

    const isConflict =
      draftEntity.formedOnHash !== undefined &&
      canonicalContentHash !== undefined &&
      canonicalContentHash !== draftEntity.formedOnHash

    const hasError = Boolean(draftEntity.saveError) && !isConflict && !isOrphaned

    return {
      draftEntity,
      draftBlocks,
      hasDraft,
      isTransient,
      isConflict,
      isOrphaned,
      hasError,
    }
  }, [
    canonicalContentHash,
    canonicalExists,
    entityId,
    entityType,
    getDraftBlocks,
    getDraftEntity,
  ])
}
