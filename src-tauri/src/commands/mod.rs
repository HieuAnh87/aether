pub mod agents;

use std::collections::HashMap;
use std::path::PathBuf;

use tauri::Manager;

use crate::config::{self, AgentConfig, PresetInfo};

#[tauri::command]
pub fn get_presets() -> Result<Vec<PresetInfo>, String> {
    config::get_presets().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_active_preset(name: String) -> Result<(), String> {
    config::set_active_preset(&name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_preset(name: String) -> Result<(), String> {
    config::create_preset(&name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_preset(name: String, agents: HashMap<String, AgentConfig>) -> Result<(), String> {
    config::update_preset(&name, agents).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_preset(name: String) -> Result<(), String> {
    config::delete_preset(&name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn duplicate_preset(name: String) -> Result<String, String> {
    config::duplicate_preset(&name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_available_models() -> Result<Vec<String>, String> {
    config::get_available_models().map_err(|e| e.to_string())
}

/// Returns a map of model_id → variant short names (e.g. ["low", "medium", "high"]).
/// Only models with variants defined in opencode.json are included.
#[tauri::command]
pub fn get_model_variants() -> Result<HashMap<String, Vec<String>>, String> {
    let config = config::read_opencode_config().map_err(|e| e.to_string())?;
    Ok(config.model_variants())
}

// ---------------------------------------------------------------------------
// File I/O for import/export
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(PathBuf::from(&path), content)
        .map_err(|e| format!("Failed to write file: {}", e))
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(PathBuf::from(&path))
        .map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub fn backup_slim_config() -> Result<(), String> {
    config::backup_slim_config().map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Proxy lifecycle commands
// ---------------------------------------------------------------------------

use std::sync::Mutex;
use crate::proxy::{ProxyState, ProxyStatusEvent};
use crate::proxy::events;

#[tauri::command]
pub async fn start_proxy(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<ProxyState>>,
    port: Option<u16>,
) -> Result<(), String> {
    let port = port.unwrap_or(8317);
    if port < 1024 {
        return Err(format!(
            "Port {} is a privileged port (< 1024). Use a port in the range 1024–65535.",
            port
        ));
    }
    crate::proxy::start_proxy(&app, &state, port)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_proxy(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<ProxyState>>,
) -> Result<(), String> {
    crate::proxy::stop_proxy(&app, &state)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restart_proxy(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<ProxyState>>,
    port: Option<u16>,
) -> Result<(), String> {
    let port = port.unwrap_or(8317);
    if port < 1024 {
        return Err(format!(
            "Port {} is a privileged port (< 1024). Use a port in the range 1024–65535.",
            port
        ));
    }
    crate::proxy::restart_proxy(&app, &state, port)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_proxy_status(
    state: tauri::State<'_, Mutex<ProxyState>>,
) -> Result<ProxyStatusEvent, String> {
    crate::proxy::get_proxy_status(&state).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Provider account commands
// ---------------------------------------------------------------------------

use crate::keychain;

/// The providers we support
const SUPPORTED_PROVIDERS: &[&str] = &["anthropic", "openai", "google"];

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderAccountInfo {
    pub provider: String,
    pub has_key: bool,
    pub masked_key: Option<String>,
    pub status: String, // "verified", "unverified", "none"
}

#[tauri::command]
pub fn get_provider_accounts(app: tauri::AppHandle) -> Result<Vec<ProviderAccountInfo>, String> {
    let mut accounts = Vec::new();
    for &provider in SUPPORTED_PROVIDERS {
        let has_key = keychain::has_api_key(&app, provider);
        let masked_key = if has_key {
            keychain::get_api_key(&app, provider)?
                .map(|k| keychain::mask_key(&k))
        } else {
            None
        };
        accounts.push(ProviderAccountInfo {
            provider: provider.to_string(),
            has_key,
            masked_key,
            status: if has_key { "unverified".to_string() } else { "none".to_string() },
        });
    }
    Ok(accounts)
}

#[tauri::command]
pub fn add_provider_account(
    app: tauri::AppHandle,
    provider: String,
    key: String,
) -> Result<(), String> {
    if !SUPPORTED_PROVIDERS.contains(&provider.as_str()) {
        return Err(format!("Unsupported provider: {}", provider));
    }
    keychain::store_api_key(&app, &provider, &key)
}

#[tauri::command]
pub fn update_api_key(
    app: tauri::AppHandle,
    provider: String,
    key: String,
) -> Result<(), String> {
    keychain::store_api_key(&app, &provider, &key)
}

#[tauri::command]
pub fn delete_provider_account(
    app: tauri::AppHandle,
    provider: String,
) -> Result<(), String> {
    keychain::delete_api_key(&app, &provider)
}

#[tauri::command]
pub async fn validate_api_key(
    _app: tauri::AppHandle,
    provider: String,
    key: String,
) -> Result<bool, String> {
    // Lightweight API call to verify the key works
    let client = reqwest::Client::new();
    let result = match provider.as_str() {
        "anthropic" => {
            client
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", &key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .body(r#"{"model":"claude-3-haiku-20240307","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}"#)
                .send()
                .await
        }
        "openai" => {
            client
                .get("https://api.openai.com/v1/models")
                .header("Authorization", format!("Bearer {}", key))
                .send()
                .await
        }
        "google" => {
            client
                .get(format!(
                    "https://generativelanguage.googleapis.com/v1/models?key={}",
                    key
                ))
                .send()
                .await
        }
        _ => return Err(format!("Unsupported provider: {}", provider)),
    };

    match result {
        Ok(resp) => {
            let status = resp.status().as_u16();
            // 200 = valid, 401/403 = invalid key
            Ok(status == 200 || status == 201)
        }
        Err(e) => Err(format!("Network error: {}", e)),
    }
}

// ---------------------------------------------------------------------------
// Version info
// ---------------------------------------------------------------------------

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionInfo {
    pub app_version: String,
    pub sidecar_version: String,
}

#[tauri::command]
pub fn get_version_info() -> VersionInfo {
    VersionInfo {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        sidecar_version: env!("BUNDLED_SIDECAR_VERSION").to_string(),
    }
}

// ---------------------------------------------------------------------------
// Settings commands
// ---------------------------------------------------------------------------

use crate::config::settings::{self, AppSettings};

#[tauri::command]
pub fn get_settings() -> Result<AppSettings, String> {
    settings::read_settings().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_settings(settings_data: AppSettings) -> Result<(), String> {
    settings::write_settings(&settings_data).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Window management commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Event stream commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn start_event_stream(
    app: tauri::AppHandle,
    port: Option<u16>,
) -> Result<(), String> {
    let port = port.unwrap_or(8317);
    // Start the WebSocket event stream. The abort sender is not stored for now;
    // the stream will naturally close when the sidecar stops or the app exits.
    let _abort = events::start_event_stream(app, port);
    Ok(())
}
