import { StorageProvider } from "./storage-provider"

export const WORKSPACE_STORAGE_KEYS = {
  SyncState: "sync-state",
} as const

export type WorkspaceStorageKey = (typeof WORKSPACE_STORAGE_KEYS)[keyof typeof WORKSPACE_STORAGE_KEYS]

export class WorkspaceStorage {
  private readonly storageNamespace = `workspace_${this.workspaceId}`

  constructor(
    private readonly provider: StorageProvider,
    private readonly workspaceId: string
  ) {}

  public async get(key: WorkspaceStorageKey): Promise<string | undefined> {
    return await this.provider.get(this.storageNamespace, key)
  }

  public async set(key: WorkspaceStorageKey, value: string): Promise<void> {
    await this.provider.set(this.storageNamespace, key, value)
  }

  public async remove(key: WorkspaceStorageKey): Promise<void> {
    await this.provider.remove(this.storageNamespace, key)
  }

  public async clear(): Promise<void> {
    await this.provider.clear(this.storageNamespace)
  }

  public async getKeys(): Promise<WorkspaceStorageKey[]> {
    return (await this.provider.getKeys(this.storageNamespace)) as WorkspaceStorageKey[]
  }
}
