import { Crypto } from "../crypto/crypto"
import { AccountStorage } from "../storage/account-storage"
import { StorageProvider } from "../storage/storage-provider"
import { IdentityKeys, KeyBundle } from "../models/auth-types"
import { HttpClient } from "../services/http-client"
import { LOCAL_ANONYMOUS_WORKSPACE_USER_ID } from "../models/workspace"
import { KeychainService } from "../utils/tauri-keychain"
import { AccountStore } from "./account-store"
import { Store } from "./store"
import { UsersStore } from "./users-store"

export class AccountStoreContainer extends Store {
  private readonly PROPERTIES = {
    Map: Symbol("Map"),
  }

  constructor(
    private readonly usersStore: UsersStore,
    private readonly keychainService: KeychainService,
    private readonly crypto: Crypto,
    private readonly storageFunctions: StorageProvider,
    private readonly defaultApiUrl: string
  ) {
    super()
  }

  async initialize(): Promise<void> {
    await this.hydrateAccountStores()
  }

  public getHttpClientForAccount(userId: string): HttpClient {
    const accountStore = this.getAccountStore(userId)
    if (!accountStore) {
      throw new Error("Account store not found")
    }
    return accountStore.getHttpClient()
  }

  public async createNewAccountStore(params: {
    userId: string
    defaultApiUrl: string
    identityKeys: IdentityKeys
    keyBundle: KeyBundle
    appToken: string | undefined
    refreshToken: string | undefined
  }): Promise<AccountStore> {
    const accountStorage = new AccountStorage(this.storageFunctions, params.userId)

    const accountStore = new AccountStore(
      params.userId,
      params.defaultApiUrl,
      this.keychainService,
      accountStorage
    )

    // Persist the API base URL immediately so future sessions bind to the same server.
    await accountStore.setApiUrl(params.defaultApiUrl)

    await Promise.all([
      accountStore.setIdentityKeys(params.identityKeys),
      accountStore.setKeyBundle(params.keyBundle),
      accountStore.setAppToken(params.appToken),
      accountStore.setRefreshToken(params.refreshToken),
    ])

    const map = this.getMap()
    map[params.userId] = accountStore
    this.set(this.PROPERTIES.Map, map)

    return accountStore
  }

  private getMap(): Record<string, AccountStore> {
    return this.get<Record<string, AccountStore>>(this.PROPERTIES.Map) ?? {}
  }

  async hydrateAccountStores(): Promise<void> {
    const map = this.getMap()
    const users = this.usersStore.getUsers()

    for (const user of users) {
      const accountStorage = new AccountStorage(this.storageFunctions, user.uuid)
      const accountStore = new AccountStore(
        user.uuid,
        this.defaultApiUrl,
        this.keychainService,
        accountStorage
      )
      await accountStore.initialize()
      map[user.uuid] = accountStore
    }

    this.set(this.PROPERTIES.Map, map)
  }

  getAccountStore(userId: string): AccountStore | undefined {
    return this.get<Record<string, AccountStore>>(this.PROPERTIES.Map)?.[userId]
  }

  getSureAccountStore(userId: string): AccountStore {
    const accountStore = this.getAccountStore(userId)
    if (!accountStore) {
      throw new Error("Account store not found")
    }
    return accountStore
  }

  getAllAccountStores(): AccountStore[] {
    return Object.values(this.getMap())
  }

  /**
   * Gets or creates a local account store for anonymous/local workspace usage.
   * Used for local-only workspaces that don't require server authentication.
   * The identity keys are ephemeral (not persisted to keychain) and generated on demand.
   */
  getOrCreateLocalAccountStore(): AccountStore {
    const existing = this.getAccountStore(LOCAL_ANONYMOUS_WORKSPACE_USER_ID)
    if (existing) {
      return existing
    }

    // Generate ephemeral identity keys for local encryption.
    // These are only used for local workspace encryption and are not persisted.
    const identityKeys: IdentityKeys = {
      userId: LOCAL_ANONYMOUS_WORKSPACE_USER_ID,
      boxKeyPair: this.crypto.sodiumCryptoBoxKeypair(),
      signKeyPair: this.crypto.sodiumCryptoSignKeypair(),
    }

    const accountStorage = new AccountStorage(this.storageFunctions, LOCAL_ANONYMOUS_WORKSPACE_USER_ID)
    const accountStore = new AccountStore(
      LOCAL_ANONYMOUS_WORKSPACE_USER_ID,
      this.defaultApiUrl,
      this.keychainService,
      accountStorage
    )
    // Local accounts still need a base URL for public endpoints like invites.
    void accountStore.setApiUrl(this.defaultApiUrl)
    // Set identity keys synchronously (in-memory only for local accounts)
    accountStore.setIdentityKeysSync(identityKeys)

    const map = this.getMap()
    map[LOCAL_ANONYMOUS_WORKSPACE_USER_ID] = accountStore
    this.set(this.PROPERTIES.Map, map)

    return accountStore
  }

  async clearAccountStore(userId: string): Promise<void> {
    const store = this.getAccountStore(userId)
    if (store) {
      await store.clear()
    }

    const map = this.getMap()
    delete map[userId]

    this.set(this.PROPERTIES.Map, map)
  }

  async clearAllAccountStores(): Promise<void> {
    const map = this.getMap()
    for (const userId in map) {
      await this.clearAccountStore(userId)
    }
  }
}
