/**
 * EntityLinkService handles entity link operations.
 *
 * Entity links are a lightweight graph for backlinks and navigation.
 * Links are stored unencrypted to enable server-side queries.
 */

import { ExecuteAuthenticatedRequest } from "../usecase/network/ExecuteAuthenticatedRequest"
import { EntityLinkRepository } from "../repositories/entity-link-repository"
import {
  EntityLink,
  LinkedEntityInput,
  GetEntityLinksResponse,
  SyncEntityLinksRequest,
  entityLinksFromDtos,
} from "../models/entity-link"
import { Result } from "../utils/Result"
import { logger } from "../utils/logger"

/**
 * Response structure for getEntityLinks containing both outgoing links and backlinks.
 */
export interface EntityLinksResult {
  /** Entities this source links to */
  links: EntityLink[]
  /** Entities that link to this target (backlinks) */
  linkedBy: EntityLink[]
}

export class EntityLinkService {
  constructor(
    private executeAuthenticatedRequest: ExecuteAuthenticatedRequest,
    private entityLinkRepository: EntityLinkRepository
  ) {}

  /**
   * Fetches entity links for an entity (both outgoing links and backlinks).
   *
   * Implements stale-while-revalidate pattern:
   * 1. Check offline cache first and return cached links immediately if available
   * 2. Fetch from network in parallel and update cache
   * 3. If network fails, cached links are still returned
   *
   * @param workspaceId - The workspace ID
   * @param entityId - The entity ID to get links for
   * @param entityType - The type of entity (for future optimization, optional)
   */
  async getEntityLinks(
    workspaceId: string,
    entityId: string,
    entityType?: string
  ): Promise<Result<EntityLinksResult>> {
    // Step 1: Try offline cache first
    let cachedResult: EntityLinksResult | null = null
    try {
      const cachedLinksFrom = await this.entityLinkRepository.getLinksFrom(workspaceId, entityId)
      const cachedLinksTo = await this.entityLinkRepository.getLinksTo(workspaceId, entityId)

      if (cachedLinksFrom.length > 0 || cachedLinksTo.length > 0) {
        cachedResult = {
          links: entityLinksFromDtos(cachedLinksFrom),
          linkedBy: entityLinksFromDtos(cachedLinksTo),
        }
        logger.debug(
          `Loaded ${cachedLinksFrom.length} outgoing links and ${cachedLinksTo.length} backlinks from offline cache`
        )
      }
    } catch (cacheError) {
      logger.warn("Failed to load entity links from offline cache:", cacheError)
    }

    // Step 2: Fetch from network
    let response: GetEntityLinksResponse
    try {
      // Include entity_type as query param if provided
      const queryParams = entityType ? `?entity_type=${encodeURIComponent(entityType)}` : ""
      response = await this.executeAuthenticatedRequest.executeGet<GetEntityLinksResponse>(
        `/workspaces/${workspaceId}/entity-links/${entityId}${queryParams}`
      )
    } catch (error) {
      if (cachedResult) {
        logger.debug("Network unavailable, returning cached entity links")
        return Result.ok(cachedResult)
      }
      const message = error instanceof Error ? error.message : "Unknown error"
      return Result.fail(`Failed to fetch entity links: ${message}`)
    }

    // Step 3: Cache network response
    try {
      // Store all links in cache
      const allLinks = [...response.links, ...response.linked_by]
      if (allLinks.length > 0) {
        await this.entityLinkRepository.saveLinks(workspaceId, allLinks)
      }
    } catch (cacheError) {
      logger.warn("Failed to cache entity links:", cacheError)
    }

    // Step 4: Return converted result
    const result: EntityLinksResult = {
      links: entityLinksFromDtos(response.links),
      linkedBy: entityLinksFromDtos(response.linked_by),
    }

    return Result.ok(result)
  }

  /**
   * Syncs entity links for a source entity.
   * This is used by Papers (Yjs) and other entities that need to update their links.
   * The server will atomically delete removed links and create new ones.
   *
   * @param workspaceId - The workspace ID
   * @param entityId - The source entity ID
   * @param sourceEntityType - The type of source entity (paper, task, note, etc.)
   * @param linkedEntities - The complete list of entities the source links to
   */
  async syncEntityLinks(
    workspaceId: string,
    entityId: string,
    sourceEntityType: string,
    linkedEntities: LinkedEntityInput[]
  ): Promise<Result<void>> {
    const request: SyncEntityLinksRequest = {
      source_entity_type: sourceEntityType,
      linked_entities: linkedEntities,
    }

    try {
      // Use networkPostNoContent since the sync endpoint returns 204 No Content
      await this.executeAuthenticatedRequest.executePostNoContent(
        `/workspaces/${workspaceId}/entity-links/${entityId}/sync`,
        JSON.stringify(request)
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      return Result.fail(`Failed to sync entity links: ${message}`)
    }

    // Clear local cache for this entity so next read fetches fresh data.
    // We don't re-fetch immediately to avoid an extra network request on every save.
    try {
      await this.entityLinkRepository.deleteLinksFrom(workspaceId, entityId)
    } catch (cacheError) {
      // Non-fatal: sync succeeded, just cache clear failed
      logger.warn("Failed to clear entity links cache after sync:", cacheError)
    }

    return Result.ok(undefined)
  }
}
