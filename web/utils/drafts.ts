import { DRAFT_TRANSIENT_WINDOW_MS } from "../constants/drafts"
import type { BlockDraft, Draft } from "../../engine/models/entity"

/**
 * Returns true when a draft is "settled" (older than the transient window).
 * Settled drafts should drive visible UI indicators to avoid flashing on quick saves.
 */
export function hasDraftSettled(
  draftEntity: Draft | null | undefined,
  draftBlocks: BlockDraft[] = []
): boolean {
  if (!draftEntity && draftBlocks.length === 0) {
    return false
  }

  const latestTimestamp = draftEntity
    ? getLatestDraftTimestamp(draftEntity, draftBlocks)
    : getLatestBlockTimestamp(draftBlocks)

  if (latestTimestamp === null) {
    return true
  }

  return Date.now() - latestTimestamp >= DRAFT_TRANSIENT_WINDOW_MS
}

export function getLatestDraftTimestamp(
  draftEntity: Draft,
  draftBlocks: BlockDraft[]
): number | null {
  const entityTimestamp = Date.parse(draftEntity.entity.updated_at)
  const latestBlockTimestamp = getLatestBlockTimestamp(draftBlocks)

  const timestamps = [Number.isFinite(entityTimestamp) ? entityTimestamp : null, latestBlockTimestamp].filter(
    (value): value is number => value !== null
  )

  if (timestamps.length === 0) {
    return null
  }

  return Math.max(...timestamps)
}

export function getLatestBlockTimestamp(draftBlocks: BlockDraft[]): number | null {
  if (draftBlocks.length === 0) {
    return null
  }

  const timestamps = draftBlocks.map(block => Date.parse(block.createdAt)).filter(Number.isFinite)

  if (timestamps.length === 0) {
    return null
  }

  return Math.max(...timestamps)
}
