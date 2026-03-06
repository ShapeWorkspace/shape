import { ClientEntity, EntityContent, EntityMetaFields } from "../models/entity"
import { EntityType } from "../utils/encryption-types"

type EntityChangeCallback = (entities: ClientEntity[]) => void
type EntityTypeChangeCallback = (entities: ClientEntity[]) => void

export class EntityStore {
  private static readonly DELETE_TOMBSTONE_TTL_MS = 30000
  private readonly canonicalCache: Map<string, ClientEntity> = new Map()
  private readonly dirtyCache: Map<string, ClientEntity> = new Map()
  private readonly entityTypeIndex: Map<EntityType, Set<string>> = new Map()
  private readonly parentChildrenIndex: Map<string, Set<string>> = new Map()
  private readonly deletedEntityTombstones: Map<string, number> = new Map()
  private changeCallbacks: EntityChangeCallback[] = []
  private readonly entityTypeChangeCallbacks: Map<EntityType, EntityTypeChangeCallback[]> = new Map()

  constructor() {}

  private getActiveDeleteTombstone(entityId: string): number | undefined {
    const deletedAt = this.deletedEntityTombstones.get(entityId)
    if (deletedAt === undefined) {
      return undefined
    }
    if (Date.now() - deletedAt > EntityStore.DELETE_TOMBSTONE_TTL_MS) {
      this.deletedEntityTombstones.delete(entityId)
      return undefined
    }
    return deletedAt
  }

  private markDeleted(entityId: string): void {
    this.deletedEntityTombstones.set(entityId, Date.now())
  }

  private clearDeleteTombstone(entityId: string): void {
    this.deletedEntityTombstones.delete(entityId)
  }

  /**
   * Returns true when an incoming entity update should be ignored because it
   * targets an entity id that has a recent local delete tombstone.
   */
  shouldIgnoreIncomingEntity(entityId: string, _updatedAt: Date): boolean {
    if (this.getActiveDeleteTombstone(entityId) === undefined) {
      return false
    }
    return true
  }

  // ============================================================
  // Entity Type Index
  // ============================================================

  private addToTypeIndex(entity: ClientEntity): void {
    const typeSet = this.entityTypeIndex.get(entity.entityType)
    if (typeSet) {
      typeSet.add(entity.id)
    } else {
      this.entityTypeIndex.set(entity.entityType, new Set([entity.id]))
    }
  }

  /** Only removes if entity no longer exists in either cache. */
  private removeFromTypeIndex(entityId: string, entityType: EntityType): void {
    if (!this.canonicalCache.has(entityId) && !this.dirtyCache.has(entityId)) {
      const typeSet = this.entityTypeIndex.get(entityType)
      if (typeSet) {
        typeSet.delete(entityId)
        if (typeSet.size === 0) {
          this.entityTypeIndex.delete(entityType)
        }
      }
    }
  }

  private clearTypeIndex(): void {
    this.entityTypeIndex.clear()
  }

  private rebuildTypeIndex(): void {
    this.clearTypeIndex()
    for (const entity of this.canonicalCache.values()) {
      this.addToTypeIndex(entity)
    }
    for (const entity of this.dirtyCache.values()) {
      this.addToTypeIndex(entity)
    }
  }

  // ============================================================
  // Parent-Children Index
  // ============================================================

  private addToParentChildrenIndex(entity: ClientEntity): void {
    if (entity.parentId === undefined) return

    const childrenSet = this.parentChildrenIndex.get(entity.parentId)
    if (childrenSet) {
      childrenSet.add(entity.id)
    } else {
      this.parentChildrenIndex.set(entity.parentId, new Set([entity.id]))
    }
  }

  /** Only removes if entity no longer exists in either cache. */
  private removeFromParentChildrenIndex(entityId: string, parentId: string | undefined): void {
    if (parentId === undefined) return

    if (!this.canonicalCache.has(entityId) && !this.dirtyCache.has(entityId)) {
      const childrenSet = this.parentChildrenIndex.get(parentId)
      if (childrenSet) {
        childrenSet.delete(entityId)
        if (childrenSet.size === 0) {
          this.parentChildrenIndex.delete(parentId)
        }
      }
    }
  }

  private clearParentChildrenIndex(): void {
    this.parentChildrenIndex.clear()
  }

  private rebuildParentChildrenIndex(): void {
    this.clearParentChildrenIndex()
    for (const entity of this.canonicalCache.values()) {
      this.addToParentChildrenIndex(entity)
    }
    for (const entity of this.dirtyCache.values()) {
      this.addToParentChildrenIndex(entity)
    }
  }

  private rebuildAllIndexes(): void {
    this.rebuildTypeIndex()
    this.rebuildParentChildrenIndex()
  }

  // ============================================================
  // Canonical Cache
  // ============================================================

  setCanonical(entity: ClientEntity): void {
    this.clearDeleteTombstone(entity.id)
    this.canonicalCache.set(entity.id, entity)
    this.addToTypeIndex(entity)
    this.addToParentChildrenIndex(entity)
    this.notifyChange()
  }

  setCanonicalBatch(entities: ClientEntity[]): void {
    for (const entity of entities) {
      this.clearDeleteTombstone(entity.id)
      this.canonicalCache.set(entity.id, entity)
      this.addToTypeIndex(entity)
      this.addToParentChildrenIndex(entity)
    }
    if (entities.length > 0) {
      this.notifyChange()
    }
  }

  getCanonical<T extends ClientEntity = ClientEntity>(entityId: string): T | undefined {
    return this.canonicalCache.get(entityId) as T | undefined
  }

  hasCanonical(entityId: string): boolean {
    return this.canonicalCache.has(entityId)
  }

  deleteCanonical(entityId: string): boolean {
    const entity = this.canonicalCache.get(entityId)
    const existed = this.canonicalCache.delete(entityId)
    if (existed && entity) {
      this.removeFromTypeIndex(entityId, entity.entityType)
      this.removeFromParentChildrenIndex(entityId, entity.parentId)
      if (!this.canonicalCache.has(entityId) && !this.dirtyCache.has(entityId)) {
        this.markDeleted(entityId)
      }
      this.notifyChange()
    }
    return existed
  }

  clearCanonical(): void {
    const hadEntities = this.canonicalCache.size > 0
    this.canonicalCache.clear()
    if (hadEntities) {
      this.rebuildAllIndexes()
      this.notifyChange()
    }
  }

  // ============================================================
  // Dirty Cache
  // ============================================================

  setDirtyVersion(entity: ClientEntity): void {
    this.clearDeleteTombstone(entity.id)
    this.dirtyCache.set(entity.id, entity)
    this.addToTypeIndex(entity)
    this.addToParentChildrenIndex(entity)
    this.notifyChange()
  }

  setDirtyEntity(entity: ClientEntity): void {
    this.setDirtyVersion(entity)
  }

  setCanonicalEntity(entity: ClientEntity): void {
    this.setCanonical(entity)
  }

  getDirtyVersion(entityId: string): ClientEntity | undefined {
    return this.dirtyCache.get(entityId)
  }

  hasDirtyVersion(entityId: string): boolean {
    return this.dirtyCache.has(entityId)
  }

  deleteDirtyVersion(entityId: string): boolean {
    const entity = this.dirtyCache.get(entityId)
    const existed = this.dirtyCache.delete(entityId)
    if (existed && entity) {
      this.removeFromTypeIndex(entityId, entity.entityType)
      this.removeFromParentChildrenIndex(entityId, entity.parentId)
      if (!this.canonicalCache.has(entityId) && !this.dirtyCache.has(entityId)) {
        this.markDeleted(entityId)
      }
      this.notifyChange()
    }
    return existed
  }

  clearDirtyVersion(): void {
    const hadEntities = this.dirtyCache.size > 0
    this.dirtyCache.clear()
    if (hadEntities) {
      this.rebuildAllIndexes()
      this.notifyChange()
    }
  }

  // ============================================================
  // Merged Operations (Dirty Overlays Canonical)
  // ============================================================

  /** Gets entity by ID, checking dirty first, then canonical. */
  get<C extends EntityContent, M extends EntityMetaFields>(entityId: string): ClientEntity<C, M> | undefined {
    return (this.dirtyCache.get(entityId) ?? this.canonicalCache.get(entityId)) as
      | ClientEntity<C, M>
      | undefined
  }

  findEntityById(id: string): ClientEntity<EntityContent, EntityMetaFields> | undefined {
    return this.get(id)
  }

  has(entityId: string): boolean {
    return this.dirtyCache.has(entityId) || this.canonicalCache.has(entityId)
  }

  delete(entityId: string): boolean {
    const entity = this.dirtyCache.get(entityId) ?? this.canonicalCache.get(entityId)
    const dirtyExisted = this.dirtyCache.delete(entityId)
    const canonicalExisted = this.canonicalCache.delete(entityId)
    if ((dirtyExisted || canonicalExisted) && entity) {
      this.removeFromTypeIndex(entityId, entity.entityType)
      this.removeFromParentChildrenIndex(entityId, entity.parentId)
      if (!this.canonicalCache.has(entityId) && !this.dirtyCache.has(entityId)) {
        this.markDeleted(entityId)
      }
      this.notifyChange()
    }
    return dirtyExisted || canonicalExisted
  }

  clear(): void {
    const hadDirty = this.dirtyCache.size > 0
    const hadCanonical = this.canonicalCache.size > 0
    this.dirtyCache.clear()
    this.canonicalCache.clear()
    this.deletedEntityTombstones.clear()
    this.clearTypeIndex()
    this.clearParentChildrenIndex()
    if (hadDirty || hadCanonical) {
      this.notifyChange()
    }
  }

  /** Returns merged entities with dirty overlaying canonical. */
  getAll(): ClientEntity[] {
    const merged = new Map<string, ClientEntity>()
    for (const [id, entity] of this.canonicalCache.entries()) {
      merged.set(id, entity)
    }
    for (const [id, entity] of this.dirtyCache.entries()) {
      merged.set(id, entity)
    }
    return Array.from(merged.values())
  }

  get size(): number {
    const ids = new Set([...this.canonicalCache.keys(), ...this.dirtyCache.keys()])
    return ids.size
  }

  getDirtyIds(): Set<string> {
    return new Set(this.dirtyCache.keys())
  }

  // ============================================================
  // Change Subscription
  // ============================================================

  subscribe(callback: EntityChangeCallback): () => void {
    this.changeCallbacks.push(callback)
    return () => {
      this.changeCallbacks = this.changeCallbacks.filter(cb => cb !== callback)
    }
  }

  notifyChange(): void {
    const entities = this.getAll()
    for (const callback of this.changeCallbacks) {
      try {
        callback(entities)
      } catch (error) {
        console.error("Error in entity change callback:", error)
      }
    }
    this.notifyEntityTypeChanges()
  }

  private notifyEntityTypeChanges(): void {
    for (const [entityType, callbacks] of this.entityTypeChangeCallbacks.entries()) {
      if (callbacks.length === 0) continue

      const entities = this.getAllByEntityType(entityType)
      for (const callback of callbacks) {
        try {
          callback(entities)
        } catch (error) {
          console.error(`Error in entity type change callback for ${entityType}:`, error)
        }
      }
    }
  }

  subscribeToEntityType(entityType: EntityType, callback: EntityTypeChangeCallback): () => void {
    const callbacks = this.entityTypeChangeCallbacks.get(entityType) ?? []
    callbacks.push(callback)
    this.entityTypeChangeCallbacks.set(entityType, callbacks)

    return () => {
      const cbs = this.entityTypeChangeCallbacks.get(entityType)
      if (cbs) {
        const index = cbs.indexOf(callback)
        if (index >= 0) {
          cbs.splice(index, 1)
        }
        if (cbs.length === 0) {
          this.entityTypeChangeCallbacks.delete(entityType)
        }
      }
    }
  }

  // ============================================================
  // Batch Dirty Refresh
  // ============================================================

  /** Reconciles dirty cache with new versions, removing stale entries. */
  reconcileDirtyVersions(newDirtyVersions: ClientEntity[]): void {
    const nextIds = new Set(newDirtyVersions.map(d => d.id))

    for (const [cachedId, entity] of this.dirtyCache.entries()) {
      if (!nextIds.has(cachedId)) {
        this.dirtyCache.delete(cachedId)
        this.removeFromTypeIndex(cachedId, entity.entityType)
        this.removeFromParentChildrenIndex(cachedId, entity.parentId)
      }
    }

    for (const dirtyVersion of newDirtyVersions) {
      this.clearDeleteTombstone(dirtyVersion.id)
      this.dirtyCache.set(dirtyVersion.id, dirtyVersion)
      this.addToTypeIndex(dirtyVersion)
      this.addToParentChildrenIndex(dirtyVersion)
    }

    this.notifyChange()
  }

  // ============================================================
  // Query by Entity Type
  // ============================================================

  getAllByEntityType(entityType: EntityType): ClientEntity[] {
    const entityIds = this.entityTypeIndex.get(entityType)
    if (!entityIds || entityIds.size === 0) {
      return []
    }

    const results: ClientEntity[] = []
    for (const id of entityIds) {
      const entity = this.dirtyCache.get(id) ?? this.canonicalCache.get(id)
      if (entity) {
        results.push(entity)
      }
    }

    return results
  }

  getCountByEntityType(entityType: EntityType): number {
    return this.entityTypeIndex.get(entityType)?.size ?? 0
  }

  hasEntityType(entityType: EntityType): boolean {
    const typeSet = this.entityTypeIndex.get(entityType)
    return typeSet !== undefined && typeSet.size > 0
  }

  getStoredEntityTypes(): EntityType[] {
    return Array.from(this.entityTypeIndex.keys())
  }

  // ============================================================
  // Query by Parent
  // ============================================================

  getChildren<C extends ClientEntity>(parentId: string): C[] {
    const childIds = this.parentChildrenIndex.get(parentId)
    if (!childIds || childIds.size === 0) {
      return []
    }

    const results: C[] = []
    for (const id of childIds) {
      const entity = this.dirtyCache.get(id) ?? this.canonicalCache.get(id)
      if (entity) {
        results.push(entity as unknown as C)
      }
    }

    return results
  }
}
