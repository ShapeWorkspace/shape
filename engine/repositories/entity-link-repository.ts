/**
 * Repository for offline entity link storage.
 *
 * Entity links are stored unencrypted for efficient server-side queries.
 * The repository provides local caching for offline support.
 */

import type { EntityLinkDto } from "../models/entity-link"
import type { IOfflineDatabase } from "./offline-database"
import { INDEX_NAMES, STORE_NAMES } from "./schema"

/**
 * Repository for entity link storage operations using IOfflineDatabase.
 */
export class EntityLinkRepository {
  constructor(private database: IOfflineDatabase) {}

  /**
   * Gets all links where the given entity is the source (outgoing links).
   */
  async getLinksFrom(workspaceId: string, sourceEntityId: string): Promise<EntityLinkDto[]> {
    return this.database.getByIndex<EntityLinkDto>(
      workspaceId,
      STORE_NAMES.ENTITY_LINK,
      INDEX_NAMES.SOURCE_ENTITY_ID,
      sourceEntityId
    )
  }

  /**
   * Gets all links where the given entity is the target (backlinks).
   */
  async getLinksTo(workspaceId: string, targetEntityId: string): Promise<EntityLinkDto[]> {
    return this.database.getByIndex<EntityLinkDto>(
      workspaceId,
      STORE_NAMES.ENTITY_LINK,
      INDEX_NAMES.TARGET_ENTITY_ID,
      targetEntityId
    )
  }

  /**
   * Gets a single link by ID.
   */
  async getLink(workspaceId: string, linkId: string): Promise<EntityLinkDto | undefined> {
    return this.database.get<EntityLinkDto>(workspaceId, STORE_NAMES.ENTITY_LINK, linkId)
  }

  /**
   * Saves multiple links to the offline store.
   */
  async saveLinks(workspaceId: string, links: EntityLinkDto[]): Promise<void> {
    return this.database.putMany(workspaceId, STORE_NAMES.ENTITY_LINK, links)
  }

  /**
   * Saves a single link to the offline store.
   */
  async saveLink(workspaceId: string, link: EntityLinkDto): Promise<void> {
    return this.database.put(workspaceId, STORE_NAMES.ENTITY_LINK, link)
  }

  /**
   * Deletes a link from the offline store.
   */
  async deleteLink(workspaceId: string, linkId: string): Promise<void> {
    return this.database.delete(workspaceId, STORE_NAMES.ENTITY_LINK, linkId)
  }

  /**
   * Deletes all links where the given entity is the source (outgoing links).
   * Used after sync to clear stale cache.
   */
  async deleteLinksFrom(workspaceId: string, sourceEntityId: string): Promise<void> {
    const linksFrom = await this.getLinksFrom(workspaceId, sourceEntityId)
    for (const link of linksFrom) {
      await this.database.delete(workspaceId, STORE_NAMES.ENTITY_LINK, link.id)
    }
  }

  /**
   * Deletes all links for an entity (both as source and target).
   * Used when an entity is deleted.
   */
  async deleteLinksForEntity(workspaceId: string, entityId: string): Promise<void> {
    // Delete where entity is the source
    const linksFrom = await this.getLinksFrom(workspaceId, entityId)
    for (const link of linksFrom) {
      await this.database.delete(workspaceId, STORE_NAMES.ENTITY_LINK, link.id)
    }

    // Delete where entity is the target
    const linksTo = await this.getLinksTo(workspaceId, entityId)
    for (const link of linksTo) {
      await this.database.delete(workspaceId, STORE_NAMES.ENTITY_LINK, link.id)
    }
  }

  /**
   * Replaces all links for a source entity with new links.
   * Used by sync operation.
   */
  async replaceLinksFrom(
    workspaceId: string,
    sourceEntityId: string,
    newLinks: EntityLinkDto[]
  ): Promise<void> {
    // Delete existing links from this source
    const existingLinks = await this.getLinksFrom(workspaceId, sourceEntityId)
    for (const link of existingLinks) {
      await this.database.delete(workspaceId, STORE_NAMES.ENTITY_LINK, link.id)
    }

    // Save new links
    if (newLinks.length > 0) {
      await this.saveLinks(workspaceId, newLinks)
    }
  }
}
