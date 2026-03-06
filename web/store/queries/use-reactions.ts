import { useEffect, useMemo, useState } from "react"
import type { DecryptedReaction } from "../../../engine/models/entity"
import type { EntityType } from "../../../engine/utils/encryption-types"
import { useReachability } from "../../hooks/use-reachability"
import type { ReactionEntityReference } from "../../types/reaction-entity-reference"
import { useEngineStore } from "../engine-store"

export type ReactionListItem = DecryptedReaction

function selectReactionsForParent(
  allReactionEntities: DecryptedReaction[],
  parentEntityType: EntityType,
  parentEntityId: string
): ReactionListItem[] {
  return allReactionEntities
    .filter(
      reaction => reaction.parentType === parentEntityType && reaction.parentId === parentEntityId
    )
    .sort((firstReaction, secondReaction) => firstReaction.createdAt.getTime() - secondReaction.createdAt.getTime())
}

function buildReactionQueryNode(entityReferences: ReactionEntityReference[]) {
  const children = entityReferences.map(reference => ({
    type: "group" as const,
    operator: "and" as const,
    children: [
      {
        type: "predicate" as const,
        field: "entity_type" as const,
        operator: "eq" as const,
        value: "reaction",
      },
      {
        type: "predicate" as const,
        field: "parent_type" as const,
        operator: "eq" as const,
        value: reference.entityType,
      },
      {
        type: "predicate" as const,
        field: "parent_id" as const,
        operator: "eq" as const,
        value: reference.entityId,
      },
    ],
  }))

  if (children.length === 1) {
    return children[0]
  }

  return {
    type: "group" as const,
    operator: "or" as const,
    children,
  }
}

const serializeReactionReferences = (references: ReactionEntityReference[]): string => {
  const keys = references.map(reference => `${reference.entityType}:${reference.entityId}`)
  keys.sort()
  return keys.join("|")
}

/**
 * useReactions returns the cached reaction list for a single entity.
 *
 * This hook only loads from IndexedDB and subscribes to SSE updates;
 * callers should opt-in to network refresh via useReactionBatchFetch.
 */
export function useReactions(entityType: EntityType, entityId: string) {
  const { application } = useEngineStore()
  const cacheStores = application?.getCacheStores()

  const [reactions, setReactions] = useState<ReactionListItem[]>(() => {
    if (!cacheStores || !entityId) return []
    return selectReactionsForParent(
      cacheStores.entityStore.getAllByEntityType("reaction") as DecryptedReaction[],
      entityType,
      entityId
    )
  })

  useEffect(() => {
    if (!cacheStores || !entityId) return
    const unsubscribe = cacheStores.entityStore.subscribeToEntityType("reaction", entities => {
      setReactions(selectReactionsForParent(entities as DecryptedReaction[], entityType, entityId))
    })
    return unsubscribe
  }, [cacheStores, entityType, entityId])

  useEffect(() => {
    if (!cacheStores || !entityId) return
    setReactions(
      selectReactionsForParent(
        cacheStores.entityStore.getAllByEntityType("reaction") as DecryptedReaction[],
        entityType,
        entityId
      )
    )
  }, [cacheStores, entityType, entityId])

  return { data: reactions }
}

interface UseReactionBatchFetchOptions {
  isEnabled?: boolean
}

/**
 * useReactionBatchFetch refreshes reaction caches for a list of entities.
 *
 * It de-duplicates references, skips offline fetches, and relies on
 * ReactionService to update in-memory caches + IndexedDB.
 */
export function useReactionBatchFetch(
  entityReferences: ReactionEntityReference[],
  options: UseReactionBatchFetchOptions = {}
) {
  const { application } = useEngineStore()
  const { isOnline } = useReachability()
  const isEnabled = options.isEnabled ?? true

  const normalizedReferences = useMemo(() => {
    const uniqueReferences = new Map<string, ReactionEntityReference>()
    for (const reference of entityReferences) {
      const key = `${reference.entityType}:${reference.entityId}`
      if (!uniqueReferences.has(key)) {
        uniqueReferences.set(key, reference)
      }
    }
    return Array.from(uniqueReferences.values())
  }, [entityReferences])

  const referenceKey = useMemo(() => {
    if (normalizedReferences.length === 0) return ""
    return serializeReactionReferences(normalizedReferences)
  }, [normalizedReferences])

  useEffect(() => {
    if (!application || !application.isWorkspaceRemote() || !isEnabled) return
    if (!referenceKey || !isOnline) return
    if (normalizedReferences.length === 0) return

    const queryEntities = application.getQueryEntities()

    // Reactions are regular entities; fetch by parent relation + entity_type.
    queryEntities.execute(buildReactionQueryNode(normalizedReferences)).catch(() => {})
  }, [application, isEnabled, isOnline, referenceKey, normalizedReferences])
}
