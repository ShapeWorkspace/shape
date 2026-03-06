/**
 * EntityLink model for lightweight link graph.
 *
 * Links are implicit, extracted from TipTap entity link nodes in content.
 * Links are stored unencrypted to enable server-side backlink queries.
 *
 * This powers:
 * - Backlinks ("what links to this?")
 * - Quick navigation between related items
 * - Context surfaces in the Sidecar
 */

/**
 * Link type indicating how the link was created.
 */
export type LinkType = "explicit" | "mention" | "embed"

/**
 * Navigation context for child entities (replies, comments).
 * Stores parent IDs needed for backlink navigation.
 */
export type SourceContext = Record<string, string>

/**
 * An entity link as it appears to the client.
 */
export interface EntityLink {
  id: string
  workspaceId: string
  createdBy: string
  sourceEntityType: string
  sourceEntityId: string
  targetEntityType: string
  targetEntityId: string
  linkType: LinkType
  /** Navigation context for child entities (e.g., channel_id, discussion_id for replies) */
  sourceContext?: SourceContext
  createdAt: Date
}

/**
 * An entity link as returned from the server (snake_case).
 */
export interface EntityLinkDto {
  id: string
  workspace_id: string
  created_by: string
  source_entity_type: string
  source_entity_id: string
  target_entity_type: string
  target_entity_id: string
  link_type: string
  source_context?: Record<string, string>
  created_at: string
}

/**
 * Input for a linked entity when syncing links.
 */
export interface LinkedEntityInput {
  target_entity_type: string
  target_entity_id: string
  link_type: LinkType
  /** Navigation context for child entities (e.g., channel_id, discussion_id for replies) */
  source_context?: Record<string, string>
}

/**
 * Request body for syncing entity links.
 */
export interface SyncEntityLinksRequest {
  source_entity_type: string
  linked_entities: LinkedEntityInput[]
}

/**
 * Response from GET /api/workspaces/{workspaceId}/entity-links/{entityId}
 */
export interface GetEntityLinksResponse {
  links: EntityLinkDto[]
  linked_by: EntityLinkDto[]
}

/**
 * Converts an entity link DTO to an EntityLink.
 */
export function entityLinkFromDto(dto: EntityLinkDto): EntityLink {
  return {
    id: dto.id,
    workspaceId: dto.workspace_id,
    createdBy: dto.created_by,
    sourceEntityType: dto.source_entity_type,
    sourceEntityId: dto.source_entity_id,
    targetEntityType: dto.target_entity_type,
    targetEntityId: dto.target_entity_id,
    linkType: dto.link_type as LinkType,
    sourceContext: dto.source_context,
    createdAt: new Date(dto.created_at),
  }
}

/**
 * Converts an array of entity link DTOs to EntityLinks.
 */
export function entityLinksFromDtos(dtos: EntityLinkDto[]): EntityLink[] {
  return dtos.map(entityLinkFromDto)
}
