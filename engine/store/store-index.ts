import { ClientEntity } from "../models/entity"
import { EntityType } from "../utils/encryption-types"
import { EntityStore } from "./entity-store"

type IndexChangeCallback = (entities: ClientEntity[]) => void

export interface StoreIndexOptions {
  entityType: EntityType
  sortFn?: (a: ClientEntity, b: ClientEntity) => number
}

/**
 * Provides a sorted, parent-indexed view over entities of a specific type.
 * Observes EntityStore for changes and maintains pre-sorted index by parentId.
 */
export class StoreIndex {
  private readonly store: EntityStore
  private readonly entityType: EntityType
  private readonly sortFn?: (a: ClientEntity, b: ClientEntity) => number
  private readonly sortedIndex: Map<string, ClientEntity[]> = new Map()
  private readonly changeCallbacks: Map<string, IndexChangeCallback[]> = new Map()
  private globalCallbacks: (() => void)[] = []

  constructor(store: EntityStore, options: StoreIndexOptions) {
    this.store = store
    this.entityType = options.entityType
    this.sortFn = options.sortFn

    this.rebuildIndex()
    store.subscribeToEntityType(this.entityType, () => this.onEntitiesChanged())
  }

  // ============================================================
  // Queries
  // ============================================================

  /** Returns pre-sorted entities for the given parent. O(1) lookup. */
  get(parentId: string): ClientEntity[] {
    return this.sortedIndex.get(parentId) ?? []
  }

  has(parentId: string): boolean {
    const entities = this.sortedIndex.get(parentId)
    return entities !== undefined && entities.length > 0
  }

  keys(): string[] {
    return Array.from(this.sortedIndex.keys()).filter(key => {
      const entities = this.sortedIndex.get(key)
      return entities && entities.length > 0
    })
  }

  count(parentId: string): number {
    return this.sortedIndex.get(parentId)?.length ?? 0
  }

  // ============================================================
  // Mutations (via underlying store)
  // ============================================================

  deleteByParent(parentId: string): number {
    const entities = this.sortedIndex.get(parentId)
    if (!entities || entities.length === 0) return 0

    let count = 0
    for (const entity of entities) {
      if (this.store.delete(entity.id)) {
        count++
      }
    }
    return count
  }

  deleteCanonicalByParent(parentId: string): number {
    const entities = this.sortedIndex.get(parentId)
    if (!entities || entities.length === 0) return 0

    let count = 0
    for (const entity of entities) {
      if (this.store.deleteCanonical(entity.id)) {
        count++
      }
    }
    return count
  }

  // ============================================================
  // Subscription
  // ============================================================

  subscribe(parentId: string, callback: IndexChangeCallback): () => void {
    const callbacks = this.changeCallbacks.get(parentId) ?? []
    callbacks.push(callback)
    this.changeCallbacks.set(parentId, callbacks)

    return () => {
      const cbs = this.changeCallbacks.get(parentId)
      if (cbs) {
        const index = cbs.indexOf(callback)
        if (index >= 0) {
          cbs.splice(index, 1)
        }
        if (cbs.length === 0) {
          this.changeCallbacks.delete(parentId)
        }
      }
    }
  }

  subscribeAll(callback: () => void): () => void {
    this.globalCallbacks.push(callback)
    return () => {
      this.globalCallbacks = this.globalCallbacks.filter(cb => cb !== callback)
    }
  }

  hasSubscribers(parentId: string): boolean {
    const callbacks = this.changeCallbacks.get(parentId)
    return callbacks !== undefined && callbacks.length > 0
  }

  // ============================================================
  // Internal
  // ============================================================

  private rebuildIndex(): void {
    this.sortedIndex.clear()

    const entities = this.store.getAllByEntityType(this.entityType)

    for (const entity of entities) {
      if (entity.parentId === undefined) continue

      let group = this.sortedIndex.get(entity.parentId)
      if (!group) {
        group = []
        this.sortedIndex.set(entity.parentId, group)
      }
      group.push(entity)
    }

    if (this.sortFn) {
      for (const group of this.sortedIndex.values()) {
        group.sort(this.sortFn)
      }
    }
  }

  private onEntitiesChanged(): void {
    const oldParentKeys = new Set(this.sortedIndex.keys())
    this.rebuildIndex()

    const parentsToNotify = new Set<string>()
    for (const parentId of this.sortedIndex.keys()) {
      parentsToNotify.add(parentId)
    }
    for (const parentId of oldParentKeys) {
      parentsToNotify.add(parentId)
    }

    for (const parentId of parentsToNotify) {
      this.notifyParentChange(parentId)
    }

    if (parentsToNotify.size > 0) {
      for (const callback of this.globalCallbacks) {
        try {
          callback()
        } catch (error) {
          console.error("Error in index global change callback:", error)
        }
      }
    }
  }

  private notifyParentChange(parentId: string): void {
    const callbacks = this.changeCallbacks.get(parentId)
    if (!callbacks || callbacks.length === 0) return

    const entities = this.get(parentId)
    for (const callback of callbacks) {
      try {
        callback(entities)
      } catch (error) {
        console.error(`Error in index change callback for parent ${parentId}:`, error)
      }
    }
  }
}
