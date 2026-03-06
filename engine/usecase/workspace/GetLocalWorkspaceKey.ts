import { DecryptedWorkspaceKey } from "../../models/workspace-key"
import { WorkspaceKeyRepository } from "../../repositories"

const LOCAL_ANONYMOUS_WORKSPACE_USER_ID = "local-anonymous-workspace-user"

/**
 * Loads the latest local-only workspace key for an anonymous workspace.
 * Used for offline/local workspaces that haven't been registered with the server.
 */
export class GetLocalWorkspaceKey {
  constructor(private readonly keyRepository: WorkspaceKeyRepository) {}

  async execute(workspaceId: string): Promise<DecryptedWorkspaceKey | null> {
    const storedKeys = await this.keyRepository.getKeysByUser(workspaceId, LOCAL_ANONYMOUS_WORKSPACE_USER_ID)
    if (storedKeys.length === 0) {
      return null
    }

    // Use the highest generation key as the current workspace key.
    const latestStoredKey = storedKeys.reduce((latest, candidate) => {
      if (!latest || candidate.generation > latest.generation) {
        return candidate
      }
      return latest
    }, storedKeys[0])

    return {
      id: latestStoredKey.workspace_key_id,
      workspaceId: latestStoredKey.workspace_id,
      generation: latestStoredKey.generation,
      key: latestStoredKey.key,
    }
  }
}
