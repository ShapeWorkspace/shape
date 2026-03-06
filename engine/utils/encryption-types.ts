import { HexString } from "../crypto/types"
import { ClientEntity } from "../models/entity"
import { DecryptedWorkspaceKey } from "../models/workspace-key"

export type EntityType =
  | "block"
  | "direct-message"
  | "entity-link"
  | "file"
  | "folder"
  | "forum-channel"
  | "forum-discussion"
  | "forum-reply"
  | "group-chat"
  | "group-message"
  | "note"
  | "paper-comment-reply"
  | "paper-comment"
  | "paper"
  | "project-tag"
  | "task"
  | "project"
  | "reaction"
  | "task-comment"
  | "user-profile"
  | "workspace-member"

/**
 * Type of key used to wrap an entity's key in hierarchical encryption.
 * - "workspace": Entity key is wrapped directly with the workspace key (root-level entities)
 * - "folder": Entity key is wrapped with a parent folder's entity key (nested entities)
 * - "paper": Entity key is wrapped with a parent paper's entity key (paper comments/replies)
 */
export type WrappingKeyType = "workspace" | EntityType

/**
 * A key used to wrap (encrypt) entity keys in hierarchical encryption.
 * Discriminated union that clearly distinguishes workspace keys from folder keys.
 */
export type WrappingKey = DecryptedWorkspaceKey | ClientEntity

/**
 * Gets the ID to use when constructing the associated data for entity key wrapping.
 * - For workspace keys: the workspace key ID
 * - For folder keys: the parent folder ID
 */
export function getWrappingKeyId(wrappingKey: WrappingKey): string {
  return wrappingKey.id
}

function isDecryptedEntity(wrappingKey: WrappingKey): wrappingKey is ClientEntity {
  return "entityType" in wrappingKey
}

function isDecryptedWorkspaceKey(wrappingKey: WrappingKey): wrappingKey is DecryptedWorkspaceKey {
  return "generation" in wrappingKey
}

/**
 * Gets the workspace key ID at the root of the encryption chain.
 * - For workspace keys: the workspace key ID itself
 * - For folder keys: the chain root key ID
 */
export function getChainRootKeyId(wrappingKey: WrappingKey): string {
  if (isDecryptedEntity(wrappingKey)) {
    return wrappingKey.chainRootKeyId
  } else if (isDecryptedWorkspaceKey(wrappingKey)) {
    return wrappingKey.id
  } else {
    throw new Error("Invalid wrapping key type")
  }
}

export function getWrappingKeyKey(wrappingKey: WrappingKey): HexString {
  if (isDecryptedEntity(wrappingKey)) {
    return wrappingKey.entityKey
  } else if (isDecryptedWorkspaceKey(wrappingKey)) {
    return wrappingKey.key
  } else {
    throw new Error("Invalid wrapping key type")
  }
}

/**
 * Returns the prefix used in hierarchical associated data for a wrapping key type.
 */
export function getWrappingKeyType(wrappingKey: WrappingKey): WrappingKeyType {
  if (isDecryptedEntity(wrappingKey)) {
    if (!wrappingKey.entityType) {
      throw new Error("Missing entity type for wrapping key")
    }
    return wrappingKey.entityType
  } else if (isDecryptedWorkspaceKey(wrappingKey)) {
    return "workspace"
  } else {
    throw new Error("Invalid wrapping key type")
  }
}
