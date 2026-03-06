import { WORKSPACE_STORAGE_KEYS, WorkspaceStorage } from "../storage/workspace-storage"

type SyncState = {
  lastSyncAt: number
  lastSequence: number
}

export class SyncStore {
  public isSyncing: boolean = false
  public abortController: AbortController | null = null
  public syncState: SyncState = {
    lastSyncAt: 0,
    lastSequence: 0,
  }

  constructor(private readonly workspaceStorage: WorkspaceStorage) {}

  async initialize(): Promise<void> {
    const stored = await this.workspaceStorage.get(WORKSPACE_STORAGE_KEYS.SyncState)
    if (stored) {
      this.syncState = JSON.parse(stored) as SyncState
    }
  }

  saveSyncState(state: SyncState): void {
    this.syncState = state
    void this.workspaceStorage.set(WORKSPACE_STORAGE_KEYS.SyncState, JSON.stringify(state))
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    this.isSyncing = false
  }
}
