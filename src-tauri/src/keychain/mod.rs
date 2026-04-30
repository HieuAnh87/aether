const SERVICE: &str = "aether";

/// Get the keychain account name for a provider
fn account_name(provider: &str) -> String {
    format!("{}.api_key", provider)
}

/// Store an API key in macOS Keychain
pub fn store_api_key(app: &tauri::AppHandle, provider: &str, key: &str) -> Result<(), String> {
    use tauri_plugin_keyring::KeyringExt;
    app.keyring()
        .set_password(SERVICE, &account_name(provider), key)
        .map_err(|e| format!("Failed to store key: {}", e))
}

/// Retrieve an API key from macOS Keychain
pub fn get_api_key(app: &tauri::AppHandle, provider: &str) -> Result<Option<String>, String> {
    use tauri_plugin_keyring::KeyringExt;
    match app.keyring().get_password(SERVICE, &account_name(provider)) {
        Ok(key) => Ok(key),
        Err(e) => {
            let msg = e.to_string();
            // "No matching items found" or similar = key doesn't exist
            if msg.contains("not found")
                || msg.contains("No matching")
                || msg.contains("NoEntry")
                || msg.contains("No entry")
            {
                Ok(None)
            } else {
                Err(format!("Failed to get key: {}", msg))
            }
        }
    }
}

/// Delete an API key from macOS Keychain
pub fn delete_api_key(app: &tauri::AppHandle, provider: &str) -> Result<(), String> {
    use tauri_plugin_keyring::KeyringExt;
    app.keyring()
        .delete_password(SERVICE, &account_name(provider))
        .map_err(|e| format!("Failed to delete key: {}", e))
}

/// Check if an API key exists in Keychain (without reading it)
pub fn has_api_key(app: &tauri::AppHandle, provider: &str) -> bool {
    get_api_key(app, provider).ok().flatten().is_some()
}

/// Mask an API key showing only last 4 chars
pub fn mask_key(key: &str) -> String {
    if key.len() <= 4 {
        return "••••".to_string();
    }
    let last4 = &key[key.len() - 4..];
    format!("••••••••{}", last4)
}
