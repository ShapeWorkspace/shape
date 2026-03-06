/**
 * Shared utility functions for hierarchical entity encryption.
 *
 * These utilities build associated data strings that cryptographically bind
 * ciphertext to specific entities and key chains, preventing misuse of
 * encrypted data across different contexts.
 */

import { EntityType, WrappingKeyType } from "../../utils/encryption-types"

/**
 * Builds associated data for wrapping an entity key with hierarchical key support.
 *
 * Format distinguishes between workspace key and parent entity key wrapping:
 * - Workspace: shape:v1:entity:<workspaceId>:<entityType>:<entityId>:entitykey:workspace:<workspaceKeyId>
 * - Folder: shape:v1:entity:<workspaceId>:<entityType>:<entityId>:entitykey:folder:<parentFolderId>
 * - Paper: shape:v1:entity:<workspaceId>:<entityType>:<entityId>:entitykey:paper:<paperId>
 *
 * @param workspaceId - The workspace containing the entity
 * @param entityType - Type of entity being encrypted (folder, paper, file, etc.)
 * @param entityId - The entity's unique identifier
 * @param wrappingKeyType - Type of wrapping key (workspace, folder, paper)
 * @param wrappingKeyId - ID of the wrapping key (workspace key ID or parent entity ID)
 */
export function buildEntityKeyWrappingAssociatedData(
  workspaceId: string,
  entityType: EntityType,
  entityId: string,
  wrappingKeyType: WrappingKeyType,
  wrappingKeyId: string
): string {
  return `shape:v1:entity:${workspaceId}:${entityType}:${entityId}:entitykey:${wrappingKeyType}:${wrappingKeyId}`
}

/**
 * Builds associated data for encrypting entity content with an entity key.
 *
 * The entity ID is included to bind the content to a specific entity,
 * preventing content from being moved between entities without detection.
 *
 * Format: shape:v1:entity:<workspaceId>:<entityType>:<entityId>:content:<entityId>
 *
 * @param workspaceId - The workspace containing the entity
 * @param entityType - Type of entity being encrypted
 * @param entityId - The entity's unique identifier
 */
export function buildContentEncryptionAssociatedData(
  workspaceId: string,
  entityType: EntityType,
  entityId: string
): string {
  return `shape:v1:entity:${workspaceId}:${entityType}:${entityId}:content:${entityId}`
}
