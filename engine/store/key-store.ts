import { DecryptedWorkspaceKey } from "../models/workspace-key"
import { WorkspaceKeyRepository } from "../repositories"
import { SimpleCache } from "./simple-cache"
import { WorkspaceInfoStore } from "./workspace-info-store"

export class KeyStore {
  public readonly keyStore: SimpleCache<string, DecryptedWorkspaceKey> = new SimpleCache()

  constructor(
    private readonly keyRepository: WorkspaceKeyRepository,
    private readonly workspaceInfoStore: WorkspaceInfoStore
  ) {}

  async initialize(): Promise<void> {
    const keys = await this.keyRepository.getKeysByUser(
      this.workspaceInfoStore.workspaceId,
      this.workspaceInfoStore.userId
    )
    for (const key of keys) {
      this.keyStore.set(key.workspace_key_id, {
        id: key.workspace_key_id,
        workspaceId: key.workspace_id,
        generation: key.generation,
        key: key.key,
      })
    }
  }

  async saveKey(key: DecryptedWorkspaceKey): Promise<void> {
    this.keyStore.set(key.id, key)

    const storedKey = WorkspaceKeyRepository.toStoredFormat(
      key.id,
      key.workspaceId,
      this.workspaceInfoStore.userId,
      key.generation,
      key.key
    )

    await this.keyRepository.saveKey(key.workspaceId, storedKey)
  }

  getCurrentKey(): DecryptedWorkspaceKey | undefined {
    if (this.keyStore.size === 0) {
      return undefined
    }

    let currentKey: DecryptedWorkspaceKey | undefined = undefined
    for (const key of this.keyStore.values()) {
      if (!currentKey || key.generation > currentKey.generation) {
        currentKey = key
      }
    }

    return currentKey ?? undefined
  }

  getKey(workspaceKeyId: string): DecryptedWorkspaceKey | undefined {
    return this.keyStore.get(workspaceKeyId)
  }

  getAllKeys(): DecryptedWorkspaceKey[] {
    return Array.from(this.keyStore.values())
  }
}
