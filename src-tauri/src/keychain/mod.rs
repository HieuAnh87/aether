//! API key storage — thin wrapper over `crate::secrets` (AES-256-GCM encrypted file).
//!
//! Replaces the old macOS Keychain backend to eliminate password prompts.
//! All callers use the same interface; only the storage backend changed.

/// Key name for a provider's API key in the secrets store.
fn secret_key(provider: &str) -> String {
    format!("{}.api_key", provider)
}

/// Store an API key.
pub fn store_api_key(app: &tauri::AppHandle, provider: &str, key: &str) -> Result<(), String> {
    crate::secrets::store(app, &secret_key(provider), key)
}

/// Retrieve an API key. Returns `None` if not set.
pub fn get_api_key(app: &tauri::AppHandle, provider: &str) -> Result<Option<String>, String> {
    crate::secrets::get(app, &secret_key(provider))
}

/// Delete an API key.
pub fn delete_api_key(app: &tauri::AppHandle, provider: &str) -> Result<(), String> {
    crate::secrets::delete(app, &secret_key(provider))
}

/// Mask an API key showing only last 4 chars.
pub fn mask_key(key: &str) -> String {
    crate::secrets::mask_value(key)
}
