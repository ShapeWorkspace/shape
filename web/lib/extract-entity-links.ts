/**
 * Utility for extracting entity links from TipTap content.
 *
 * Entity links can exist in two forms:
 * 1. HTML content (notes, comments, etc.) - stored as <span data-entity-link> elements
 * 2. EntityLinkInfo from EntityLinkMonitor (papers/Yjs) - already parsed
 *
 * This module provides utilities to extract LinkedEntityInput[] for syncing
 * with the entity link service.
 */

import type { LinkedEntityInput } from "../../engine/models/entity-link"
import type { EntityLinkInfo } from "../components/tiptap-extensions/EntityLinkMonitorPlugin"
import { isEntityType, normalizeEntityTypeForEntityLink } from "./entity-link-normalization"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/**
 * Converts EntityLinkInfo from the EntityLinkMonitor to LinkedEntityInput.
 *
 * Used for Papers (Yjs) where the EntityLinkMonitor already provides
 * parsed link information via callbacks.
 *
 * @param links - Array of EntityLinkInfo from the EntityLinkMonitor
 * @returns Array of LinkedEntityInput for the sync API
 */
export function convertEntityLinksToLinkedEntities(links: EntityLinkInfo[]): LinkedEntityInput[] {
  // Use a Map to deduplicate by target entity ID
  // (same entity can be linked multiple times in a document)
  const uniqueLinks = new Map<string, LinkedEntityInput>()

  for (const link of links) {
    const targetEntityId = link.entityId

    // Skip if we've already seen this entity (deduplicate)
    if (uniqueLinks.has(targetEntityId)) {
      continue
    }

    uniqueLinks.set(targetEntityId, {
      target_entity_type: normalizeEntityTypeForEntityLink(link.entityType),
      target_entity_id: targetEntityId,
      link_type: "explicit",
    })
  }

  return Array.from(uniqueLinks.values())
}

/**
 * Extracts entity links from HTML content.
 *
 * Parses HTML to find <span data-entity-link> elements and extracts
 * the entity link information from data attributes.
 *
 * Used for Notes, Comments, and other entities that store TipTap content as HTML.
 *
 * @param html - The HTML content string to parse
 * @param sourceContext - Optional navigation context for child entities (e.g., channel_id, discussion_id for replies)
 * @returns Array of LinkedEntityInput for the sync API
 */
export function extractEntityLinksFromHtml(
  html: string,
  sourceContext?: Record<string, string>
): LinkedEntityInput[] {
  if (!html || typeof html !== "string") {
    return []
  }

  // Use DOMParser to safely parse HTML
  // Note: This runs in browser environment only
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")

  // Find all entity link spans
  const linkElements = doc.querySelectorAll("span[data-entity-link]")

  // Use a Map to deduplicate by target entity ID
  const uniqueLinks = new Map<string, LinkedEntityInput>()

  linkElements.forEach(element => {
    const entityId = element.getAttribute("data-entity-id")
    const entityTypeValue = element.getAttribute("data-entity-type")
    // Skip if missing required attributes
    if (!entityId || !entityTypeValue || !isEntityType(entityTypeValue)) {
      return
    }

    const targetEntityId = entityId

    // Skip if we've already seen this entity (deduplicate)
    if (uniqueLinks.has(targetEntityId)) {
      return
    }

    const linkedEntity: LinkedEntityInput = {
      target_entity_type: normalizeEntityTypeForEntityLink(entityTypeValue),
      target_entity_id: targetEntityId,
      link_type: "explicit",
    }

    // Attach source context if provided (for child entity navigation)
    if (sourceContext) {
      linkedEntity.source_context = sourceContext
    }

    uniqueLinks.set(targetEntityId, linkedEntity)
  })

  return Array.from(uniqueLinks.values())
}

/**
 * Extracts entity links from EntityLinkMonitor info.
 *
 * Task links are normalized at the node/URL layer so entityId is the task ID.
 *
 * @param links - Array of EntityLinkInfo from the EntityLinkMonitor
 * @returns Array of LinkedEntityInput for the sync API
 */
export function extractLinkedEntitiesFromMonitor(links: EntityLinkInfo[]): LinkedEntityInput[] {
  // Use a Map to deduplicate by target entity ID
  const uniqueLinks = new Map<string, LinkedEntityInput>()

  for (const link of links) {
    const targetEntityId = link.entityId

    // Skip if we've already seen this entity
    if (uniqueLinks.has(targetEntityId)) {
      continue
    }

    uniqueLinks.set(targetEntityId, {
      target_entity_type: normalizeEntityTypeForEntityLink(link.entityType),
      target_entity_id: targetEntityId,
      link_type: "explicit",
    })
  }

  return Array.from(uniqueLinks.values())
}

/**
 * Extracts entity links from TipTap JSON content.
 *
 * Parses JSON content to find entityLink nodes and extracts
 * the entity link information from node attributes.
 *
 * Used for comments/replies that store TipTap content as JSON.
 *
 * @param content - The TipTap JSON content to parse
 * @param sourceContext - Optional navigation context for child entities (e.g., paper IDs for replies)
 * @returns Array of LinkedEntityInput for the sync API
 */
export function extractEntityLinksFromTipTapJson(
  content: unknown,
  sourceContext?: Record<string, string>
): LinkedEntityInput[] {
  const uniqueLinks = new Map<string, LinkedEntityInput>()

  const visitNode = (node: unknown): void => {
    if (!node) {
      return
    }

    if (Array.isArray(node)) {
      for (const child of node) {
        visitNode(child)
      }
      return
    }

    if (!isRecord(node)) {
      return
    }

    if (node.type === "entityLink") {
      const attrsValue = node.attrs
      if (isRecord(attrsValue)) {
        const entityTypeValue = attrsValue.entityType
        const entityIdValue = attrsValue.entityId

        if (
          typeof entityTypeValue === "string" &&
          isEntityType(entityTypeValue) &&
          typeof entityIdValue === "string"
        ) {
          const targetEntityId = entityIdValue

          if (!uniqueLinks.has(targetEntityId)) {
            const linkedEntity: LinkedEntityInput = {
              target_entity_type: normalizeEntityTypeForEntityLink(entityTypeValue),
              target_entity_id: targetEntityId,
              link_type: "explicit",
            }

            if (sourceContext) {
              linkedEntity.source_context = sourceContext
            }

            uniqueLinks.set(targetEntityId, linkedEntity)
          }
        }
      }
    }

    const contentValue = node.content
    if (contentValue) {
      visitNode(contentValue)
    }
  }

  visitNode(content)

  return Array.from(uniqueLinks.values())
}

/**
 * Extracts mentioned user IDs from HTML content.
 *
 * Mentions are represented as EntityLink nodes pointing at contacts (workspace members).
 * We treat contact entity links as mentions for notification purposes.
 *
 * @param html - The HTML content string to parse
 * @returns Array of unique mentioned user IDs
 */
export function extractMentionedUserIdsFromHtml(html: string): string[] {
  if (!html || typeof html !== "string") {
    return []
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")

  const mentionElements = doc.querySelectorAll(
    'span[data-entity-link][data-entity-type="contact"], span[data-entity-link][data-entity-type="member"]'
  )

  const mentionedUserIds = new Set<string>()
  mentionElements.forEach(element => {
    const entityId = element.getAttribute("data-entity-id")
    if (!entityId) {
      return
    }
    mentionedUserIds.add(entityId)
  })

  return Array.from(mentionedUserIds)
}

/**
 * Re-export the LinkedEntityInput type for convenience.
 */
export type { LinkedEntityInput }
