/**
 * Repository for offline workspace key storage.
 *
 * Workspace keys are indexed by user_id since each user has their own
 * decrypted version of the key (from their key share). The composite ID
 * ensures isolation between users while allowing efficient lookup.
 */

import { IOfflineDatabase } from "./offline-database"
import { STORE_NAMES, INDEX_NAMES } from "./schema"

/**
 * Stored format for a decrypted workspace key.
 * The 'id' field is a composite key: `${workspaceKeyId}:${userId}`
 * This is so that if a user is signed into multiple accounts on the same workspace,
 * we get the right one.
 */
export interface StoredWorkspaceKey {
  id: string // Composite: `${workspaceKeyId}:${userId}`
  workspace_key_id: string // The actual workspace key ID
  workspace_id: string
  user_id: string // User who decrypted this key
  generation: number
  key: string // Hex-encoded symmetric key
}

/**
 * Builds the composite ID for storage.
 */
function buildCompositeId(workspaceKeyId: string, userId: string): string {
  return `${workspaceKeyId}:${userId}`
}

/**
 * Repository for workspace key storage operations using IOfflineDatabase.
 */
export class WorkspaceKeyRepository {
  constructor(private database: IOfflineDatabase) {}

  /**
   * Gets all workspace keys for a specific user in a workspace.
   */
  async getKeysByUser(workspaceId: string, userId: string): Promise<StoredWorkspaceKey[]> {
    return this.database.getByIndex<StoredWorkspaceKey>(
      workspaceId,
      STORE_NAMES.WORKSPACE_KEY,
      INDEX_NAMES.USER_ID,
      userId
    )
  }

  /**
   * Gets a specific workspace key by its ID for a user.
   */
  async getKey(
    workspaceId: string,
    workspaceKeyId: string,
    userId: string
  ): Promise<StoredWorkspaceKey | undefined> {
    const compositeId = buildCompositeId(workspaceKeyId, userId)
    return this.database.get<StoredWorkspaceKey>(workspaceId, STORE_NAMES.WORKSPACE_KEY, compositeId)
  }

  /**
   * Saves a workspace key for a user.
   */
  async saveKey(workspaceId: string, key: StoredWorkspaceKey): Promise<void> {
    return this.database.put(workspaceId, STORE_NAMES.WORKSPACE_KEY, key)
  }

  /**
   * Saves multiple workspace keys.
   */
  async saveKeys(workspaceId: string, keys: StoredWorkspaceKey[]): Promise<void> {
    return this.database.putMany(workspaceId, STORE_NAMES.WORKSPACE_KEY, keys)
  }

  /**
   * Deletes a workspace key for a user.
   */
  async deleteKey(workspaceId: string, workspaceKeyId: string, userId: string): Promise<void> {
    const compositeId = buildCompositeId(workspaceKeyId, userId)
    return this.database.delete(workspaceId, STORE_NAMES.WORKSPACE_KEY, compositeId)
  }

  /**
   * Converts a DecryptedWorkspaceKey to StoredWorkspaceKey format.
   */
  static toStoredFormat(
    workspaceKeyId: string,
    workspaceId: string,
    userId: string,
    generation: number,
    key: string
  ): StoredWorkspaceKey {
    return {
      id: buildCompositeId(workspaceKeyId, userId),
      workspace_key_id: workspaceKeyId,
      workspace_id: workspaceId,
      user_id: userId,
      generation,
      key,
    }
  }
}
