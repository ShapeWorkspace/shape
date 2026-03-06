import { StorageProvider } from "@shape/engine/storage/storage-provider"

// IndexedDB configuration
const DB_VERSION = 1
const STORE_NAME = "keyValueStore"

const getDbName = (namespace: string): string => {
  return `shape_namespace_${namespace}`
}

export class WebStorageProvider implements StorageProvider {
  private dbCache = new Map<string, IDBDatabase>()

  // Open or get cached database for a namespace
  private async openDatabase(namespace: string): Promise<IDBDatabase> {
    const dbName = getDbName(namespace)

    // Return cached database if available
    if (this.dbCache.has(dbName)) {
      return this.dbCache.get(dbName)!
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, DB_VERSION)

      request.onerror = () => {
        reject(new Error(`Failed to open database for namespace ${namespace}: ${request.error}`))
      }

      request.onsuccess = () => {
        const db = request.result
        this.dbCache.set(dbName, db)
        db.onversionchange = () => {
          db.close()
          this.dbCache.delete(dbName)
        }
        resolve(db)
      }

      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME)
        }
      }
    })
  }

  async get(namespace: string, key: string): Promise<string | undefined> {
    try {
      const db = await this.openDatabase(namespace)

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readonly")
        const store = transaction.objectStore(STORE_NAME)
        const request = store.get(key)

        request.onerror = () => {
          reject(new Error(`Failed to get item ${key} from namespace ${namespace}: ${request.error}`))
        }

        request.onsuccess = () => {
          resolve(request.result || undefined)
        }
      })
    } catch (error) {
      console.error("Error getting item from IndexedDB:", error)
      return undefined
    }
  }

  async set(namespace: string, key: string, value: string): Promise<void> {
    try {
      const db = await this.openDatabase(namespace)

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readwrite")
        const store = transaction.objectStore(STORE_NAME)
        const request = store.put(value, key)

        request.onerror = () => {
          reject(new Error(`Failed to set item ${key} in namespace ${namespace}: ${request.error}`))
        }

        request.onsuccess = () => {
          resolve()
        }
      })
    } catch (error) {
      console.error("Error setting item in IndexedDB:", error)
      throw error
    }
  }

  async remove(namespace: string, key: string): Promise<void> {
    try {
      const db = await this.openDatabase(namespace)

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], "readwrite")
        const store = transaction.objectStore(STORE_NAME)
        const request = store.delete(key)

        request.onerror = () => {
          reject(new Error(`Failed to remove item ${key} from namespace ${namespace}: ${request.error}`))
        }

        request.onsuccess = () => {
          resolve()
        }
      })
    } catch (error) {
      console.error("Error removing item from IndexedDB:", error)
      throw error
    }
  }

  async getKeys(namespace: string): Promise<string[]> {
    const db = await this.openDatabase(namespace)
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly")
      const store = transaction.objectStore(STORE_NAME)
      const request = store.getAllKeys()

      request.onerror = () => {
        reject(new Error(`Failed to get keys from namespace ${namespace}: ${request.error}`))
      }

      request.onsuccess = () => {
        const result = request.result as string[]
        resolve(result || [])
      }
    })
  }

  async clear(namespace: string): Promise<void> {
    try {
      const dbName = getDbName(namespace)

      if (this.dbCache.has(dbName)) {
        const db = this.dbCache.get(dbName)!
        db.close()
        this.dbCache.delete(dbName)
      }

      return new Promise((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase(dbName)

        deleteRequest.onerror = () => {
          reject(new Error(`Failed to clear namespace ${namespace}: ${deleteRequest.error}`))
        }

        deleteRequest.onsuccess = () => {
          resolve()
        }

        deleteRequest.onblocked = () => {
          reject(new Error(`Delete operation blocked for database: "${dbName}"`))
        }
      })
    } catch (error) {
      console.error("Error clearing namespace from IndexedDB:", error)
      throw error
    }
  }

  closeAllConnections(): void {
    for (const [, db] of this.dbCache) {
      try {
        db.close()
      } catch (error) {
        console.warn("Error closing database:", error)
      }
    }
    this.dbCache.clear()
  }

  dispose(): void {
    this.closeAllConnections()
  }
}
