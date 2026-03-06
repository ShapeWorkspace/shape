/**
 * Keychain Integration
 *
 * Unified secure storage layer that supports:
 * - Tauri desktop/mobile keychain (Rust commands)
 * - Android keystore plugin (single-value bundle)
 * - Web device storage (provider-backed)
 *
 * Callers use a single API regardless of runtime.
 */

import type { IdentityKeys, KeyBundle } from "../models/auth-types"
import { KeychainProviderRegistry } from "./keychain/keychain-provider"
import { KeychainLookupKey } from "./keychain/keychain-types"

const KEYCHAIN_KEY_AUTH_TOKEN: KeychainLookupKey = "auth_tokens"
const KEYCHAIN_KEY_REFRESH_TOKEN: KeychainLookupKey = "refresh_tokens"
const KEYCHAIN_KEY_IDENTITY_KEYS: KeychainLookupKey = "identity_keys"
const KEYCHAIN_KEY_IDENTITY_KEY_BUNDLES: KeychainLookupKey = "identity_key_bundles"

type IdentityKeyringByUserId = Record<string, IdentityKeys>
type IdentityKeyBundleKeyringByUserId = Record<string, KeyBundle>
type KeychainTokenMapByUserId = Record<string, string>

// Centralized keychain facade for storing authentication and identity secrets.
export class KeychainService {
  private providerRegistry: KeychainProviderRegistry

  constructor(providerRegistry: KeychainProviderRegistry) {
    this.providerRegistry = providerRegistry
  }

  // Resolve the active provider for the current runtime.
  private resolveKeychainProviderForOperation() {
    return this.providerRegistry.getActiveKeychainProvider()
  }

  // Set a raw secret in secure storage.
  private async setKeychainSecret(key: KeychainLookupKey, value: string): Promise<boolean> {
    const provider = this.resolveKeychainProviderForOperation()
    return provider.setSecret(key, value)
  }

  // Get a raw secret from secure storage.
  private async getKeychainSecret(key: KeychainLookupKey): Promise<string | null> {
    const provider = this.resolveKeychainProviderForOperation()
    return provider.getSecret(key)
  }

  // Clear a raw secret from secure storage.
  private async clearKeychainSecret(key: KeychainLookupKey): Promise<boolean> {
    const provider = this.resolveKeychainProviderForOperation()
    return provider.clearSecret(key)
  }

  private isRecordValue(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null
  }

  private isPkcKeyPair(value: unknown): value is { publicKey: string; privateKey: string } {
    if (!this.isRecordValue(value)) {
      return false
    }

    return typeof value.publicKey === "string" && typeof value.privateKey === "string"
  }

  private isIdentityKeys(value: unknown): value is IdentityKeys {
    if (!this.isRecordValue(value)) {
      return false
    }

    return (
      typeof value.userId === "string" &&
      this.isPkcKeyPair(value.boxKeyPair) &&
      this.isPkcKeyPair(value.signKeyPair)
    )
  }

  private isKeyBundle(value: unknown): value is KeyBundle {
    if (!this.isRecordValue(value)) {
      return false
    }

    return (
      typeof value.v === "number" &&
      typeof value.userId === "string" &&
      typeof value.bundleId === "string" &&
      typeof value.createdAt === "string" &&
      typeof value.boxSeed === "string" &&
      typeof value.signSeed === "string"
    )
  }

  private isStringRecord(value: unknown): value is Record<string, string> {
    if (!this.isRecordValue(value)) {
      return false
    }

    return Object.values(value).every(entry => typeof entry === "string")
  }

  private isIdentityKeyringByUserId(value: unknown): value is IdentityKeyringByUserId {
    if (!this.isRecordValue(value)) {
      return false
    }

    return Object.values(value).every(entry => this.isIdentityKeys(entry))
  }

  private isIdentityKeyBundleKeyringByUserId(
    value: unknown
  ): value is IdentityKeyBundleKeyringByUserId {
    if (!this.isRecordValue(value)) {
      return false
    }

    return Object.values(value).every(entry => this.isKeyBundle(entry))
  }

  private parseIdentityKeyringJson(rawValue: string | null): IdentityKeyringByUserId {
    if (!rawValue) {
      return {}
    }

    try {
      const parsed: unknown = JSON.parse(rawValue)
      return this.isIdentityKeyringByUserId(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  private serializeIdentityKeyring(identityKeyring: IdentityKeyringByUserId): string {
    return JSON.stringify(identityKeyring)
  }

  private parseIdentityKeyBundleKeyringJson(rawValue: string | null): IdentityKeyBundleKeyringByUserId {
    if (!rawValue) {
      return {}
    }

    try {
      const parsed: unknown = JSON.parse(rawValue)
      return this.isIdentityKeyBundleKeyringByUserId(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  private serializeIdentityKeyBundleKeyring(
    identityKeyBundleKeyring: IdentityKeyBundleKeyringByUserId
  ): string {
    return JSON.stringify(identityKeyBundleKeyring)
  }

  private parseTokenMapJson(rawValue: string | null): KeychainTokenMapByUserId {
    if (!rawValue) {
      return {}
    }

    try {
      const parsed: unknown = JSON.parse(rawValue)
      return this.isStringRecord(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  private serializeTokenMap(tokenMap: KeychainTokenMapByUserId): string {
    return JSON.stringify(tokenMap)
  }

  /**
   * Saves the authentication token for a specific user.
   */
  public async saveAuthTokenForUser(userId: string, token: string): Promise<boolean> {
    const trimmedUserId = userId.trim()
    if (!trimmedUserId) {
      console.error("[keychain] Missing user ID for auth token save")
      return false
    }

    const existingMap = await this.getAuthTokenMap()
    const nextMap = { ...existingMap, [trimmedUserId]: token }
    const saved = await this.setKeychainSecret(KEYCHAIN_KEY_AUTH_TOKEN, this.serializeTokenMap(nextMap))
    if (!saved) {
      console.error("[keychain] Failed to save auth token map")
    }
    return saved
  }

  /**
   * Retrieves the authentication token for a specific user.
   */
  public async getAuthTokenForUser(userId: string): Promise<string | null> {
    const trimmedUserId = userId.trim()
    if (!trimmedUserId) {
      return null
    }

    const tokenMap = await this.getAuthTokenMap()
    return tokenMap[trimmedUserId] ?? null
  }

  /**
   * Retrieves all authentication tokens keyed by user ID.
   */
  public async getAllAuthTokens(): Promise<KeychainTokenMapByUserId> {
    return this.getAuthTokenMap()
  }

  /**
   * Removes the authentication token for a specific user.
   */
  public async clearAuthTokenForUser(userId: string): Promise<boolean> {
    const trimmedUserId = userId.trim()
    if (!trimmedUserId) {
      return false
    }

    const tokenMap = await this.getAuthTokenMap()
    if (!(trimmedUserId in tokenMap)) {
      return true
    }

    const { [trimmedUserId]: _, ...remaining } = tokenMap
    const saved = await this.setKeychainSecret(KEYCHAIN_KEY_AUTH_TOKEN, this.serializeTokenMap(remaining))
    if (!saved) {
      console.error("[keychain] Failed to clear auth token entry")
    }
    return saved
  }

  /**
   * Clears all authentication tokens.
   */
  public async clearAllAuthTokens(): Promise<boolean> {
    const cleared = await this.clearKeychainSecret(KEYCHAIN_KEY_AUTH_TOKEN)
    if (!cleared) {
      console.error("[keychain] Failed to clear auth token map")
    }
    return cleared
  }

  /**
   * Saves the refresh token for a specific user.
   */
  public async saveRefreshTokenForUser(userId: string, token: string): Promise<boolean> {
    const trimmedUserId = userId.trim()
    if (!trimmedUserId) {
      console.error("[keychain] Missing user ID for refresh token save")
      return false
    }

    const existingMap = await this.getRefreshTokenMap()
    const nextMap = { ...existingMap, [trimmedUserId]: token }
    const saved = await this.setKeychainSecret(KEYCHAIN_KEY_REFRESH_TOKEN, this.serializeTokenMap(nextMap))
    if (!saved) {
      console.error("[keychain] Failed to save refresh token map")
    }
    return saved
  }

  /**
   * Retrieves the refresh token for a specific user.
   */
  public async getRefreshTokenForUser(userId: string): Promise<string | null> {
    const trimmedUserId = userId.trim()
    if (!trimmedUserId) {
      return null
    }

    const tokenMap = await this.getRefreshTokenMap()
    return tokenMap[trimmedUserId] ?? null
  }

  /**
   * Retrieves all refresh tokens keyed by user ID.
   */
  public async getAllRefreshTokens(): Promise<KeychainTokenMapByUserId> {
    return this.getRefreshTokenMap()
  }

  /**
   * Removes the refresh token for a specific user.
   */
  public async clearRefreshTokenForUser(userId: string): Promise<boolean> {
    const trimmedUserId = userId.trim()
    if (!trimmedUserId) {
      return false
    }

    const tokenMap = await this.getRefreshTokenMap()
    if (!(trimmedUserId in tokenMap)) {
      return true
    }

    const { [trimmedUserId]: _, ...remaining } = tokenMap
    const saved = await this.setKeychainSecret(KEYCHAIN_KEY_REFRESH_TOKEN, this.serializeTokenMap(remaining))
    if (!saved) {
      console.error("[keychain] Failed to clear refresh token entry")
    }
    return saved
  }

  /**
   * Clears all refresh tokens.
   */
  public async clearAllRefreshTokens(): Promise<boolean> {
    const cleared = await this.clearKeychainSecret(KEYCHAIN_KEY_REFRESH_TOKEN)
    if (!cleared) {
      console.error("[keychain] Failed to clear refresh token map")
    }
    return cleared
  }

  /**
   * Saves identity keys to secure storage for a specific user.
   */
  public async saveIdentityKeysForUser(userId: string, identityKeys: IdentityKeys): Promise<boolean> {
    const trimmedUserId = userId.trim()
    if (!trimmedUserId) {
      console.error("[keychain] Missing user ID for identity key save")
      return false
    }

    const existingKeyring = await this.getIdentityKeyring()
    const nextKeyring: IdentityKeyringByUserId = {
      ...existingKeyring,
      [trimmedUserId]: identityKeys,
    }
    const saved = await this.setKeychainSecret(
      KEYCHAIN_KEY_IDENTITY_KEYS,
      this.serializeIdentityKeyring(nextKeyring)
    )
    if (!saved) {
      console.error("[keychain] Failed to save identity keys")
    }
    return saved
  }

  /**
   * Saves the plaintext identity key bundle for a specific user.
   * This bundle contains the seeds needed to re-encrypt identity keys during password resets.
   */
  public async saveIdentityKeyBundleForUser(userId: string, keyBundle: KeyBundle): Promise<boolean> {
    const trimmedUserId = userId.trim()
    if (!trimmedUserId) {
      console.error("[keychain] Missing user ID for identity key bundle save")
      return false
    }

    const existingKeyring = await this.getIdentityKeyBundleKeyring()
    const nextKeyring: IdentityKeyBundleKeyringByUserId = {
      ...existingKeyring,
      [trimmedUserId]: keyBundle,
    }
    const saved = await this.setKeychainSecret(
      KEYCHAIN_KEY_IDENTITY_KEY_BUNDLES,
      this.serializeIdentityKeyBundleKeyring(nextKeyring)
    )
    if (!saved) {
      console.error("[keychain] Failed to save identity key bundle")
    }
    return saved
  }

  /**
   * Retrieves identity keys for a specific user.
   */
  public async getIdentityKeysForUser(userId: string): Promise<IdentityKeys | null> {
    const trimmedUserId = userId.trim()
    if (!trimmedUserId) {
      return null
    }

    const keyring = await this.getIdentityKeyring()
    return keyring[trimmedUserId] ?? null
  }

  /**
   * Retrieves the plaintext identity key bundle for a specific user.
   */
  public async getIdentityKeyBundleForUser(userId: string): Promise<KeyBundle | null> {
    const trimmedUserId = userId.trim()
    if (!trimmedUserId) {
      return null
    }

    const keyring = await this.getIdentityKeyBundleKeyring()
    return keyring[trimmedUserId] ?? null
  }

  /**
   * Retrieves all identity keys keyed by user ID.
   */
  public async getAllIdentityKeys(): Promise<IdentityKeyringByUserId> {
    return this.getIdentityKeyring()
  }

  /**
   * Retrieves all plaintext identity key bundles keyed by user ID.
   */
  public async getAllIdentityKeyBundles(): Promise<IdentityKeyBundleKeyringByUserId> {
    return this.getIdentityKeyBundleKeyring()
  }

  /**
   * Removes identity keys for a specific user.
   */
  public async clearIdentityKeysForUser(userId: string): Promise<boolean> {
    const trimmedUserId = userId.trim()
    if (!trimmedUserId) {
      return false
    }

    const keyring = await this.getIdentityKeyring()
    if (!(trimmedUserId in keyring)) {
      return true
    }

    const { [trimmedUserId]: _, ...remaining } = keyring
    const saved = await this.setKeychainSecret(
      KEYCHAIN_KEY_IDENTITY_KEYS,
      this.serializeIdentityKeyring(remaining)
    )
    if (!saved) {
      console.error("[keychain] Failed to clear identity keys entry")
    }
    return saved
  }

  /**
   * Removes the identity key bundle for a specific user.
   */
  public async clearIdentityKeyBundleForUser(userId: string): Promise<boolean> {
    const trimmedUserId = userId.trim()
    if (!trimmedUserId) {
      return false
    }

    const keyring = await this.getIdentityKeyBundleKeyring()
    if (!(trimmedUserId in keyring)) {
      return true
    }

    const { [trimmedUserId]: _, ...remaining } = keyring
    const saved = await this.setKeychainSecret(
      KEYCHAIN_KEY_IDENTITY_KEY_BUNDLES,
      this.serializeIdentityKeyBundleKeyring(remaining)
    )
    if (!saved) {
      console.error("[keychain] Failed to clear identity key bundle entry")
    }
    return saved
  }

  /**
   * Clears all identity keys.
   */
  public async clearAllIdentityKeys(): Promise<boolean> {
    const cleared = await this.clearKeychainSecret(KEYCHAIN_KEY_IDENTITY_KEYS)
    if (!cleared) {
      console.error("[keychain] Failed to clear identity keys")
    }
    return cleared
  }

  /**
   * Clears all identity key bundles from secure storage.
   */
  public async clearAllIdentityKeyBundles(): Promise<boolean> {
    const cleared = await this.clearKeychainSecret(KEYCHAIN_KEY_IDENTITY_KEY_BUNDLES)
    if (!cleared) {
      console.error("[keychain] Failed to clear identity key bundles")
    }
    return cleared
  }

  /**
   * Checks whether a keychain provider is available for the current runtime.
   */
  public isKeychainAvailable(): boolean {
    return this.providerRegistry.isKeychainProviderAvailable()
  }

  /**
   * Indicates whether keychain access should be guarded to avoid OS prompts.
   */
  public requiresKeychainAccessGuard(): boolean {
    return this.resolveKeychainProviderForOperation().requiresRestoreGuard
  }

  private async getIdentityKeyring(): Promise<IdentityKeyringByUserId> {
    const rawValue = await this.getKeychainSecret(KEYCHAIN_KEY_IDENTITY_KEYS)
    return this.parseIdentityKeyringJson(rawValue)
  }

  private async getIdentityKeyBundleKeyring(): Promise<IdentityKeyBundleKeyringByUserId> {
    const rawValue = await this.getKeychainSecret(KEYCHAIN_KEY_IDENTITY_KEY_BUNDLES)
    return this.parseIdentityKeyBundleKeyringJson(rawValue)
  }

  private async getAuthTokenMap(): Promise<KeychainTokenMapByUserId> {
    const rawValue = await this.getKeychainSecret(KEYCHAIN_KEY_AUTH_TOKEN)
    return this.parseTokenMapJson(rawValue)
  }

  private async getRefreshTokenMap(): Promise<KeychainTokenMapByUserId> {
    const rawValue = await this.getKeychainSecret(KEYCHAIN_KEY_REFRESH_TOKEN)
    return this.parseTokenMapJson(rawValue)
  }
}
