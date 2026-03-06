import type { IOfflineDatabase } from "./offline-database"
import { STORE_NAMES, INDEX_NAMES } from "./schema"
import { BlockDraft } from "../models/entity"

export class DraftBlockRepository {
  constructor(
    private database: IOfflineDatabase,
    private readonly workspaceId: string
  ) {}

  async getBlocks(): Promise<BlockDraft[]> {
    return this.database.getAll<BlockDraft>(this.workspaceId, STORE_NAMES.DRAFT_BLOCK)
  }

  async getBlocksByEntity(entityId: string): Promise<BlockDraft[]> {
    return this.database.getByIndexSorted<BlockDraft>(
      this.workspaceId,
      STORE_NAMES.DRAFT_BLOCK,
      INDEX_NAMES.ENTITY_ID_CREATED_AT,
      entityId,
      "next"
    )
  }

  async saveBlock(block: BlockDraft): Promise<void> {
    await this.database.put(this.workspaceId, STORE_NAMES.DRAFT_BLOCK, block)
  }

  async saveBlocks(blocks: BlockDraft[]): Promise<void> {
    await this.database.putMany(this.workspaceId, STORE_NAMES.DRAFT_BLOCK, blocks)
  }

  async deleteBlock(blockId: string): Promise<void> {
    await this.database.delete(this.workspaceId, STORE_NAMES.DRAFT_BLOCK, blockId)
  }

  async deleteBlocksByEntity(entityId: string): Promise<void> {
    const blocks = await this.getBlocksByEntity(entityId)
    if (blocks.length === 0) {
      return
    }
    for (const block of blocks) {
      await this.database.delete(this.workspaceId, STORE_NAMES.DRAFT_BLOCK, block.id)
    }
  }

  async clearBlocks(): Promise<void> {
    await this.database.clear(this.workspaceId, STORE_NAMES.DRAFT_BLOCK)
  }
}
