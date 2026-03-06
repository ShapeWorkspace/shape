import { GlobalStorage } from "../../../storage/global-storage"
import { KeychainLookupKey, KeychainProvider } from "../keychain-types"

// Keychain provider for web runtimes backed by DeviceStorage.
export class WebDeviceStorageKeychainProvider implements KeychainProvider {
  public readonly kind = "web"
  public readonly requiresRestoreGuard = false

  constructor(private readonly storage: GlobalStorage) {}

  // Read a secret from device storage.
  public async getSecret(key: KeychainLookupKey): Promise<string | null> {
    try {
      return (await this.storage.get(key)) ?? null
    } catch (error) {
      console.error("[keychain:web] Failed to read secret:", error)
      return null
    }
  }

  // Persist a secret in device storage.
  public async setSecret(key: KeychainLookupKey, value: string): Promise<boolean> {
    try {
      await this.storage.set(key, value)
      return true
    } catch (error) {
      console.error("[keychain:web] Failed to save secret:", error)
      return false
    }
  }

  // Remove a secret from device storage.
  public async clearSecret(key: KeychainLookupKey): Promise<boolean> {
    try {
      await this.storage.remove(key)
      return true
    } catch (error) {
      console.error("[keychain:web] Failed to clear secret:", error)
      return false
    }
  }
}
