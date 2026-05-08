//! API key storage backed by OS keychain via `keyring`.

use keyring::Entry;

const KEYRING_SERVICE: &str = "aether";

/// Key name for a provider's API key in the secrets store.
fn secret_key(provider: &str) -> String {
    format!("{}.api_key", provider)
}

/// Store an API key.
pub fn store_api_key(app: &tauri::AppHandle, provider: &str, key: &str) -> Result<(), String> {
    let _ = app;
    Entry::new(KEYRING_SERVICE, &secret_key(provider))
        .map_err(|e| format!("Failed creating keyring entry: {}", e))?
        .set_password(key)
        .map_err(|e| format!("Failed storing API key in keychain: {}", e))
}

/// Retrieve an API key. Returns `None` if not set.
pub fn get_api_key(app: &tauri::AppHandle, provider: &str) -> Result<Option<String>, String> {
    let _ = app;
    let entry = Entry::new(KEYRING_SERVICE, &secret_key(provider))
        .map_err(|e| format!("Failed creating keyring entry: {}", e))?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed reading API key from keychain: {}", e)),
    }
}

/// Delete an API key.
pub fn delete_api_key(app: &tauri::AppHandle, provider: &str) -> Result<(), String> {
    let _ = app;
    let entry = Entry::new(KEYRING_SERVICE, &secret_key(provider))
        .map_err(|e| format!("Failed creating keyring entry: {}", e))?;
    match entry.delete_credential() {
        Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Failed deleting API key from keychain: {}", e)),
    }
}

/// Mask an API key showing only last 4 chars.
pub fn mask_key(key: &str) -> String {
    if key.len() <= 4 {
        return "••••".to_string();
    }
    let last4 = &key[key.len() - 4..];
    format!("••••••••{}", last4)
}
