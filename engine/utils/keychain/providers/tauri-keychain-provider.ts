import { KeychainLookupKey, KeychainProvider } from "../keychain-types"
import { isTauriRuntime } from "../../tauri-runtime"

// Type for the Tauri invoke function.
type TauriInvokeFn = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>

// Keychain provider for Tauri desktop/mobile using Rust commands.
export class TauriKeychainProvider implements KeychainProvider {
  public readonly kind = "tauri"
  public readonly requiresRestoreGuard = true
  private cachedTauriInvoke: TauriInvokeFn | null = null
  private cachedTauriInvokePromise: Promise<TauriInvokeFn | null> | null = null

  // Resolve and cache the Tauri invoke function for this runtime.
  private async resolveTauriInvokeFunctionForKeychain(): Promise<TauriInvokeFn | null> {
    if (!isTauriRuntime()) {
      return null
    }

    if (this.cachedTauriInvoke) {
      return this.cachedTauriInvoke
    }

    if (this.cachedTauriInvokePromise) {
      return this.cachedTauriInvokePromise
    }

    try {
      this.cachedTauriInvokePromise = import("@tauri-apps/api/core").then(module => {
        this.cachedTauriInvoke = module.invoke
        return this.cachedTauriInvoke
      })
      return await this.cachedTauriInvokePromise
    } catch (error) {
      console.warn("[keychain:tauri] Failed to load Tauri API:", error)
      this.cachedTauriInvokePromise = null
      return null
    }
  }

  // Reads a secret through the Rust command bridge.
  public async getSecret(key: KeychainLookupKey): Promise<string | null> {
    const invoke = await this.resolveTauriInvokeFunctionForKeychain()
    if (!invoke) {
      return null
    }

    try {
      const result = await invoke("get_secret", { key })
      return typeof result === "string" ? result : null
    } catch (error) {
      console.error("[keychain:tauri] Failed to retrieve secret:", error)
      return null
    }
  }

  // Stores a secret through the Rust command bridge.
  public async setSecret(key: KeychainLookupKey, value: string): Promise<boolean> {
    const invoke = await this.resolveTauriInvokeFunctionForKeychain()
    if (!invoke) {
      return false
    }

    try {
      await invoke("set_secret", { key, value })
      return true
    } catch (error) {
      console.error("[keychain:tauri] Failed to save secret:", error)
      return false
    }
  }

  // Removes a secret through the Rust command bridge.
  public async clearSecret(key: KeychainLookupKey): Promise<boolean> {
    const invoke = await this.resolveTauriInvokeFunctionForKeychain()
    if (!invoke) {
      return false
    }

    try {
      await invoke("clear_secret", { key })
      return true
    } catch (error) {
      console.error("[keychain:tauri] Failed to clear secret:", error)
      return false
    }
  }
}

export const tauriKeychainProvider = new TauriKeychainProvider()
