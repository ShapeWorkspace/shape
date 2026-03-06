import { KeychainLookupKey } from "../utils/keychain/keychain-types"
import { StorageProvider } from "./storage-provider"

// Named keys for global storage (non-keychain)
export const GlobalStorageKeys = {
  Users: "users",
  CurrentWorkspace: "current_workspace",
  Workspaces: "workspaces",
  WorkspaceEntrySelections: "workspace_entry_selections",
  LayoutMode: "layout_mode",
} as const

// Combined type: global storage keys + keychain keys
export type GlobalStorageKey = (typeof GlobalStorageKeys)[keyof typeof GlobalStorageKeys] | KeychainLookupKey

export class GlobalStorage {
  private readonly storageNamespace = `global_${this.clientKey}`

  constructor(
    private readonly provider: StorageProvider,
    private readonly clientKey: string
  ) {}

  public async get(key: GlobalStorageKey): Promise<string | undefined> {
    return this.provider.get(this.storageNamespace, key)
  }

  public async set(key: GlobalStorageKey, value: string): Promise<void> {
    return this.provider.set(this.storageNamespace, key, value)
  }

  public async remove(key: GlobalStorageKey): Promise<void> {
    return this.provider.remove(this.storageNamespace, key)
  }
}
