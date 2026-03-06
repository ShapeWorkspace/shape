import { KEYCHAIN_KEYS, KeychainLookupKey, KeychainProvider } from "../keychain-types"
import { isTauriRuntime, resolveMobilePlatformFromUserAgent } from "../../tauri-runtime"

// Android keystore plugin stores a single blob, so we pack per-key values into a bundle.
type AndroidKeychainBundle = Partial<Record<KeychainLookupKey, string | null>>

type TauriKeystoreModule = {
  store: (secret: string) => Promise<void>
  retrieve: (service: string, user: string) => Promise<string | null>
  remove: (service: string, user: string) => Promise<void>
}

const ANDROID_KEYCHAIN_SERVICE_NAME = "work.shape.shape"
// Android keystore stores a single blob; we bind it to a dedicated user identifier.
const ANDROID_KEYCHAIN_BUNDLE_USER_IDENTIFIER = "shape_keychain_bundle"

export const isAndroidTauriRuntime = (): boolean => {
  return isTauriRuntime() && resolveMobilePlatformFromUserAgent() === "android"
}

// Keychain provider for Android Tauri builds using the keystore plugin bundle.
export class AndroidKeystoreKeychainProvider implements KeychainProvider {
  public readonly kind = "android"
  public readonly requiresRestoreGuard = true
  private cachedKeystoreModule: TauriKeystoreModule | null = null
  private cachedKeystorePromise: Promise<TauriKeystoreModule | null> | null = null

  // Narrow unknown JSON values into indexable objects.
  private isRecordValue(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null
  }

  // Resolve and cache the keystore plugin for Android Tauri runtimes.
  private async resolveAndroidKeystorePluginModule(): Promise<TauriKeystoreModule | null> {
    if (!isAndroidTauriRuntime()) {
      return null
    }

    if (this.cachedKeystoreModule) {
      return this.cachedKeystoreModule
    }

    if (this.cachedKeystorePromise) {
      return this.cachedKeystorePromise
    }

    try {
      this.cachedKeystorePromise = import("@impierce/tauri-plugin-keystore").then(module => ({
        store: module.store,
        retrieve: module.retrieve,
        remove: module.remove,
      }))
      this.cachedKeystoreModule = await this.cachedKeystorePromise
      return this.cachedKeystoreModule
    } catch (error) {
      console.warn("[keychain:android] Failed to load keystore plugin:", error)
      this.cachedKeystorePromise = null
      return null
    }
  }

  // Parse the bundle JSON into a typed map of allowed keychain values.
  private parseAndroidKeystoreBundle(rawValue: string | null): AndroidKeychainBundle {
    if (!rawValue) {
      return {}
    }

    try {
      const parsed: unknown = JSON.parse(rawValue)
      if (!this.isRecordValue(parsed)) {
        return {}
      }

      const bundle: AndroidKeychainBundle = {}
      for (const key of KEYCHAIN_KEYS) {
        const value = parsed[key]
        if (typeof value === "string" || value === null) {
          bundle[key] = value
        }
      }
      return bundle
    } catch {
      // Ignore malformed bundles; treat as empty.
      return {}
    }
  }

  // Fetch the full bundle from the keystore.
  private async readAndroidKeystoreBundle(): Promise<AndroidKeychainBundle> {
    const keystore = await this.resolveAndroidKeystorePluginModule()
    if (!keystore) {
      return {}
    }

    try {
      const storedValue = await keystore.retrieve(
        ANDROID_KEYCHAIN_SERVICE_NAME,
        ANDROID_KEYCHAIN_BUNDLE_USER_IDENTIFIER
      )
      return this.parseAndroidKeystoreBundle(storedValue)
    } catch (error) {
      console.error("[keychain:android] Failed to retrieve bundle:", error)
      return {}
    }
  }

  // Persist the full bundle back to the keystore.
  private async storeAndroidKeystoreBundle(bundle: AndroidKeychainBundle): Promise<boolean> {
    const keystore = await this.resolveAndroidKeystorePluginModule()
    if (!keystore) {
      return false
    }

    try {
      await keystore.store(JSON.stringify(bundle))
      return true
    } catch (error) {
      console.error("[keychain:android] Failed to save bundle:", error)
      return false
    }
  }

  // Remove the bundle entirely from the keystore.
  private async clearAndroidKeystoreBundle(): Promise<boolean> {
    const keystore = await this.resolveAndroidKeystorePluginModule()
    if (!keystore) {
      return false
    }

    try {
      await keystore.remove(ANDROID_KEYCHAIN_SERVICE_NAME, ANDROID_KEYCHAIN_BUNDLE_USER_IDENTIFIER)
      return true
    } catch (error) {
      console.error("[keychain:android] Failed to clear bundle:", error)
      return false
    }
  }

  // Return a single value from the bundle if it is a string.
  private getValueFromAndroidKeystoreBundle(
    bundle: AndroidKeychainBundle,
    key: KeychainLookupKey
  ): string | null {
    const rawValue = bundle[key]
    return typeof rawValue === "string" ? rawValue : null
  }

  // Determine whether the bundle is empty enough to delete.
  private isAndroidKeystoreBundleEmpty(bundle: AndroidKeychainBundle): boolean {
    return Object.values(bundle).every(value => !value)
  }

  // Read a secret from the bundle.
  public async getSecret(key: KeychainLookupKey): Promise<string | null> {
    const bundle = await this.readAndroidKeystoreBundle()
    return this.getValueFromAndroidKeystoreBundle(bundle, key)
  }

  // Store a secret into the bundle.
  public async setSecret(key: KeychainLookupKey, value: string): Promise<boolean> {
    const bundle = await this.readAndroidKeystoreBundle()
    bundle[key] = value
    return this.storeAndroidKeystoreBundle(bundle)
  }

  // Clear a secret from the bundle and delete the bundle if it's empty.
  public async clearSecret(key: KeychainLookupKey): Promise<boolean> {
    const bundle = await this.readAndroidKeystoreBundle()
    bundle[key] = null

    if (this.isAndroidKeystoreBundleEmpty(bundle)) {
      return this.clearAndroidKeystoreBundle()
    }

    return this.storeAndroidKeystoreBundle(bundle)
  }
}

export const androidKeystoreProvider = new AndroidKeystoreKeychainProvider()
