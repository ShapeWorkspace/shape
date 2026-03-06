/**
 * Repository for offline draft entity storage.
 *
 * Draft entities are stored separately from canonical entities and are
 * keyed by the entity ID (one draft per entity).
 */

import type { IOfflineDatabase } from "./offline-database"
import { STORE_NAMES, INDEX_NAMES } from "./schema"
import { Draft } from "../models/entity"
import { EntityType } from "../utils/encryption-types"

export class DraftRepository {
  constructor(
    private database: IOfflineDatabase,
    private readonly workspaceId: string
  ) {}

  /**
   * Retrieves a single draft entity by entity ID.
   */
  async getDraft(entityId: string): Promise<Draft | undefined> {
    return this.database.get<Draft>(this.workspaceId, STORE_NAMES.DRAFT, entityId)
  }

  /**
   * Retrieves all draft entities for a workspace.
   * Sorted by updated_at descending to surface most recent drafts first.
   */
  async getDrafts(): Promise<Draft[]> {
    return this.database.getAllSorted<Draft>(
      this.workspaceId,
      STORE_NAMES.DRAFT,
      INDEX_NAMES.UPDATED_AT,
      "prev"
    )
  }

  /**
   * Retrieves all drafts for a specific entity type.
   */
  async getDraftsByType(entityType: EntityType): Promise<Draft[]> {
    return this.database.getByIndex<Draft>(
      this.workspaceId,
      STORE_NAMES.DRAFT,
      INDEX_NAMES.ENTITY_TYPE,
      entityType
    )
  }

  /**
   * Saves a draft entity (upsert).
   */
  async saveDraft(draft: Draft): Promise<void> {
    await this.database.put(this.workspaceId, STORE_NAMES.DRAFT, draft)
  }

  /**
   * Saves multiple draft entities (upsert).
   */
  async saveDrafts(drafts: Draft[]): Promise<void> {
    await this.database.putMany(this.workspaceId, STORE_NAMES.DRAFT, drafts)
  }

  /**
   * Deletes a draft entity by entity ID.
   */
  async deleteDraft(entityId: string): Promise<void> {
    await this.database.delete(this.workspaceId, STORE_NAMES.DRAFT, entityId)
  }

  /**
   * Clears all drafts for a workspace.
   */
  async clearDrafts(): Promise<void> {
    await this.database.clear(this.workspaceId, STORE_NAMES.DRAFT)
  }
}
