/**
 * useDraftInfoMap - Unified hook for building draft info maps across tools.
 *
 * Consolidates the common pattern of collecting draft entity and block info
 * into a Map keyed by entity ID. Used by NotesTool, PapersTool, and TasksTool
 * to show draft badges and handle transient window refresh.
 */

import { useMemo, useState, useEffect } from "react"
import { useDrafts } from "../contexts/DraftContext"
import { DRAFT_TRANSIENT_WINDOW_MS } from "../constants/drafts"
import type { Draft } from "../../engine/models/entity"
import type { EntityType } from "../../engine/utils/encryption-types"

/**
 * Draft info for a single entity - tracks whether there's a pending draft.
 */
export interface DraftInfo {
  /** Hash of the canonical entity when the draft was formed; null for creates */
  formedOnHash: string | null | undefined
  /** Whether this draft represents a pending deletion */
  deleteEntity: boolean
  /** Latest timestamp from entity or block updates (for transient window) */
  latestTimestamp: number | null
  /** Whether any draft (entity or blocks) exists for this entity */
  hasDraft: boolean
}

/**
 * Checks if a draft has settled (past transient window) for badge display.
 * Returns true if the draft should show UI indicators.
 */
export function isDraftSettled(draftInfo: DraftInfo | undefined): boolean {
  if (!draftInfo?.hasDraft || !draftInfo.latestTimestamp) return false
  return Date.now() - draftInfo.latestTimestamp >= DRAFT_TRANSIENT_WINDOW_MS
}

/**
 * Checks if a draft is still in the transient window (recently changed).
 * Returns true if the draft is too recent to show UI indicators.
 */
export function isDraftTransient(draftInfo: DraftInfo | undefined): boolean {
  if (!draftInfo?.hasDraft || !draftInfo.latestTimestamp) return false
  return Date.now() - draftInfo.latestTimestamp < DRAFT_TRANSIENT_WINDOW_MS
}

export interface UseDraftInfoMapOptions {
  /**
   * Entity type to filter for in draftEntities.
   * Examples: 'note', 'paper', 'project', 'task'
   */
  entityType: EntityType

  /**
   * Block type to filter for in draftBlocks.
   * Defaults to entityType, but can differ (e.g., 'task' blocks).
   */
  blockType?: EntityType

  /**
   * Optional filter for entity drafts.
   * Use for additional filtering like project_id for tasks.
   */
  entityFilter?: (draft: Draft) => boolean
}

/**
 * Builds a Map of entity ID -> DraftInfo by collecting draft entities and blocks.
 *
 * Features:
 * - Filters by entity type and optional block type
 * - Merges timestamps from both entities and blocks (takes max)
 * - Automatically schedules re-render when transient windows expire
 * - Returns stable Map reference when inputs haven't changed
 *
 * @example
 * // Simple usage for notes
 * const noteDraftInfoById = useDraftInfoMap({ entityType: 'note' })
 *
 * @example
 * // Tasks with different block type and project filter
 * const taskDraftInfoById = useDraftInfoMap({
 *   entityType: 'task',
 *   blockType: 'task',
 *   entityFilter: (draft) => draft.entity.parent_id === projectId,
 * })
 */
export function useDraftInfoMap(options: UseDraftInfoMapOptions): Map<string, DraftInfo> {
  const { entityType, blockType = entityType, entityFilter } = options
  const { draftEntities, draftBlocks } = useDrafts()

  // Tick to force re-render when transient windows expire
  const [, setRefreshTick] = useState(0)

  const draftInfoById = useMemo(() => {
    const draftMap = new Map<string, DraftInfo>()

    // Collect entity drafts
    for (const draft of draftEntities) {
      if (draft.entity.entity_type !== entityType) {
        continue
      }
      if (entityFilter && !entityFilter(draft)) {
        continue
      }

      const updatedAt = Date.parse(draft.entity.updated_at)
      const existing = draftMap.get(draft.id)
      const latestTimestamp = Number.isFinite(updatedAt)
        ? Math.max(existing?.latestTimestamp ?? updatedAt, updatedAt)
        : (existing?.latestTimestamp ?? null)

      draftMap.set(draft.id, {
        formedOnHash: draft.formedOnHash,
        deleteEntity: draft.deleteEntity,
        latestTimestamp,
        hasDraft: true,
      })
    }

    // Collect block drafts
    for (const block of draftBlocks) {
      if (block.entityType !== blockType) {
        continue
      }

      const createdAt = Date.parse(block.createdAt)
      const existing = draftMap.get(block.entityId)
      const latestTimestamp = Number.isFinite(createdAt)
        ? Math.max(existing?.latestTimestamp ?? createdAt, createdAt)
        : (existing?.latestTimestamp ?? null)

      draftMap.set(block.entityId, {
        formedOnHash: existing?.formedOnHash,
        deleteEntity: existing?.deleteEntity ?? false,
        latestTimestamp,
        hasDraft: true,
      })
    }

    return draftMap
  }, [draftEntities, draftBlocks, entityType, blockType, entityFilter])

  // Schedule re-render when the nearest transient window expires
  useEffect(() => {
    const now = Date.now()
    let nextRefreshDelay: number | null = null

    for (const draftInfo of draftInfoById.values()) {
      if (!draftInfo.latestTimestamp) {
        continue
      }
      const remaining = DRAFT_TRANSIENT_WINDOW_MS - (now - draftInfo.latestTimestamp)
      if (remaining > 0) {
        nextRefreshDelay = nextRefreshDelay === null ? remaining : Math.min(nextRefreshDelay, remaining)
      }
    }

    if (nextRefreshDelay === null) {
      return
    }

    // Add small buffer to ensure we're past the window
    const timer = setTimeout(() => {
      setRefreshTick(tick => tick + 1)
    }, nextRefreshDelay + 50)

    return () => clearTimeout(timer)
  }, [draftInfoById])

  return draftInfoById
}
