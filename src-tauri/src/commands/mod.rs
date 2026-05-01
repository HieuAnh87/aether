pub mod agent_providers;
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
        // Single keychain read per provider instead of has_api_key + get_api_key (2 reads)
        let key = keychain::get_api_key(&app, provider)?;
        let has_key = key.is_some();
        let masked_key = key.map(|k| keychain::mask_key(&k));
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
            // Use /v1/models (lightweight list) instead of posting a message.
            // The deprecated claude-3-haiku-20240307 model was previously used here.
            client
                .get("https://api.anthropic.com/v1/models")
                .header("x-api-key", &key)
                .header("anthropic-version", "2023-06-01")
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
// Analytics / Usage stats
// ---------------------------------------------------------------------------

use std::sync::OnceLock;

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn get_http_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .expect("Failed to build HTTP client")
    })
}

/// Per-model stats within a provider entry from CLIProxy usage APIs field
#[derive(serde::Deserialize, serde::Serialize, Default, Clone)]
pub struct ModelStats {
    #[serde(default)]
    pub requests: u64,
    #[serde(default)]
    pub tokens: u64,
    #[serde(default)]
    pub success: u64,
    #[serde(default)]
    pub failure: u64,
}

/// Typed structs matching the CLIProxy /v0/management/usage response shape.
/// Response is wrapped: { "failed_requests": N, "usage": { ... } }
/// Hour/day maps use string keys: { "0": 5, "1": 12, ... } or { "2026-05-01": 42 }
/// apis field: { provider: { model: { requests, tokens, ... } } }
#[derive(serde::Deserialize, serde::Serialize, Default, Clone)]
pub struct UsageInner {
    #[serde(default)]
    pub total_requests: u64,
    #[serde(default)]
    pub success_count: u64,
    #[serde(default)]
    pub failure_count: u64,
    #[serde(default)]
    pub total_tokens: u64,
    /// Per-provider → per-model breakdown: { provider: { model: ModelStats } }
    #[serde(default)]
    pub apis: std::collections::HashMap<String, std::collections::HashMap<String, ModelStats>>,
    /// Map of hour string ("0"–"23") → request count
    #[serde(default)]
    pub requests_by_hour: std::collections::HashMap<String, u64>,
    /// Map of date string ("YYYY-MM-DD") → request count
    #[serde(default)]
    pub requests_by_day: std::collections::HashMap<String, u64>,
    /// Map of hour string ("0"–"23") → token count
    #[serde(default)]
    pub tokens_by_hour: std::collections::HashMap<String, u64>,
    /// Map of date string ("YYYY-MM-DD") → token count
    #[serde(default)]
    pub tokens_by_day: std::collections::HashMap<String, u64>,
}

#[derive(serde::Deserialize, serde::Serialize, Default, Clone)]
pub struct UsageResponse {
    #[serde(default)]
    pub failed_requests: u64,
    #[serde(default)]
    pub usage: UsageInner,
}

/// Fetch usage stats from the CLIProxy management API.
/// Deserializes server response into a typed struct (no double-serialization).
#[tauri::command]
pub async fn fetch_usage_stats(port: u16, management_key: String) -> Result<UsageResponse, String> {
    // Use 127.0.0.1 explicitly — on macOS, `localhost` may resolve to ::1 (IPv6)
    // while the proxy binds to 127.0.0.1 only, causing connection refusal.
    let url = format!("http://127.0.0.1:{}/v0/management/usage", port);
    let client = get_http_client();

    let resp = client
        .get(&url)
        .header("X-Management-Key", &management_key)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Management API returned status {}", resp.status()));
    }

    let raw = resp
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Failed to parse usage stats JSON: {}", e))?;

    Ok(normalize_usage_response(raw))
}

fn parse_u64(v: Option<&serde_json::Value>) -> u64 {
    v.and_then(|x| x.as_u64()).unwrap_or(0)
}

fn normalize_usage_response(raw: serde_json::Value) -> UsageResponse {
    let usage = raw.get("usage").and_then(|v| v.as_object());

    let mut out = UsageResponse {
        failed_requests: parse_u64(raw.get("failed_requests")),
        usage: UsageInner {
            total_requests: parse_u64(usage.and_then(|u| u.get("total_requests"))),
            success_count: parse_u64(usage.and_then(|u| u.get("success_count"))),
            failure_count: parse_u64(usage.and_then(|u| u.get("failure_count"))),
            total_tokens: parse_u64(usage.and_then(|u| u.get("total_tokens"))),
            ..UsageInner::default()
        },
    };

    // requests/tokens by hour/day maps
    if let Some(map) = usage
        .and_then(|u| u.get("requests_by_hour"))
        .and_then(|v| v.as_object())
    {
        for (k, v) in map {
            out.usage.requests_by_hour.insert(k.clone(), parse_u64(Some(v)));
        }
    }
    if let Some(map) = usage
        .and_then(|u| u.get("requests_by_day"))
        .and_then(|v| v.as_object())
    {
        for (k, v) in map {
            out.usage.requests_by_day.insert(k.clone(), parse_u64(Some(v)));
        }
    }
    if let Some(map) = usage
        .and_then(|u| u.get("tokens_by_hour"))
        .and_then(|v| v.as_object())
    {
        for (k, v) in map {
            out.usage.tokens_by_hour.insert(k.clone(), parse_u64(Some(v)));
        }
    }
    if let Some(map) = usage
        .and_then(|u| u.get("tokens_by_day"))
        .and_then(|v| v.as_object())
    {
        for (k, v) in map {
            out.usage.tokens_by_day.insert(k.clone(), parse_u64(Some(v)));
        }
    }

    // Support both shapes:
    // 1) apis: { provider: { model: { requests, tokens, ... } } }
    // 2) apis: { provider: { models: { model: { total_requests, total_tokens, details... } } } }
    if let Some(apis) = usage
        .and_then(|u| u.get("apis"))
        .and_then(|v| v.as_object())
    {
        for (provider_name, provider_val) in apis {
            let mut models_out: std::collections::HashMap<String, ModelStats> =
                std::collections::HashMap::new();

            // Shape 2
            if let Some(models) = provider_val
                .get("models")
                .and_then(|v| v.as_object())
            {
                for (model_name, model_val) in models {
                    let stats = ModelStats {
                        requests: parse_u64(model_val.get("total_requests")).max(parse_u64(model_val.get("requests"))),
                        tokens: parse_u64(model_val.get("total_tokens")).max(parse_u64(model_val.get("tokens"))),
                        success: parse_u64(model_val.get("success")).max(parse_u64(model_val.get("total_requests"))),
                        failure: parse_u64(model_val.get("failure")),
                    };
                    models_out.insert(model_name.clone(), stats);
                }
            } else if let Some(models) = provider_val.as_object() {
                // Shape 1
                for (model_name, model_val) in models {
                    let stats = ModelStats {
                        requests: parse_u64(model_val.get("requests")).max(parse_u64(model_val.get("total_requests"))),
                        tokens: parse_u64(model_val.get("tokens")).max(parse_u64(model_val.get("total_tokens"))),
                        success: parse_u64(model_val.get("success")).max(parse_u64(model_val.get("total_requests"))),
                        failure: parse_u64(model_val.get("failure")),
                    };
                    models_out.insert(model_name.clone(), stats);
                }
            }

            out.usage.apis.insert(provider_name.clone(), models_out);
        }
    }

    if out.usage.failure_count == 0 {
        out.usage.failure_count = out.failed_requests;
    }

    out
}

// ---------------------------------------------------------------------------
// Usage cache persistence (offline analytics)
// ---------------------------------------------------------------------------

const RETAIN_DAILY_POINTS: usize = 90;
const RETAIN_HOURLY_POINTS: usize = 168;

fn trim_map_keep_recent(map: &mut std::collections::HashMap<String, u64>, keep: usize) {
    if map.len() <= keep {
        return;
    }

    let mut keys: Vec<String> = map.keys().cloned().collect();
    keys.sort();
    let remove_count = keys.len().saturating_sub(keep);
    for key in keys.into_iter().take(remove_count) {
        map.remove(&key);
    }
}

fn merge_usage_response(existing: UsageResponse, incoming: UsageResponse) -> UsageResponse {
    let mut merged = incoming.clone();

    merged.failed_requests = merged.failed_requests.max(existing.failed_requests);
    merged.usage.total_requests = merged.usage.total_requests.max(existing.usage.total_requests);
    merged.usage.success_count = merged.usage.success_count.max(existing.usage.success_count);
    merged.usage.failure_count = merged.usage.failure_count.max(existing.usage.failure_count);
    merged.usage.total_tokens = merged.usage.total_tokens.max(existing.usage.total_tokens);

    for (provider, existing_models) in existing.usage.apis {
        let provider_entry = merged.usage.apis.entry(provider).or_default();
        for (model, existing_stats) in existing_models {
            let stats = provider_entry.entry(model).or_default();
            stats.requests = stats.requests.max(existing_stats.requests);
            stats.tokens = stats.tokens.max(existing_stats.tokens);
            stats.success = stats.success.max(existing_stats.success);
            stats.failure = stats.failure.max(existing_stats.failure);
        }
    }

    for (k, v) in existing.usage.requests_by_hour {
        let entry = merged.usage.requests_by_hour.entry(k).or_insert(0);
        *entry = (*entry).max(v);
    }
    for (k, v) in existing.usage.requests_by_day {
        let entry = merged.usage.requests_by_day.entry(k).or_insert(0);
        *entry = (*entry).max(v);
    }
    for (k, v) in existing.usage.tokens_by_hour {
        let entry = merged.usage.tokens_by_hour.entry(k).or_insert(0);
        *entry = (*entry).max(v);
    }
    for (k, v) in existing.usage.tokens_by_day {
        let entry = merged.usage.tokens_by_day.entry(k).or_insert(0);
        *entry = (*entry).max(v);
    }

    trim_map_keep_recent(&mut merged.usage.requests_by_day, RETAIN_DAILY_POINTS);
    trim_map_keep_recent(&mut merged.usage.tokens_by_day, RETAIN_DAILY_POINTS);
    trim_map_keep_recent(&mut merged.usage.requests_by_hour, RETAIN_HOURLY_POINTS);
    trim_map_keep_recent(&mut merged.usage.tokens_by_hour, RETAIN_HOURLY_POINTS);

    merged
}

/// Returns the path to the Aether usage cache file: ~/.config/aether/usage-cache.json
///
/// Uses `dirs::home_dir()` + `.config/aether/` (not `dirs::config_dir()` which returns
/// `~/Library/Application Support` on macOS) for consistency with the rest of the app
/// which uses `~/.config/aether/` as the canonical config location.
fn usage_cache_path() -> Result<std::path::PathBuf, String> {
    dirs::home_dir()
        .map(|h| h.join(".config").join("aether").join("usage-cache.json"))
        .ok_or_else(|| "Could not determine home directory".to_string())
}

/// Read the last-persisted UsageResponse from disk.
/// Returns `Ok(None)` if the file doesn't exist yet (first run).
/// Automatically removes a corrupt cache file instead of propagating a hard error.
#[tauri::command]
pub fn read_usage_cache() -> Result<Option<UsageResponse>, String> {
    let path = usage_cache_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read usage cache: {}", e))?;
    match serde_json::from_str::<UsageResponse>(&content) {
        Ok(data) => Ok(Some(data)),
        Err(e) => {
            // Corrupt cache (e.g. partial write, schema change) — remove and continue
            log::warn!("Corrupt usage cache at {:?}, removing: {}", path, e);
            let _ = std::fs::remove_file(&path);
            Ok(None)
        }
    }
}

/// Persist a UsageResponse to disk so analytics work offline.
#[tauri::command]
pub fn write_usage_cache(data: UsageResponse) -> Result<(), String> {
    let path = usage_cache_path()?;
    // Ensure the parent directory exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config dir: {}", e))?;
    }
    let merged = match read_usage_cache() {
        Ok(Some(existing)) => merge_usage_response(existing, data),
        _ => data,
    };

    let content = serde_json::to_string(&merged)
        .map_err(|e| format!("Failed to serialize usage cache: {}", e))?;

    // Atomic write: temp file + rename avoids partial writes/corruption.
    let tmp_path = path.with_extension("json.tmp");
    std::fs::write(&tmp_path, content)
        .map_err(|e| format!("Failed to write usage cache temp file: {}", e))?;
    std::fs::rename(&tmp_path, &path)
        .map_err(|e| format!("Failed to replace usage cache atomically: {}", e))
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
    // Start the WebSocket event stream. Abort sender is stored internally in
    // events::STREAM_ABORT — calling again cancels the previous stream.
    events::start_event_stream(app, port);
    Ok(())
}
