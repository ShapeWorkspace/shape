/**
 * Repository for offline entity block storage.
 *
 * Entity blocks contain encrypted Yjs deltas for collaborative editing.
 * Blocks are indexed by entity_id for efficient retrieval when opening an entity.
 */

import { ServerBlock } from "../models/entity"
import { IOfflineDatabase } from "./offline-database"
import { STORE_NAMES, INDEX_NAMES } from "./schema"

/**
 * Repository for entity block storage operations using IOfflineDatabase.
 */
export class BlockRepository {
  constructor(
    private database: IOfflineDatabase,
    private readonly workspaceId: string
  ) {}

  async getBlocks(): Promise<ServerBlock[]> {
    return this.database.getAll<ServerBlock>(this.workspaceId, STORE_NAMES.BLOCK)
  }

  /**
   * Retrieves all blocks for an entity, sorted by created_at ascending.
   * Uses compound index for native sorted retrieval from IndexedDB.
   * Blocks must be applied in order to reconstruct the Yjs document.
   */
  async getBlocksByEntity(entityId: string): Promise<ServerBlock[]> {
    return this.database.getByIndexSorted<ServerBlock>(
      this.workspaceId,
      STORE_NAMES.BLOCK,
      INDEX_NAMES.ENTITY_ID_CREATED_AT,
      entityId,
      "next" // ascending by created_at (chronological order for Yjs replay)
    )
  }

  /**
   * Retrieves a single block by ID.
   */
  async getBlock(blockId: string): Promise<ServerBlock | undefined> {
    return this.database.get<ServerBlock>(this.workspaceId, STORE_NAMES.BLOCK, blockId)
  }

  /**
   * Saves multiple blocks to the store.
   */
  async saveBlocks(blocks: ServerBlock[]): Promise<void> {
    return this.database.putMany(this.workspaceId, STORE_NAMES.BLOCK, blocks)
  }

  /**
   * Saves a single block to the store (upsert).
   */
  async saveBlock(block: ServerBlock): Promise<void> {
    return this.database.put(this.workspaceId, STORE_NAMES.BLOCK, block)
  }

  /**
   * Deletes a single block from the store.
   */
  async deleteBlock(blockId: string): Promise<void> {
    return this.database.delete(this.workspaceId, STORE_NAMES.BLOCK, blockId)
  }

  /**
   * Deletes all blocks for a specific entity (used when deleting an entity).
   */
  async deleteBlocksByEntity(entityId: string): Promise<void> {
    const blocks = await this.getBlocksByEntity(entityId)
    for (const block of blocks) {
      await this.database.delete(this.workspaceId, STORE_NAMES.BLOCK, block.id)
    }
  }
}
