//! Agent Provider management commands.
//!
//! Manages third-party OpenAI-compatible / Anthropic-compatible providers
//! for CLI agents (e.g. Groq, Together AI, OpenRouter, Mistral, etc.).
//!
//! Config file: ~/.config/aether/agent-providers.json
//! API keys:    macOS Keychain, key = "aether-provider.{id}"

use std::collections::HashMap;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/// Persisted entry in agent-providers.json.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProviderEntry {
    pub name: String,
    pub base_url: String,
    /// "openai" | "anthropic"
    pub compatibility: String,
    /// Whether we should try GET /models to populate the model list.
    pub models_endpoint: bool,
    /// Cached model IDs fetched from the provider.
    #[serde(default)]
    pub models: Vec<String>,
    /// Optional extra request headers (e.g. { "HTTP-Referer": "..." }).
    #[serde(default)]
    pub headers: HashMap<String, String>,
}

/// File root schema.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AgentProvidersFile {
    #[serde(default)]
    pub providers: HashMap<String, AgentProviderEntry>,
}

/// Public view returned to the frontend (enriched with Keychain data).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProviderInfo {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub compatibility: String,
    pub models_endpoint: bool,
    pub models: Vec<String>,
    pub headers: HashMap<String, String>,
    pub has_key: bool,
    pub masked_key: Option<String>,
}

// ---------------------------------------------------------------------------
// Well-known provider presets
// ---------------------------------------------------------------------------

pub fn well_known_providers() -> Vec<serde_json::Value> {
    serde_json::from_str(r#"[
      { "id": "groq",       "name": "Groq",        "baseUrl": "https://api.groq.com/openai/v1",        "compatibility": "openai",    "modelsEndpoint": true  },
      { "id": "together",   "name": "Together AI",  "baseUrl": "https://api.together.ai/v1",            "compatibility": "openai",    "modelsEndpoint": true  },
      { "id": "openrouter", "name": "OpenRouter",   "baseUrl": "https://openrouter.ai/api/v1",          "compatibility": "openai",    "modelsEndpoint": true  },
      { "id": "fireworks",  "name": "Fireworks AI", "baseUrl": "https://api.fireworks.ai/inference/v1", "compatibility": "openai",    "modelsEndpoint": true  },
      { "id": "mistral",    "name": "Mistral",      "baseUrl": "https://api.mistral.ai/v1",             "compatibility": "openai",    "modelsEndpoint": true  },
      { "id": "deepseek",   "name": "DeepSeek",     "baseUrl": "https://api.deepseek.com",              "compatibility": "openai",    "modelsEndpoint": true  },
      { "id": "perplexity", "name": "Perplexity",   "baseUrl": "https://api.perplexity.ai",             "compatibility": "openai",    "modelsEndpoint": true  },
      { "id": "xai",        "name": "xAI / Grok",   "baseUrl": "https://api.x.ai/v1",                  "compatibility": "openai",    "modelsEndpoint": true  },
      { "id": "cerebras",   "name": "Cerebras",     "baseUrl": "https://api.cerebras.ai/v1",            "compatibility": "openai",    "modelsEndpoint": true  }
    ]"#).unwrap_or_default()
}

// ---------------------------------------------------------------------------
// Config file helpers
// ---------------------------------------------------------------------------

fn config_path() -> Result<std::path::PathBuf> {
    let config_dir = dirs::config_dir().context("Could not find config directory")?;
    Ok(config_dir.join("aether").join("agent-providers.json"))
}

fn read_providers_file() -> Result<AgentProvidersFile> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(AgentProvidersFile::default());
    }
    let content = std::fs::read_to_string(&path).context("Failed to read agent-providers.json")?;
    serde_json::from_str(&content).context("Failed to parse agent-providers.json")
}

fn write_providers_file(file: &AgentProvidersFile) -> Result<()> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).context("Failed to create config dir")?;
    }
    let content =
        serde_json::to_string_pretty(file).context("Failed to serialize agent-providers.json")?;
    std::fs::write(&path, content).context("Failed to write agent-providers.json")
}

// ---------------------------------------------------------------------------
// Keychain helpers
// ---------------------------------------------------------------------------

const KEY_PREFIX: &str = "provider.";

fn keychain_key(id: &str) -> String {
    format!("{}{}", KEY_PREFIX, id)
}

fn keychain_has_key(app: &tauri::AppHandle, id: &str) -> bool {
    crate::keychain::has_api_key(app, &keychain_key(id))
}

fn keychain_get_masked(app: &tauri::AppHandle, id: &str) -> Option<String> {
    crate::keychain::get_api_key(app, &keychain_key(id))
        .ok()
        .flatten()
        .map(|k| crate::keychain::mask_key(&k))
}

fn keychain_get_raw(app: &tauri::AppHandle, id: &str) -> Result<Option<String>, String> {
    crate::keychain::get_api_key(app, &keychain_key(id))
}

fn keychain_store(app: &tauri::AppHandle, id: &str, key: &str) -> Result<(), String> {
    crate::keychain::store_api_key(app, &keychain_key(id), key)
}

fn keychain_delete(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    crate::keychain::delete_api_key(app, &keychain_key(id))
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_agent_providers(app: tauri::AppHandle) -> Result<Vec<AgentProviderInfo>, String> {
    let file = read_providers_file().map_err(|e| e.to_string())?;
    let mut result: Vec<AgentProviderInfo> = file
        .providers
        .into_iter()
        .map(|(id, entry)| {
            let has_key = keychain_has_key(&app, &id);
            let masked_key = if has_key {
                keychain_get_masked(&app, &id)
            } else {
                None
            };
            AgentProviderInfo {
                id,
                name: entry.name,
                base_url: entry.base_url,
                compatibility: entry.compatibility,
                models_endpoint: entry.models_endpoint,
                models: entry.models,
                headers: entry.headers,
                has_key,
                masked_key,
            }
        })
        .collect();

    // Stable sort by name
    result.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(result)
}

#[tauri::command]
pub fn get_well_known_providers() -> Vec<serde_json::Value> {
    well_known_providers()
}

#[tauri::command]
pub fn add_agent_provider(
    app: tauri::AppHandle,
    id: String,
    name: String,
    base_url: String,
    compatibility: String,
    models_endpoint: bool,
    api_key: Option<String>,
    headers: Option<HashMap<String, String>>,
) -> Result<(), String> {
    if id.is_empty() || name.is_empty() || base_url.is_empty() {
        return Err("id, name, and base_url are required".to_string());
    }
    // Reject IDs with path-traversal characters (only ".." enables traversal, single "." is safe)
    if id.contains('/') || id.contains("..") || id.contains('\\') {
        return Err("Provider ID must not contain '/', '..', or '\\'".to_string());
    }

    let mut file = read_providers_file().map_err(|e| e.to_string())?;
    if file.providers.contains_key(&id) {
        return Err(format!("Provider '{}' already exists", id));
    }

    validate_base_url(&base_url)?;
    validate_compatibility(&compatibility)?;

    let entry = AgentProviderEntry {
        name,
        base_url,
        compatibility,
        models_endpoint,
        models: vec![],
        headers: headers.unwrap_or_default(),
    };
    file.providers.insert(id.clone(), entry);
    write_providers_file(&file).map_err(|e| e.to_string())?;

    if let Some(key) = api_key {
        if !key.is_empty() {
            keychain_store(&app, &id, &key)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn update_agent_provider(
    app: tauri::AppHandle,
    id: String,
    name: Option<String>,
    base_url: Option<String>,
    compatibility: Option<String>,
    models_endpoint: Option<bool>,
    api_key: Option<String>,
    headers: Option<HashMap<String, String>>,
) -> Result<(), String> {
    let mut file = read_providers_file().map_err(|e| e.to_string())?;
    let entry = file
        .providers
        .get_mut(&id)
        .ok_or_else(|| format!("Provider '{}' not found", id))?;

    if let Some(n) = name {
        entry.name = n;
    }
    if let Some(u) = base_url {
        validate_base_url(&u)?;
        entry.base_url = u;
    }
    if let Some(c) = compatibility {
        validate_compatibility(&c)?;
        entry.compatibility = c;
    }
    if let Some(me) = models_endpoint {
        entry.models_endpoint = me;
    }
    if let Some(h) = headers {
        entry.headers = h;
    }

    write_providers_file(&file).map_err(|e| e.to_string())?;

    if let Some(key) = api_key {
        if key.is_empty() {
            // Empty string → delete key
            let _ = keychain_delete(&app, &id);
        } else {
            keychain_store(&app, &id, &key)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn delete_agent_provider(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let mut file = read_providers_file().map_err(|e| e.to_string())?;
    if file.providers.remove(&id).is_none() {
        return Err(format!("Provider '{}' not found", id));
    }
    write_providers_file(&file).map_err(|e| e.to_string())?;
    // Best-effort keychain cleanup
    let _ = keychain_delete(&app, &id);
    Ok(())
}

/// Fetch models from the provider's /models endpoint, cache in config, return list.
#[tauri::command]
pub async fn fetch_provider_models(
    app: tauri::AppHandle,
    id: String,
) -> Result<Vec<String>, String> {
    let file = read_providers_file().map_err(|e| e.to_string())?;
    let entry = file
        .providers
        .get(&id)
        .ok_or_else(|| format!("Provider '{}' not found", id))?
        .clone();

    if !entry.models_endpoint {
        return Err("This provider does not support model listing".to_string());
    }

    let api_key = keychain_get_raw(&app, &id)?;

    // Build models URL: append /models to base_url
    let models_url = make_models_url(&entry.base_url);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let mut req = client.get(&models_url);

    // Add auth header based on compatibility
    if let Some(key) = &api_key {
        match entry.compatibility.as_str() {
            "anthropic" => {
                req = req
                    .header("x-api-key", key)
                    .header("anthropic-version", "2023-06-01");
            }
            _ => {
                req = req.header("Authorization", format!("Bearer {}", key));
            }
        }
    }

    // Add custom headers
    for (k, v) in &entry.headers {
        req = req.header(k.as_str(), v.as_str());
    }

    let resp = req.send().await.map_err(|e| format!("Network error: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Provider returned HTTP {}", resp.status().as_u16()));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    // Parse OpenAI-style { data: [{ id }] } OR Anthropic-style { data: [{ id }] }
    // Both use data[], just different field shapes. Extract .id from each entry.
    let models: Vec<String> = body
        .get("data")
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m.get("id").and_then(|id| id.as_str()).map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    // Cache models in config (re-read to avoid overwriting concurrent changes)
    let mut file2 = read_providers_file().map_err(|e| e.to_string())?;
    if let Some(e) = file2.providers.get_mut(&id) {
        e.models = models.clone();
        write_providers_file(&file2).map_err(|e| e.to_string())?;
    }
    // If the provider was removed concurrently, we still return the freshly fetched models.

    Ok(models)
}

/// Build the models-listing URL from a base URL, handling trailing slashes.
fn make_models_url(base_url: &str) -> String {
    if base_url.ends_with('/') {
        format!("{}models", base_url)
    } else {
        format!("{}/models", base_url)
    }
}

/// Validate `base_url` is a well-formed HTTP(S) URL.
fn validate_base_url(base_url: &str) -> Result<(), String> {
    if !base_url.starts_with("http://") && !base_url.starts_with("https://") {
        return Err("base_url must start with http:// or https://".to_string());
    }
    Ok(())
}

/// Validate `compatibility` is one of the known values.
fn validate_compatibility(compatibility: &str) -> Result<(), String> {
    match compatibility {
        "openai" | "anthropic" => Ok(()),
        other => Err(format!(
            "Unknown compatibility '{}'. Must be 'openai' or 'anthropic'.",
            other
        )),
    }
}

/// Validate a provider API key by making a lightweight models listing request.
#[tauri::command]
pub async fn validate_agent_provider_key(
    base_url: String,
    compatibility: String,
    api_key: String,
    headers: Option<HashMap<String, String>>,
) -> Result<bool, String> {
    if api_key.is_empty() {
        return Ok(false);
    }

    validate_compatibility(&compatibility)?;
    let models_url = make_models_url(&base_url);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let mut req = client.get(&models_url);

    match compatibility.as_str() {
        "anthropic" => {
            req = req
                .header("x-api-key", &api_key)
                .header("anthropic-version", "2023-06-01");
        }
        _ => {
            req = req.header("Authorization", format!("Bearer {}", api_key));
        }
    }

    if let Some(h) = headers {
        for (k, v) in &h {
            req = req.header(k.as_str(), v.as_str());
        }
    }

    match req.send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            Ok(status == 200)
        }
        Err(e) => Err(format!("Network error: {}", e)),
    }
}
