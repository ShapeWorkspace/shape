import { Crypto } from "../../crypto/crypto"
import { LOCAL_ANONYMOUS_WORKSPACE_USER_ID, Workspace, WORKSPACE_KEY_BYTES } from "../../models/workspace"
import { DecryptedWorkspaceKey } from "../../models/workspace-key"
import { WorkspaceKeyRepository } from "../../repositories"
import { WorkspaceStore } from "../../store/workspace-store"
import { Result } from "../../utils/Result"
import { UseCaseInterface } from "../../utils/UseCase/UseCaseInterface"
import { logger } from "../../utils/logger"

/**
 * Creates a local-only workspace for anonymous/offline usage.
 *
 * This use case handles the full workflow:
 * 1. Generates a new workspace UUID and key ID
 * 2. Creates a fresh symmetric workspace key for local encryption
 * 3. Persists the plaintext key to IndexedDB (no identity wrapping before signup)
 * 4. Creates and persists the workspace model
 * 5. Sets it as the current workspace
 *
 * The workspace key is stored under a reserved anonymous user ID since there's
 * no authenticated identity available before signup.
 */
export class CreateLocalWorkspace implements UseCaseInterface<Workspace> {
  constructor(
    private readonly crypto: Crypto,
    private readonly keyRepository: WorkspaceKeyRepository,
    private readonly workspaceStore: WorkspaceStore
  ) {}

  async execute(name: string): Promise<Result<Workspace>> {
    const now = new Date().toISOString()
    const workspaceId = this.crypto.generateUUID()
    const workspaceKeyId = this.crypto.generateUUID()

    // Generate a fresh symmetric workspace key for local-only encryption.
    // This key is used to encrypt all entities in this workspace and is stored
    // in plaintext locally (no identity-key wrapping available before signup).
    const workspaceKey = this.crypto.generateRandomKey(WORKSPACE_KEY_BYTES)

    const workspace = new Workspace({
      uuid: workspaceId,
      name,
      subdomain: "",
      userId: LOCAL_ANONYMOUS_WORKSPACE_USER_ID,
      onboardingCompleted: false,
      acquisitionCampaign: null,
      isRegisteredWithServer: false,
      currentWorkspaceKeyId: workspaceKeyId,
      createdAt: now,
      updatedAt: now,
      subscription: null,
    })

    // Persist the plaintext workspace key for the anonymous local user.
    const decryptedKey: DecryptedWorkspaceKey = {
      id: workspaceKeyId,
      workspaceId,
      generation: 1,
      key: workspaceKey,
    }

    try {
      await this.persistLocalWorkspaceKey(decryptedKey)

      this.workspaceStore.setWorkspace(workspace)
      this.workspaceStore.setCurrentWorkspace(workspace)

      await Promise.all([
        this.workspaceStore.persistWorkspaces(),
        this.workspaceStore.persistCurrentWorkspace(),
        this.workspaceStore.persistWorkspaceEntrySelections(),
      ])

      return Result.ok(workspace)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      logger.error(`Failed to create local workspace: ${message}`)
      return Result.fail(`Failed to create local workspace: ${message}`)
    }
  }

  /**
   * Persists a workspace key for anonymous local usage under a reserved user ID.
   */
  private async persistLocalWorkspaceKey(key: DecryptedWorkspaceKey): Promise<void> {
    const storedKey = WorkspaceKeyRepository.toStoredFormat(
      key.id,
      key.workspaceId,
      LOCAL_ANONYMOUS_WORKSPACE_USER_ID,
      key.generation,
      key.key
    )
    await this.keyRepository.saveKey(key.workspaceId, storedKey)
    logger.debug(`Bootstrapped local workspace key ${key.id} for workspace ${key.workspaceId}`)
  }
}
