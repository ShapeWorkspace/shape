// Key names must stay in sync with the Rust allowlist (desktop/src-tauri/src/keychain.rs).
export const KEYCHAIN_KEYS = [
  "auth_tokens",
  "refresh_tokens",
  "identity_keys",
  "identity_key_bundles",
] as const

export type KeychainLookupKey = (typeof KEYCHAIN_KEYS)[number]

// Distinguishes the active keychain backend for diagnostics and guard rails.
export type KeychainProviderKind = "tauri" | "android" | "web"

// Provider abstraction so callers never care which storage backend is active.
export interface KeychainProvider {
  // Identifies the provider implementation for logging and guard decisions.
  readonly kind: KeychainProviderKind
  // Whether first access can trigger OS keychain prompts and must be guarded until user intent.
  readonly requiresRestoreGuard: boolean
  // Fetch a secret from secure storage, returning null when missing or unavailable.
  getSecret: (key: KeychainLookupKey) => Promise<string | null>
  // Persist a secret to secure storage, returning true on success.
  setSecret: (key: KeychainLookupKey, value: string) => Promise<boolean>
  // Remove a secret from secure storage, returning true on success.
  clearSecret: (key: KeychainLookupKey) => Promise<boolean>
}

export const isKeychainKey = (value: string): value is KeychainLookupKey => {
  return (KEYCHAIN_KEYS as readonly string[]).includes(value)
}
