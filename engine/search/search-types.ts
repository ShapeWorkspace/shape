/**
 * Search Types
 *
 * Core type definitions for the FlexSearch-powered client-side search system.
 * These types are shared between the main thread and web worker.
 */

import { ClientEntity, EntityContent, ServerEntity } from "../models/entity"
import type { EntityType } from "../utils/encryption-types"
import { WrappingKey } from "../utils/encryption-types"

/**
 * Searchable entity types.
 * Each type defines which fields are indexed for that entity.
 */
export type SearchableEntityType =
  | "note"
  | "paper" // Collaborative rich-text document (indexed via Yjs plaintext extraction)
  | "paper-comment" // Paper comment thread (anchored comment)
  | "paper-comment-reply" // Reply to a paper comment thread
  | "project" // Project (task container)
  | "task" // Project task
  | "project-tag" // Task tag
  | "task-comment" // Task comment (encrypted comment body)
  | "file"
  | "folder"
  | "forum-channel" // Forum channel (ACL-protected container)
  | "forum-discussion" // Forum discussion (thread in a channel)
  | "forum-reply" // Forum reply (message in a discussion thread)
  | "group-chat" // Group chat room
  | "group-message" // Group message
  | "direct-message" // Direct message
  | "workspace-member" // Workspace member (contacts/team members)

export const SEARCHABLE_ENTITY_TYPES = [
  "note",
  "paper",
  "paper-comment",
  "paper-comment-reply",
  "project",
  "task",
  "project-tag",
  "task-comment",
  "file",
  "folder",
  "forum-channel",
  "forum-discussion",
  "forum-reply",
  "group-chat",
  "group-message",
  "direct-message",
  "workspace-member",
] as const satisfies readonly SearchableEntityType[]

export function isSearchableEntityType(entityType: string): entityType is SearchableEntityType {
  return SEARCHABLE_ENTITY_TYPES.includes(entityType as SearchableEntityType)
}

/**
 * Parent context IDs for hierarchical filtering.
 * Enables searching within a specific project, room, folder, etc.
 */
export interface SearchParentIds {
  roomId?: string // For chat messages
  channelId?: string // For forum messages/discussions/replies
  discussionId?: string // For forum replies
  projectId?: string // For tasks
  taskId?: string // For task comments
  folderId?: string // For files
  paperId?: string // For paper comment threads/replies
  commentId?: string // For paper comment replies
}

/**
 * Metadata associated with a search document.
 * Used for filtering and navigation after search.
 */
export interface SearchDocumentMetadata {
  entityId: string
  entityType: SearchableEntityType
  workspaceId: string
  parentIds?: SearchParentIds
  createdAt: string // ISO 8601
  updatedAt: string // ISO 8601
}

/**
 * Document stored in the FlexSearch index.
 * The 'id' is composite: "{entityType}:{entityId}" for global uniqueness.
 */
export interface SearchDocument {
  // Composite ID: "note:uuid" or "task:uuid"
  id: string
  // Entity type for filtering
  type: SearchableEntityType
  // Indexed text fields (varies by entity type)
  fields: Record<string, string>
  // Metadata for filtering and navigation
  metadata: SearchDocumentMetadata
}

/**
 * A single search hit returned from the index.
 * Contains only entity identification - caller fetches full data from service caches.
 */
export interface SearchHit {
  entityId: string
  entityType: SearchableEntityType
  score: number
}

/**
 * Options for filtering and limiting search results.
 */
export interface SearchQueryOptions {
  // Filter by entity type(s) - if undefined, search all types
  entityTypes?: SearchableEntityType[]
  // Maximum results to return (default: 50)
  limit?: number
}

/**
 * Parameters for indexing a plaintext entity.
 * Used when the entity content is already decrypted (e.g., after local edit).
 */
export interface PlaintextIndexParams {
  entityType: SearchableEntityType
  entityId: string
  workspaceId: string
  plaintextFields: EntityContent
  parentIds: SearchParentIds
  createdAt: string
  updatedAt: string
}

export type FlexSearchDocument = {
  id: string
} & Record<string, string>

export type EntityDecryptionBundle = {
  entity: ServerEntity
  wrappingKey: WrappingKey
}

export interface SearchIndexInterface {
  isInitialized: boolean
  initialize(): Promise<void>
  indexClientEntity(
    entity: ClientEntity,
    options?: { notify?: boolean; skipDebounce?: boolean }
  ): void
  decryptAndIndexServerEntity(entity: EntityDecryptionBundle): Promise<void>
  decryptAndIndexServerEntityBatch(entities: EntityDecryptionBundle[]): Promise<void>
  removeEntity(id: string, entityType: EntityType): Promise<void>
  addIndexObserver(observer: () => void): void
  removeIndexObserver(observer: () => void): void
  search(query: string, options?: SearchQueryOptions): Promise<SearchHit[]>
}

/**
 * Helper to parse a composite document ID.
 */
export function parseSearchDocumentId(
  id: string
): { entityType: SearchableEntityType; entityId: string } | null {
  const colonIndex = id.indexOf(":")
  if (colonIndex === -1) {
    return null
  }
  const entityType = id.substring(0, colonIndex)
  if (!isSearchableEntityType(entityType)) {
    return null
  }
  const entityId = id.substring(colonIndex + 1)
  return { entityType, entityId }
}
