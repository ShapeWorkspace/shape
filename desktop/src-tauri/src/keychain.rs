// Keychain Module - Secure Token Storage
//
// Provides cross-platform secure storage for authentication tokens using:
// - macOS/iOS: Keychain (via keyring crate with apple-native feature)
// - Windows: Credential Manager (via keyring crate)
// - Linux: Secret Service / GNOME Keyring (via keyring crate)
// - Android: Android Keystore (via tauri-plugin-keystore)

use tauri::command;

// Service name used to identify our credentials in the system keychain.
// This should be unique to our application.
const SERVICE_NAME: &str = "work.shape.shape";
// Allowlisted keys that JS is allowed to read/write. This is a security boundary:
// we do not permit arbitrary key names from the JS layer.
const ALLOWED_KEYS: [&str; 4] = ["auth_tokens", "refresh_tokens", "identity_keys", "identity_key_bundles"];

fn ensure_allowed_key(key: &str) -> Result<(), String> {
    if ALLOWED_KEYS.iter().any(|allowed_key| *allowed_key == key) {
        return Ok(());
    }

    Err(format!("Key '{}' is not allowed for keychain access", key))
}

// -----------------------------------------------------------------------------
// Desktop and iOS implementation using the keyring crate
// -----------------------------------------------------------------------------
#[cfg(not(target_os = "android"))]
mod platform {
    use super::*;
    use keyring::Entry;

    /// Saves a secret value to the system keychain.
    /// Overwrites any existing value for this service/key combination.
    pub fn save_secret(key: &str, value: &str) -> Result<(), String> {
        let entry = Entry::new(SERVICE_NAME, key)
            .map_err(|e| format!("Failed to create keychain entry: {}", e))?;

        entry
            .set_password(value)
            .map_err(|e| format!("Failed to save secret to keychain: {}", e))
    }

    /// Retrieves a secret value from the system keychain.
    /// Returns None if no value exists (not an error condition).
    pub fn get_secret(key: &str) -> Result<Option<String>, String> {
        let entry = Entry::new(SERVICE_NAME, key)
            .map_err(|e| format!("Failed to create keychain entry: {}", e))?;

        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("Failed to retrieve secret from keychain: {}", e)),
        }
    }

    /// Removes a secret value from the system keychain.
    /// Silently succeeds if no value exists.
    pub fn clear_secret(key: &str) -> Result<(), String> {
        let entry = Entry::new(SERVICE_NAME, key)
            .map_err(|e| format!("Failed to create keychain entry: {}", e))?;

        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()), // Already cleared, not an error
            Err(e) => Err(format!("Failed to clear secret from keychain: {}", e)),
        }
    }
}

// -----------------------------------------------------------------------------
// Android implementation (delegated to tauri-plugin-keystore in JS)
// -----------------------------------------------------------------------------
#[cfg(target_os = "android")]
mod platform {
    use super::*;

    // Android keystore access is handled via tauri-plugin-keystore on the JS side.
    // These Rust commands should never be invoked on Android.
    fn android_not_supported_error() -> Result<(), String> {
        Err("Android keychain storage must use tauri-plugin-keystore (JS API)".to_string())
    }

    pub fn save_secret(_key: &str, _value: &str) -> Result<(), String> {
        android_not_supported_error()
    }

    pub fn get_secret(_key: &str) -> Result<Option<String>, String> {
        android_not_supported_error().map(|_| None)
    }

    pub fn clear_secret(_key: &str) -> Result<(), String> {
        android_not_supported_error()
    }
}

// -----------------------------------------------------------------------------
// Tauri Commands - exposed to JavaScript frontend
// -----------------------------------------------------------------------------

/// Saves a secret to secure storage.
/// Only allowlisted keys can be written by the JS layer.
#[command]
pub fn set_secret(key: String, value: String) -> Result<(), String> {
    ensure_allowed_key(&key)?;
    log::info!("[keychain] Saving secret to secure storage: {}", key);
    platform::save_secret(&key, &value)
}

/// Retrieves a secret from secure storage.
/// Only allowlisted keys can be read by the JS layer.
#[command]
pub fn get_secret(key: String) -> Result<Option<String>, String> {
    ensure_allowed_key(&key)?;
    log::info!("[keychain] Retrieving secret from secure storage: {}", key);
    platform::get_secret(&key)
}

/// Removes a secret from secure storage.
/// Only allowlisted keys can be cleared by the JS layer.
#[command]
pub fn clear_secret(key: String) -> Result<(), String> {
    ensure_allowed_key(&key)?;
    log::info!("[keychain] Clearing secret from secure storage: {}", key);
    platform::clear_secret(&key)
}
