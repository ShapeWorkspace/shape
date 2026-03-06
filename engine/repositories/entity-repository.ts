/**
 * Repository for offline draft entity storage.
 *
 * Entity entities are stored separately from canonical entities and are
 * keyed by the entity ID (one draft per entity).
 */

import type { IOfflineDatabase } from "./offline-database"
import { STORE_NAMES, INDEX_NAMES } from "./schema"
import { ServerEntity } from "../models/entity"
import { EntityType } from "../utils/encryption-types"

export class EntityRepository {
  constructor(
    private database: IOfflineDatabase,
    private readonly workspaceId: string
  ) {}

  /**
   * Retrieves a single draft entity by entity ID.
   */
  async getEntity(entityId: string): Promise<ServerEntity | undefined> {
    return this.database.get<ServerEntity>(this.workspaceId, STORE_NAMES.ENTITY, entityId)
  }

  /**
   * Retrieves all draft entities for a workspace.
   * Sorted by updated_at descending to surface most recent drafts first.
   */
  async getEntitys(): Promise<ServerEntity[]> {
    return this.database.getAllSorted<ServerEntity>(
      this.workspaceId,
      STORE_NAMES.ENTITY,
      INDEX_NAMES.UPDATED_AT,
      "prev"
    )
  }

  /**
   * Retrieves all drafts for a specific entity type.
   */
  async getEntitysByType(entityType: EntityType): Promise<ServerEntity[]> {
    return this.database.getByIndex<ServerEntity>(
      this.workspaceId,
      STORE_NAMES.ENTITY,
      INDEX_NAMES.ENTITY_TYPE,
      entityType
    )
  }

  /**
   * Saves a draft entity (upsert).
   */
  async saveEntity(draft: ServerEntity): Promise<void> {
    await this.database.put(this.workspaceId, STORE_NAMES.ENTITY, draft)
  }

  /**
   * Saves multiple draft entities (upsert).
   */
  async saveEntitys(drafts: ServerEntity[]): Promise<void> {
    await this.database.putMany(this.workspaceId, STORE_NAMES.ENTITY, drafts)
  }

  /**
   * Deletes a draft entity by entity ID.
   */
  async deleteEntity(entityId: string): Promise<void> {
    await this.database.delete(this.workspaceId, STORE_NAMES.ENTITY, entityId)
  }

  /**
   * Clears all drafts for a workspace.
   */
  async clearEntitys(): Promise<void> {
    await this.database.clear(this.workspaceId, STORE_NAMES.ENTITY)
  }
}
