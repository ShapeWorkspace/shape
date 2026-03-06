/**
 * In-memory implementation of IOfflineDatabase for testing (v2).
 *
 * Provides an in-memory storage backend that implements the same interface
 * as IndexedDB, allowing tests to verify repository and caching logic
 * without requiring a browser environment.
 */

import { IOfflineDatabase } from "../../repositories"

export class InMemoryOfflineDatabase implements IOfflineDatabase {
  // Structure: workspaceId -> storeName -> entityId -> entity
  private storage: Map<string, Map<string, Map<string, unknown>>> = new Map()

  private getStore(workspaceId: string, storeName: string): Map<string, unknown> {
    let workspace = this.storage.get(workspaceId)
    if (!workspace) {
      workspace = new Map()
      this.storage.set(workspaceId, workspace)
    }
    let store = workspace.get(storeName)
    if (!store) {
      store = new Map()
      workspace.set(storeName, store)
    }
    return store
  }

  async get<T>(workspaceId: string, storeName: string, id: string): Promise<T | undefined> {
    const store = this.getStore(workspaceId, storeName)
    return store.get(id) as T | undefined
  }

  async getAll<T>(workspaceId: string, storeName: string): Promise<T[]> {
    const store = this.getStore(workspaceId, storeName)
    return Array.from(store.values()) as T[]
  }

  async getByIndex<T>(
    workspaceId: string,
    storeName: string,
    indexName: string,
    indexValue: string
  ): Promise<T[]> {
    const all = await this.getAll<T>(workspaceId, storeName)
    return all.filter(entity => {
      const record = entity as Record<string, unknown>
      return record[indexName] === indexValue
    })
  }

  /**
   * Retrieves entities matching an index value, sorted by a compound index.
   * For in-memory implementation, we filter by the foreign key field and sort
   * by the sort field extracted from the compound index name.
   */
  async getByIndexSorted<T>(
    workspaceId: string,
    storeName: string,
    indexName: string,
    indexValue: string,
    direction: "next" | "prev" = "next"
  ): Promise<T[]> {
    // Compound index names are like "conversation_key_created_at"
    // We need to extract the foreign key field and sort field
    const parts = indexName.split("_")
    // For compound indexes, the sort field is the last part (e.g., "created_at" or "name")
    // and the foreign key is everything before that
    const sortField =
      parts[parts.length - 1] === "at"
        ? parts.slice(-2).join("_") // Handle "created_at", "updated_at"
        : parts[parts.length - 1] // Handle "name"
    const foreignKeyField = parts.slice(0, parts.length - (sortField.includes("_") ? 2 : 1)).join("_")

    const all = await this.getAll<T>(workspaceId, storeName)
    const filtered = all.filter(entity => {
      const record = entity as Record<string, unknown>
      return record[foreignKeyField] === indexValue
    })

    // Sort by the sort field
    filtered.sort((a, b) => {
      const aRecord = a as Record<string, unknown>
      const bRecord = b as Record<string, unknown>
      const aVal = aRecord[sortField]
      const bVal = bRecord[sortField]
      if (typeof aVal === "string" && typeof bVal === "string") {
        return aVal.localeCompare(bVal)
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return aVal - bVal
      }
      return 0
    })

    return direction === "prev" ? filtered.reverse() : filtered
  }

  /**
   * Retrieves all entities from a store, sorted by an index.
   * For in-memory implementation, we just sort by the index field.
   */
  async getAllSorted<T>(
    workspaceId: string,
    storeName: string,
    indexName: string,
    direction: "next" | "prev" = "next"
  ): Promise<T[]> {
    const all = await this.getAll<T>(workspaceId, storeName)

    // Sort by the index field
    all.sort((a, b) => {
      const aRecord = a as Record<string, unknown>
      const bRecord = b as Record<string, unknown>
      const aVal = aRecord[indexName]
      const bVal = bRecord[indexName]
      if (typeof aVal === "string" && typeof bVal === "string") {
        return aVal.localeCompare(bVal)
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return aVal - bVal
      }
      return 0
    })

    return direction === "prev" ? all.reverse() : all
  }

  async put<T extends { id: string }>(workspaceId: string, storeName: string, entity: T): Promise<void> {
    const store = this.getStore(workspaceId, storeName)
    store.set(entity.id, entity)
  }

  async putMany<T extends { id: string }>(
    workspaceId: string,
    storeName: string,
    entities: T[]
  ): Promise<void> {
    const store = this.getStore(workspaceId, storeName)
    for (const entity of entities) {
      store.set(entity.id, entity)
    }
  }

  async delete(workspaceId: string, storeName: string, id: string): Promise<void> {
    const store = this.getStore(workspaceId, storeName)
    store.delete(id)
  }

  async clear(workspaceId: string, storeName: string): Promise<void> {
    const store = this.getStore(workspaceId, storeName)
    store.clear()
  }

  async clearWorkspace(workspaceId: string): Promise<void> {
    this.storage.delete(workspaceId)
  }

  /**
   * Clears all stored data. Useful for test cleanup.
   */
  clearAll(): void {
    this.storage.clear()
  }
}
