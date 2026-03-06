import { ACCOUNT_STORAGE_KEYS, AccountStorage } from "../storage/account-storage"
import { IdentityKeys, KeyBundle } from "../models/auth-types"
import { HttpClient } from "../services/http-client"
import { KeychainService } from "../utils/tauri-keychain"
import { Store } from "./store"

/**
 * A store in the context of a single account (not tied to running state)
 */
export class AccountStore extends Store {
  private readonly ACCOUNT_STATE = {
    IdentityKeys: Symbol("IdentityKeys"),
    KeyBundle: Symbol("KeyBundle"),
    AppToken: Symbol("AppToken"),
    RefreshToken: Symbol("RefreshToken"),
    TokenRefreshPromise: Symbol("TokenRefreshPromise"),
    SSEClientId: Symbol("SSEClientId"),
    HttpClient: Symbol("HttpClient"),
  }

  constructor(
    private readonly userId: string,
    private readonly defaultApiUrl: string,
    private readonly keychainService: KeychainService,
    private readonly accountStorage: AccountStorage
  ) {
    super()
  }

  public getUserId(): string {
    return this.userId
  }

  public async initialize(): Promise<void> {
    const identityKeys = await this.keychainService.getIdentityKeysForUser(this.userId)
    if (identityKeys) {
      this.set(this.ACCOUNT_STATE.IdentityKeys, identityKeys)
    }

    const keyBundle = await this.keychainService.getIdentityKeyBundleForUser(this.userId)
    if (keyBundle) {
      this.set(this.ACCOUNT_STATE.KeyBundle, keyBundle)
    }

    const appToken = await this.keychainService.getAuthTokenForUser(this.userId)
    if (appToken) {
      this.set(this.ACCOUNT_STATE.AppToken, appToken)
    }

    const refreshToken = await this.keychainService.getRefreshTokenForUser(this.userId)
    if (refreshToken) {
      this.set(this.ACCOUNT_STATE.RefreshToken, refreshToken)
    }

    const storedApiUrl = (await this.accountStorage.get(ACCOUNT_STORAGE_KEYS.ApiUrl)) ?? this.defaultApiUrl
    if (!storedApiUrl.trim()) {
      throw new Error("API URL cannot be empty")
    }
    this.set(this.ACCOUNT_STATE.HttpClient, new HttpClient(storedApiUrl))
  }

  public getHttpClient(): HttpClient {
    const httpClient = this.get<HttpClient>(this.ACCOUNT_STATE.HttpClient)
    if (!httpClient) {
      throw new Error("HttpClient not found")
    }
    return httpClient
  }

  /**
   * Persists the API base URL and ensures the HttpClient points at it.
   * Required to guarantee per-account routing for self-hosted servers.
   */
  public async setApiUrl(apiUrl: string): Promise<void> {
    if (!apiUrl.trim()) {
      throw new Error("API URL cannot be empty")
    }

    // Ensure the client is updated immediately, even if storage writes are async.
    this.set(this.ACCOUNT_STATE.HttpClient, new HttpClient(apiUrl))
    await this.accountStorage.set(ACCOUNT_STORAGE_KEYS.ApiUrl, apiUrl)
  }

  async clear(): Promise<void> {
    this.set(this.ACCOUNT_STATE.IdentityKeys, undefined)
    await this.keychainService.clearIdentityKeysForUser(this.userId)

    this.set(this.ACCOUNT_STATE.KeyBundle, undefined)
    await this.keychainService.clearIdentityKeyBundleForUser(this.userId)

    this.set(this.ACCOUNT_STATE.AppToken, undefined)
    await this.keychainService.clearAuthTokenForUser(this.userId)

    this.set(this.ACCOUNT_STATE.RefreshToken, undefined)
    await this.keychainService.clearRefreshTokenForUser(this.userId)
  }

  getIdentityKeys(): IdentityKeys | undefined {
    return this.get<IdentityKeys>(this.ACCOUNT_STATE.IdentityKeys)
  }

  getSureIdentityKeys(): IdentityKeys {
    const identityKeys = this.getIdentityKeys()
    if (!identityKeys) {
      throw new Error("Identity keys not found")
    }
    return identityKeys
  }

  async setIdentityKeys(identityKeys: IdentityKeys): Promise<void> {
    this.set(this.ACCOUNT_STATE.IdentityKeys, identityKeys)
    await this.keychainService.saveIdentityKeysForUser(this.userId, identityKeys)
  }

  /**
   * Used for ephemeral/local account stores in tests or local-only workspaces.
   */
  setIdentityKeysSync(identityKeys: IdentityKeys): void {
    this.set(this.ACCOUNT_STATE.IdentityKeys, identityKeys)
    void this.keychainService.saveIdentityKeysForUser(this.userId, identityKeys)
  }

  getKeyBundle(): KeyBundle | undefined {
    return this.get<KeyBundle>(this.ACCOUNT_STATE.KeyBundle)
  }

  async setKeyBundle(keyBundle: KeyBundle): Promise<void> {
    this.set(this.ACCOUNT_STATE.KeyBundle, keyBundle)
    await this.keychainService.saveIdentityKeyBundleForUser(this.userId, keyBundle)
  }

  getAppToken(): string | undefined {
    return this.get<string>(this.ACCOUNT_STATE.AppToken)
  }

  async setAppToken(appToken: string | undefined): Promise<void> {
    this.set(this.ACCOUNT_STATE.AppToken, appToken)
    if (appToken) {
      await this.keychainService.saveAuthTokenForUser(this.userId, appToken)
    }
  }

  getRefreshToken(): string | undefined {
    return this.get<string>(this.ACCOUNT_STATE.RefreshToken)
  }

  async setRefreshToken(refreshToken: string | undefined): Promise<void> {
    this.set(this.ACCOUNT_STATE.RefreshToken, refreshToken)
    if (refreshToken) {
      await this.keychainService.saveRefreshTokenForUser(this.userId, refreshToken)
    }
  }

  /**
   * Clears only auth tokens (app token and refresh token) from memory and keychain.
   * Preserves identity keys and key bundle.
   */
  async clearTokens(): Promise<void> {
    this.set(this.ACCOUNT_STATE.AppToken, undefined)
    await this.keychainService.clearAuthTokenForUser(this.userId)

    this.set(this.ACCOUNT_STATE.RefreshToken, undefined)
    await this.keychainService.clearRefreshTokenForUser(this.userId)
  }

  getTokenRefreshPromise(): Promise<boolean> | undefined {
    return this.get<Promise<boolean>>(this.ACCOUNT_STATE.TokenRefreshPromise)
  }

  setTokenRefreshPromise(promise: Promise<boolean> | undefined): void {
    this.set(this.ACCOUNT_STATE.TokenRefreshPromise, promise)
  }

  getSSEClientId(): string | undefined {
    return this.get<string>(this.ACCOUNT_STATE.SSEClientId)
  }

  setSSEClientId(clientId: string): void {
    this.set(this.ACCOUNT_STATE.SSEClientId, clientId)
  }

  clearSSEClientId(): void {
    this.set(this.ACCOUNT_STATE.SSEClientId, undefined)
  }
}
