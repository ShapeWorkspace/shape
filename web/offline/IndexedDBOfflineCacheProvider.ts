/**
 * IndexedDB implementation of IOfflineDatabase.
 *
 * Stores encrypted entities in workspace-scoped IndexedDB databases.
 * Each entity type gets its own object store with appropriate indexes
 * for efficient querying (e.g., group_chat_id for group messages).
 *
 * Database schema (per workspace):
 * - Database name: shape_offline_{workspaceId}
 * - Object stores: note, paper, paper-block, direct-message, group-chat, group-message,
 *                  project, task, project-tag, task-comment,
 *                  workspace-key, member, forum-channel, forum-discussion, forum-reply
 * - Each store uses 'id' as key path
 * - Indexes for foreign keys where needed
 */

import type { IOfflineDatabase } from "../../engine/repositories"
import { ALL_STORE_NAMES, STORE_INDEXES } from "../../engine/repositories/schema"

// Database version - increment when schema changes
// v2: Added workspace-key store for offline key caching
// v3: Added member store for offline contacts caching
// v4: Added compound indexes for sorted retrieval
// v5: Added forum-channel, forum-discussion, forum-reply stores
// v6: Added task-comment store for offline task comment caching
// v7: Added paper and paper-block stores for offline collaborative docs
// v8: Added draft-entity and draft-block stores for offline draft persistence
// v9: Added reaction store for offline reaction caching
// v10: Added paper-comment and paper-comment-reply stores for offline paper comment caching
// v11: Schema bump (no data migration)
// v12: Fixed draft/draft-block index key paths and rebuilds mismatched indexes
const DB_VERSION = 12

/**
 * Gets the database name for a workspace's offline cache.
 */
function getDbName(workspaceId: string): string {
  return `shape_offline_${workspaceId}`
}

function normalizeKeyPath(keyPath: string | string[] | null): string[] {
  if (keyPath === null) return []
  if (Array.isArray(keyPath)) return keyPath
  return [keyPath]
}

function hasMatchingKeyPath(existing: string | string[] | null, expected: string | string[]): boolean {
  const existingPath = normalizeKeyPath(existing)
  const expectedPath = normalizeKeyPath(expected)
  if (existingPath.length !== expectedPath.length) {
    return false
  }
  return existingPath.every((segment, index) => segment === expectedPath[index])
}

export class IndexedDBOfflineDatabase implements IOfflineDatabase {
  // Cache of open database connections per workspace
  private dbCache = new Map<string, IDBDatabase>()

  /**
   * Opens or returns cached database connection for a workspace.
   */
  private async openDatabase(workspaceId: string): Promise<IDBDatabase> {
    const dbName = getDbName(workspaceId)

    // Return cached connection if available and still open
    const cached = this.dbCache.get(dbName)
    if (cached) {
      return cached
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, DB_VERSION)

      request.onerror = () => {
        reject(
          new Error(`Failed to open offline cache database for workspace ${workspaceId}: ${request.error}`)
        )
      }

      request.onsuccess = () => {
        const db = request.result

        // Cache the connection
        this.dbCache.set(dbName, db)

        // Handle database version change (another tab upgraded the database)
        db.onversionchange = () => {
          db.close()
          this.dbCache.delete(dbName)
        }

        resolve(db)
      }

      // Handle database upgrade (create object stores and indexes)
      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result
        const transaction = (event.target as IDBOpenDBRequest).transaction

        // Create object stores for each entity type
        for (const storeName of ALL_STORE_NAMES) {
          let store: IDBObjectStore

          if (!db.objectStoreNames.contains(storeName)) {
            // Create new store with 'id' as key path
            store = db.createObjectStore(storeName, { keyPath: "id" })
          } else {
            // Get existing store for index upgrades
            store = transaction!.objectStore(storeName)
          }

          // Create indexes for this store and rebuild indexes if key paths changed.
          const indexes = STORE_INDEXES[storeName] || []
          for (const [indexName, keyPath] of indexes) {
            if (store.indexNames.contains(indexName)) {
              const existingIndex = store.index(indexName)
              const existingKeyPath = existingIndex.keyPath
              if (!hasMatchingKeyPath(existingKeyPath, keyPath)) {
                store.deleteIndex(indexName)
                store.createIndex(indexName, keyPath, { unique: false })
              }
            } else {
              store.createIndex(indexName, keyPath, { unique: false })
            }
          }

        }
      }
    })
  }

  /**
   * Retrieves a single entity by ID from a store.
   */
  async get<T>(workspaceId: string, storeName: string, id: string): Promise<T | undefined> {
    try {
      const db = await this.openDatabase(workspaceId)

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], "readonly")
        const store = transaction.objectStore(storeName)
        const request = store.get(id)

        request.onerror = () => {
          reject(new Error(`Failed to get ${storeName} ${id}: ${request.error}`))
        }

        request.onsuccess = () => {
          resolve((request.result as T) || undefined)
        }
      })
    } catch (error) {
      console.error(`Error getting ${storeName}:`, error)
      return undefined
    }
  }

  /**
   * Retrieves all entities from a store.
   */
  async getAll<T>(workspaceId: string, storeName: string): Promise<T[]> {
    try {
      const db = await this.openDatabase(workspaceId)

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], "readonly")
        const store = transaction.objectStore(storeName)
        const request = store.getAll()

        request.onerror = () => {
          reject(new Error(`Failed to get all ${storeName}: ${request.error}`))
        }

        request.onsuccess = () => {
          resolve((request.result as T[]) || [])
        }
      })
    } catch (error) {
      console.error(`Error getting all ${storeName}:`, error)
      return []
    }
  }

  /**
   * Retrieves entities matching an index value.
   */
  async getByIndex<T>(
    workspaceId: string,
    storeName: string,
    indexName: string,
    indexValue: string
  ): Promise<T[]> {
    try {
      const db = await this.openDatabase(workspaceId)

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], "readonly")
        const store = transaction.objectStore(storeName)

        // Check if index exists
        if (!store.indexNames.contains(indexName)) {
          console.warn(`Index ${indexName} does not exist on store ${storeName}`)
          resolve([])
          return
        }

        const index = store.index(indexName)
        const request = index.getAll(indexValue)

        request.onerror = () => {
          reject(new Error(`Failed to get ${storeName} by ${indexName}: ${request.error}`))
        }

        request.onsuccess = () => {
          resolve((request.result as T[]) || [])
        }
      })
    } catch (error) {
      console.error(`Error getting ${storeName} by index:`, error)
      return []
    }
  }

  /**
   * Retrieves entities matching an index value, sorted by a compound index.
   * Uses a compound index [foreignKey, sortField] for native sorted retrieval.
   * The compound index must have the foreign key as first field and sort field as second.
   */
  async getByIndexSorted<T>(
    workspaceId: string,
    storeName: string,
    indexName: string,
    indexValue: string,
    direction: "next" | "prev" = "next"
  ): Promise<T[]> {
    try {
      const db = await this.openDatabase(workspaceId)

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], "readonly")
        const store = transaction.objectStore(storeName)

        // Check if index exists
        if (!store.indexNames.contains(indexName)) {
          console.warn(`Index ${indexName} does not exist on store ${storeName}`)
          resolve([])
          return
        }

        const index = store.index(indexName)

        // For compound index [foreignKey, sortField], create range matching foreignKey.
        // IDBKeyRange.bound([fk, minSort], [fk, maxSort]) returns all entries with
        // that foreignKey, sorted by the second field in the compound index.
        // Using empty string as min and high unicode char as max for string sort fields.
        // For numeric/date sort fields (stored as ISO strings), this still works.
        const range = IDBKeyRange.bound([indexValue, ""], [indexValue, "\uffff"], false, false)

        const results: T[] = []
        const cursorRequest = index.openCursor(range, direction)

        cursorRequest.onerror = () => {
          reject(new Error(`Failed to get sorted ${storeName} by ${indexName}: ${cursorRequest.error}`))
        }

        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result
          if (cursor) {
            results.push(cursor.value as T)
            cursor.continue()
          } else {
            resolve(results)
          }
        }
      })
    } catch (error) {
      console.error(`Error getting sorted ${storeName} by index:`, error)
      return []
    }
  }

  /**
   * Retrieves all entities from a store, sorted by a single-field index.
   * Uses cursor iteration on the index for native sorted retrieval.
   */
  async getAllSorted<T>(
    workspaceId: string,
    storeName: string,
    indexName: string,
    direction: "next" | "prev" = "next"
  ): Promise<T[]> {
    try {
      const db = await this.openDatabase(workspaceId)

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], "readonly")
        const store = transaction.objectStore(storeName)

        // Check if index exists
        if (!store.indexNames.contains(indexName)) {
          console.warn(`Index ${indexName} does not exist on store ${storeName}`)
          resolve([])
          return
        }

        const index = store.index(indexName)
        const results: T[] = []
        const cursorRequest = index.openCursor(null, direction)

        cursorRequest.onerror = () => {
          reject(new Error(`Failed to get all sorted ${storeName}: ${cursorRequest.error}`))
        }

        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result
          if (cursor) {
            results.push(cursor.value as T)
            cursor.continue()
          } else {
            resolve(results)
          }
        }
      })
    } catch (error) {
      console.error(`Error getting all sorted ${storeName}:`, error)
      return []
    }
  }

  /**
   * Stores a single entity (upsert).
   */
  async put<T extends { id: string }>(workspaceId: string, storeName: string, entity: T): Promise<void> {
    return this.putMany(workspaceId, storeName, [entity])
  }

  /**
   * Stores multiple entities (upsert for each).
   */
  async putMany<T extends { id: string }>(
    workspaceId: string,
    storeName: string,
    entities: T[]
  ): Promise<void> {
    if (entities.length === 0) {
      return
    }

    try {
      const db = await this.openDatabase(workspaceId)

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], "readwrite")
        const store = transaction.objectStore(storeName)

        // Add each entity (put performs upsert)
        for (const entity of entities) {
          store.put(entity)
        }

        transaction.oncomplete = () => {
          resolve()
        }

        transaction.onerror = () => {
          reject(new Error(`Failed to store ${storeName} entities: ${transaction.error}`))
        }
      })
    } catch (error) {
      console.error(`Error storing ${storeName} entities:`, error)
    }
  }

  /**
   * Removes a single entity by ID.
   */
  async delete(workspaceId: string, storeName: string, id: string): Promise<void> {
    try {
      const db = await this.openDatabase(workspaceId)

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], "readwrite")
        const store = transaction.objectStore(storeName)
        const request = store.delete(id)

        request.onerror = () => {
          reject(new Error(`Failed to delete ${storeName} ${id}: ${request.error}`))
        }

        request.onsuccess = () => {
          resolve()
        }
      })
    } catch (error) {
      console.error(`Error deleting ${storeName}:`, error)
    }
  }

  /**
   * Clears all entities from a single store.
   */
  async clear(workspaceId: string, storeName: string): Promise<void> {
    try {
      const db = await this.openDatabase(workspaceId)

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], "readwrite")
        const store = transaction.objectStore(storeName)
        const request = store.clear()

        request.onerror = () => {
          reject(new Error(`Failed to clear ${storeName}: ${request.error}`))
        }

        request.onsuccess = () => {
          resolve()
        }
      })
    } catch (error) {
      console.error(`Error clearing ${storeName}:`, error)
    }
  }

  /**
   * Clears all cached entities for a workspace by deleting the entire database.
   */
  async clearWorkspace(workspaceId: string): Promise<void> {
    try {
      const dbName = getDbName(workspaceId)

      // Close cached connection if open
      const cached = this.dbCache.get(dbName)
      if (cached) {
        cached.close()
        this.dbCache.delete(dbName)
      }

      return new Promise((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase(dbName)

        deleteRequest.onerror = () => {
          reject(
            new Error(`Failed to clear offline cache for workspace ${workspaceId}: ${deleteRequest.error}`)
          )
        }

        deleteRequest.onsuccess = () => {
          resolve()
        }

        deleteRequest.onblocked = () => {
          // Database deletion is blocked, likely by another tab
          // Log and resolve - the deletion will happen when all connections close
          console.warn(`Offline cache deletion blocked for workspace ${workspaceId}`)
          resolve()
        }
      })
    } catch (error) {
      console.error(`Error clearing offline cache for workspace ${workspaceId}:`, error)
    }
  }

  /**
   * Closes all database connections.
   * Call this when cleaning up (e.g., user logout).
   */
  closeAllConnections(): void {
    for (const [, db] of this.dbCache) {
      try {
        db.close()
      } catch (error) {
        console.warn("Error closing offline cache database:", error)
      }
    }
    this.dbCache.clear()
  }

  /**
   * Disposes of the provider, closing all connections.
   */
  dispose(): void {
    this.closeAllConnections()
  }
}
