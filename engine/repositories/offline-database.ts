/**
 * Low-level interface for offline entity storage.
 *
 * This interface defines generic CRUD operations for storing encrypted entities.
 * Implementations (IndexedDB, in-memory) provide the actual storage mechanism.
 *
 * Repositories use this interface to implement entity-specific storage logic.
 */

/**
 * Generic offline database interface.
 * Provides low-level storage operations without entity-specific knowledge.
 */
export interface IOfflineDatabase {
  /**
   * Retrieves a single entity by ID.
   */
  get<T>(workspaceId: string, storeName: string, id: string): Promise<T | undefined>

  /**
   * Retrieves all entities from a store.
   */
  getAll<T>(workspaceId: string, storeName: string): Promise<T[]>

  /**
   * Retrieves entities matching an index value.
   */
  getByIndex<T>(workspaceId: string, storeName: string, indexName: string, indexValue: string): Promise<T[]>

  /**
   * Retrieves entities matching an index value, sorted by a compound index.
   * Uses a compound index [indexValue, sortField] for native sorted retrieval.
   *
   * @param indexName - Name of the compound index to use
   * @param indexValue - The foreign key value to filter by (first field of compound index)
   * @param direction - 'next' for ascending (default), 'prev' for descending
   */
  getByIndexSorted<T>(
    workspaceId: string,
    storeName: string,
    indexName: string,
    indexValue: string,
    direction?: "next" | "prev"
  ): Promise<T[]>

  /**
   * Retrieves all entities from a store, sorted by an index.
   *
   * @param indexName - Name of the index to sort by
   * @param direction - 'next' for ascending (default), 'prev' for descending
   */
  getAllSorted<T>(
    workspaceId: string,
    storeName: string,
    indexName: string,
    direction?: "next" | "prev"
  ): Promise<T[]>

  /**
   * Stores a single entity (upsert).
   */
  put<T extends { id: string }>(workspaceId: string, storeName: string, entity: T): Promise<void>

  /**
   * Stores multiple entities (upsert).
   */
  putMany<T extends { id: string }>(workspaceId: string, storeName: string, entities: T[]): Promise<void>

  /**
   * Deletes an entity by ID.
   */
  delete(workspaceId: string, storeName: string, id: string): Promise<void>

  /**
   * Clears all entities from a single store.
   */
  clear(workspaceId: string, storeName: string): Promise<void>

  /**
   * Clears all data for a workspace.
   */
  clearWorkspace(workspaceId: string): Promise<void>
}
