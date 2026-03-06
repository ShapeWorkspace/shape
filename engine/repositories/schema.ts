/**
 * Shared schema definitions for offline entity storage.
 *
 * Defines store names and index configurations used by both:
 * - Repositories (for referencing correct store/index names)
 * - IndexedDB implementation (for creating stores and indexes)
 */

/**
 * Object store names.
 */
export const STORE_NAMES = {
  ENTITY: "entity",
  BLOCK: "block",
  DRAFT: "draft",
  DRAFT_BLOCK: "draft-block",
  WORKSPACE_KEY: "workspace-key",
  MEMBER: "member",
  ENTITY_LINK: "entity-link",
} as const

/**
 * Index names for querying by foreign keys and compound indexes.
 */
export const INDEX_NAMES = {
  UPDATED_AT: "updated_at",
  ENTITY_TYPE: "entity_type",
  ENTITY_ID: "entity_id",
  ENTITY_ID_CREATED_AT: "entity_id_created_at",
  USER_ID: "user_id",
  SOURCE_ENTITY_ID: "source_entity_id",
  TARGET_ENTITY_ID: "target_entity_id",
} as const

/**
 * All store names as an array (for IndexedDB store creation).
 */
export const ALL_STORE_NAMES = Object.values(STORE_NAMES)

/**
 * Index configurations for each store.
 * Each entry defines indexes as [indexName, keyPath].
 * keyPath can be a string for single-field indexes or string[] for compound indexes.
 */
export const STORE_INDEXES: Record<string, Array<[string, string | string[]]>> = {
  [STORE_NAMES.ENTITY]: [
    [INDEX_NAMES.UPDATED_AT, "updated_at"],
    [INDEX_NAMES.ENTITY_TYPE, "entity_type"],
  ],
  [STORE_NAMES.BLOCK]: [
    [INDEX_NAMES.ENTITY_ID, "entity_id"],
    [INDEX_NAMES.ENTITY_ID_CREATED_AT, ["entity_id", "created_at"]],
  ],
  [STORE_NAMES.DRAFT]: [
    [INDEX_NAMES.ENTITY_TYPE, "entity.entity_type"],
    [INDEX_NAMES.UPDATED_AT, "entity.updated_at"],
  ],
  [STORE_NAMES.DRAFT_BLOCK]: [
    [INDEX_NAMES.ENTITY_ID, "entityId"],
    [INDEX_NAMES.ENTITY_ID_CREATED_AT, ["entityId", "createdAt"]],
  ],
  [STORE_NAMES.WORKSPACE_KEY]: [[INDEX_NAMES.USER_ID, "user_id"]],
  [STORE_NAMES.MEMBER]: [
    [INDEX_NAMES.UPDATED_AT, "updatedAt"],
    [INDEX_NAMES.USER_ID, "userId"],
  ],
  [STORE_NAMES.ENTITY_LINK]: [
    [INDEX_NAMES.SOURCE_ENTITY_ID, "source_entity_id"],
    [INDEX_NAMES.TARGET_ENTITY_ID, "target_entity_id"],
  ],
}
