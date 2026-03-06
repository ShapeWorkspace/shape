import { KeychainProvider } from "./keychain-types"
import { androidKeystoreProvider, isAndroidTauriRuntime } from "./providers/android-keystore-provider"
import { tauriKeychainProvider } from "./providers/tauri-keychain-provider"
import { isTauriRuntime } from "../tauri-runtime"
import { WebDeviceStorageKeychainProvider } from "./providers/web-device-storage-provider"
import { GlobalStorage } from "../../storage/global-storage"

// Central registry for selecting and configuring the active keychain provider.
export class KeychainProviderRegistry {
  private configuredKeychainProvider: KeychainProvider | null = null

  // Resolve the appropriate provider for the current runtime.
  public getActiveKeychainProvider(): KeychainProvider {
    if (this.configuredKeychainProvider) {
      return this.configuredKeychainProvider
    }

    if (isTauriRuntime()) {
      return isAndroidTauriRuntime() ? androidKeystoreProvider : tauriKeychainProvider
    }

    // Force explicit configuration for web runtimes.
    throw new Error(
      "Keychain provider unavailable. Configure a web provider before accessing keychain secrets."
    )
  }

  public setActiveKeychainProvider(provider: KeychainProvider): void {
    this.configuredKeychainProvider = provider
  }

  // Configure the web provider at the edge of the client bootstrap flow.
  public configureWebKeychainProvider(globalStorage: GlobalStorage): void {
    if (isTauriRuntime()) {
      return
    }

    this.configuredKeychainProvider = new WebDeviceStorageKeychainProvider(globalStorage)
  }

  // Convenience helper for detecting whether any provider is active.
  public isKeychainProviderAvailable(): boolean {
    if (this.configuredKeychainProvider) {
      return true
    }

    return isTauriRuntime()
  }
}

// Singleton registry for the client runtime.
export const keychainProviderRegistry = new KeychainProviderRegistry()
