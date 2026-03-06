import { StorageProvider } from "./storage-provider"

export const ACCOUNT_STORAGE_KEYS = {
  ApiUrl: "api_url",
} as const

export type AccountStorageKey = (typeof ACCOUNT_STORAGE_KEYS)[keyof typeof ACCOUNT_STORAGE_KEYS]

export class AccountStorage {
  private readonly storageNamespace = `account_${this.accountId}`

  constructor(
    private readonly provider: StorageProvider,
    private readonly accountId: string
  ) {}

  public async get(key: AccountStorageKey): Promise<string | undefined> {
    return await this.provider.get(this.storageNamespace, key)
  }

  public async set(key: AccountStorageKey, value: string): Promise<void> {
    await this.provider.set(this.storageNamespace, key, value)
  }

  public async remove(key: AccountStorageKey): Promise<void> {
    await this.provider.remove(this.storageNamespace, key)
  }

  public async clear(): Promise<void> {
    await this.provider.clear(this.storageNamespace)
  }

  public async getKeys(): Promise<AccountStorageKey[]> {
    return (await this.provider.getKeys(this.storageNamespace)) as AccountStorageKey[]
  }
}
