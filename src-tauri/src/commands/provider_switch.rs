use std::collections::HashMap;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tauri::Emitter;

use crate::commands::V2CommandEnvelope;
use crate::core::domain::ports::{ProjectionWriteRequest, ProjectionWriter};
use crate::core::infrastructure::adapters::AtomicProjectionWriter;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SwitchProvider {
    pub id: String,
    pub name: String,
    pub app: String,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub settings_config: serde_json::Value,
    #[serde(default)]
    pub sort_index: Option<i64>,
    #[serde(default)]
    pub created_at: Option<i64>,
    #[serde(default)]
    pub meta: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ProviderSwitchStore {
    #[serde(default)]
    providers: HashMap<String, HashMap<String, SwitchProvider>>, // app -> id -> provider
    #[serde(default)]
    current: HashMap<String, String>, // app -> provider id
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSortUpdate {
    pub id: String,
    pub sort_index: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SwitchResult {
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSwitchEvent {
    pub app_type: String,
    pub provider_id: String,
    pub provider_name: String,
    pub proxy_enabled: bool,
    pub auto_failover_enabled: bool,
}

fn store_path() -> Result<std::path::PathBuf> {
    let config_dir = dirs::config_dir().context("Could not find config directory")?;
    Ok(config_dir.join("aether").join("provider-switch.json"))
}

fn read_store() -> Result<ProviderSwitchStore> {
    let path = store_path()?;
    if !path.exists() {
        return Ok(ProviderSwitchStore::default());
    }
    let content = std::fs::read_to_string(&path).context("Failed to read provider-switch.json")?;
    let mut store: ProviderSwitchStore =
        serde_json::from_str(&content).context("Failed to parse provider-switch.json")?;
    migrate_legacy_store(&mut store);
    Ok(store)
}

fn write_store(store: &ProviderSwitchStore) -> Result<()> {
    let path = store_path()?;
    let content = serde_json::to_string_pretty(store).context("serialize store")?;
    AtomicProjectionWriter
        .write_projection(ProjectionWriteRequest {
            target: path.to_string_lossy().to_string(),
            content,
        })
        .context("write provider switch store")
}

fn is_supported_app(app: &str) -> bool {
    matches!(app, "claude" | "codex" | "gemini" | "opencode")
}

fn is_additive_mode(app: &str) -> bool {
    app == "opencode"
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_default()
}

fn is_takeover_mode(app: &str, store: &ProviderSwitchStore) -> bool {
    store
        .providers
        .get(app)
        .map(|providers| {
            providers.values().any(|provider| {
                provider
                    .meta
                    .as_ref()
                    .and_then(|meta| meta.get("takeoverActive"))
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

fn is_official_provider(provider: &SwitchProvider) -> bool {
    provider
        .category
        .as_deref()
        .map(|c| c == "official")
        .unwrap_or(false)
}

fn migrate_legacy_store(store: &mut ProviderSwitchStore) {
    for (app, providers) in &mut store.providers {
        for provider in providers.values_mut() {
            if provider.app.is_empty() {
                provider.app = app.clone();
            }
            if provider.created_at.is_none() {
                provider.created_at = Some(
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_millis() as i64)
                        .unwrap_or_default(),
                );
            }

            let mut meta = provider.meta.clone().unwrap_or_else(|| serde_json::json!({}));
            if let Some(obj) = meta.as_object_mut() {
                if !obj.contains_key("liveConfigManaged") {
                    obj.insert(
                        "liveConfigManaged".to_string(),
                        serde_json::json!(is_additive_mode(app)),
                    );
                }
                if !obj.contains_key("takeoverActive") {
                    obj.insert("takeoverActive".to_string(), serde_json::json!(false));
                }
            }
            provider.meta = Some(meta);
        }
    }
}

fn default_provider_for_app(app: &str) -> Option<SwitchProvider> {
    let (id, name, category, base_url) = match app {
        "claude" => (
            "claude-official",
            "Claude Official",
            "official",
            "https://api.anthropic.com/v1",
        ),
        "codex" => (
            "codex-official",
            "OpenAI Official",
            "official",
            "https://api.openai.com/v1",
        ),
        "gemini" => (
            "gemini-official",
            "Gemini Official",
            "official",
            "https://generativelanguage.googleapis.com/v1beta/openai",
        ),
        "opencode" => (
            "openrouter-global",
            "OpenRouter",
            "aggregator",
            "https://openrouter.ai/api/v1",
        ),
        _ => return None,
    };

    Some(SwitchProvider {
        id: id.to_string(),
        name: name.to_string(),
        app: app.to_string(),
        category: Some(category.to_string()),
        settings_config: serde_json::json!({ "env": { "BASE_URL": base_url } }),
        sort_index: None,
        created_at: Some(now_millis()),
        meta: Some(serde_json::json!({
            "liveConfigManaged": is_additive_mode(app),
            "takeoverActive": false,
            "bootstrapSource": "default"
        })),
    })
}

fn make_live_provider(
    app: &str,
    id: &str,
    name: &str,
    base_url: &str,
    compatibility: &str,
    models_endpoint: bool,
    live_config_managed: bool,
    has_inline_api_key: bool,
) -> SwitchProvider {
    SwitchProvider {
        id: id.to_string(),
        name: name.to_string(),
        app: app.to_string(),
        category: Some("live".to_string()),
        settings_config: serde_json::json!({ "env": { "BASE_URL": base_url } }),
        sort_index: None,
        created_at: Some(now_millis()),
        meta: Some(serde_json::json!({
            "compatibility": compatibility,
            "modelsEndpoint": models_endpoint,
            "liveConfigManaged": live_config_managed,
            "hasInlineApiKey": has_inline_api_key,
            "takeoverActive": false,
            "bootstrapSource": "app_live"
        })),
    }
}

fn read_claude_live_provider(home: &std::path::Path) -> Result<Vec<SwitchProvider>> {
    let path = home.join(".claude/settings.json");
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = std::fs::read_to_string(&path).context("Failed reading Claude settings")?;
    let json: serde_json::Value = serde_json::from_str(&content).context("Failed parsing Claude settings")?;
    let Some(base_url) = json
        .get("env")
        .and_then(|env| env.get("ANTHROPIC_BASE_URL"))
        .and_then(|v| v.as_str())
        .filter(|v| !v.trim().is_empty())
    else {
        return Ok(vec![]);
    };

    Ok(vec![make_live_provider(
        "claude",
        "claude-live",
        "Claude live config",
        base_url,
        "anthropic",
        false,
        false,
        false,
    )])
}

fn parse_toml_string_value(line: &str, key: &str) -> Option<String> {
    let trimmed = line.trim();
    let rest = trimmed.strip_prefix(key)?.trim_start();
    let rest = rest.strip_prefix('=')?.trim();
    let value = rest.trim_matches('"').trim_matches('\'').trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

fn read_codex_live_providers(home: &std::path::Path) -> Result<Vec<SwitchProvider>> {
    let path = home.join(".codex/config.toml");
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = std::fs::read_to_string(&path).context("Failed reading Codex config")?;
    let mut providers = Vec::new();
    let mut current_provider: Option<String> = None;
    let mut current_base_url: Option<String> = None;

    let mut flush_provider = |provider_id: &mut Option<String>, base_url: &mut Option<String>| {
        if let (Some(id), Some(url)) = (provider_id.take(), base_url.take()) {
            providers.push(make_live_provider(
                "codex",
                &format!("codex-{}", id),
                &format!("Codex {}", id),
                &url,
                "openai",
                false,
                false,
                false,
            ));
        }
    };

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            flush_provider(&mut current_provider, &mut current_base_url);
            current_provider = trimmed
                .strip_prefix("[model_providers.")
                .and_then(|v| v.strip_suffix(']'))
                .map(|v| v.trim_matches('"').to_string());
            continue;
        }

        if current_provider.is_some() && trimmed.starts_with("base_url") {
            current_base_url = parse_toml_string_value(trimmed, "base_url");
        }
    }
    flush_provider(&mut current_provider, &mut current_base_url);
    Ok(providers)
}

fn read_app_live_providers(app: &str) -> Result<Vec<SwitchProvider>> {
    let home = dirs::home_dir().context("Could not find home directory")?;
    match app {
        "claude" => read_claude_live_provider(&home),
        "codex" => read_codex_live_providers(&home),
        // Gemini setup in Aether is shell-env based, so there is no stable app config
        // file to import providers from yet.
        "gemini" => Ok(vec![]),
        _ => Ok(vec![]),
    }
}

fn run_post_switch_sync(
    app_handle: Option<&tauri::AppHandle>,
    app: &str,
    provider: &mut SwitchProvider,
) {
    let mut meta = provider.meta.clone().unwrap_or_else(|| serde_json::json!({}));
    if let Some(obj) = meta.as_object_mut() {
        obj.insert("mcpSyncedAtApp".to_string(), serde_json::json!(app));
        obj.insert(
            "mcpSyncedAt".to_string(),
            serde_json::json!(
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or_default()
            ),
        );
    }
    provider.meta = Some(meta);

    if app == "opencode" {
        if let Some(handle) = app_handle {
            let _ = crate::commands::agents::refresh_opencode_models(handle.clone(), None);
        }
    }
}

fn switch_hot(
    _app: &str,
    id: &str,
    providers: &mut HashMap<String, SwitchProvider>,
) -> Result<SwitchResult, String> {
    let provider = providers
        .get_mut(id)
        .ok_or_else(|| format!("Provider '{}' not found", id))?;

    if is_official_provider(provider) {
        return Err(
            "Cannot switch to official provider while takeover mode is active".to_string(),
        );
    }

    let mut meta = provider.meta.clone().unwrap_or_else(|| serde_json::json!({}));
    if let Some(obj) = meta.as_object_mut() {
        obj.insert("hotSwitched".to_string(), serde_json::json!(true));
        obj.insert("routeTarget".to_string(), serde_json::json!(id));
    }
    provider.meta = Some(meta);

    Ok(SwitchResult { warnings: vec![] })
}

fn switch_normal(
    app_handle: Option<&tauri::AppHandle>,
    app: &str,
    id: &str,
    store: &mut ProviderSwitchStore,
) -> Result<SwitchResult, String> {
    let mut warnings = vec![];
    let providers = store.providers.entry(app.to_string()).or_default();
    let provider = providers
        .get(id)
        .ok_or_else(|| format!("Provider '{}' not found", id))?
        .clone();

    if is_additive_mode(app) {
        let target = providers
            .get_mut(id)
            .ok_or_else(|| format!("Provider '{}' not found", id))?;
        let mut meta = target.meta.clone().unwrap_or_else(|| serde_json::json!({}));
        if let Some(obj) = meta.as_object_mut() {
            let current = obj
                .get("liveConfigManaged")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            obj.insert("liveConfigManaged".to_string(), serde_json::json!(!current));
        }
        target.meta = Some(meta);
    } else {
        if let Some(current_id) = store.current.get(app).cloned() {
            if current_id != id {
                // Backfill contract (best effort): stamp previous provider with last switch source.
                if let Some(current_provider) = providers.get_mut(&current_id) {
                    let mut meta = current_provider
                        .meta
                        .clone()
                        .unwrap_or_else(|| serde_json::json!({}));
                    if let Some(obj) = meta.as_object_mut() {
                        obj.insert("backfilledAt".to_string(), serde_json::json!(true));
                        obj.insert("backfillSource".to_string(), serde_json::json!(app));
                    }
                    current_provider.meta = Some(meta);
                } else {
                    warnings.push(format!("backfill_failed:{}", current_id));
                }
            }
        }
        store.current.insert(app.to_string(), id.to_string());
    }

    // Post-switch sync contract
    if let Some(target) = providers.get_mut(&provider.id) {
        run_post_switch_sync(app_handle, app, target);
    }

    Ok(SwitchResult { warnings })
}

#[tauri::command]
pub fn get_providers(app: String) -> Result<HashMap<String, SwitchProvider>, String> {
    if !is_supported_app(&app) {
        return Err(format!("Unsupported app '{}'", app));
    }
    let store = read_store().map_err(|e| e.to_string())?;
    Ok(store.providers.get(&app).cloned().unwrap_or_default())
}

#[tauri::command]
pub fn get_current_provider(app: String) -> Result<String, String> {
    if !is_supported_app(&app) {
        return Err(format!("Unsupported app '{}'", app));
    }
    if is_additive_mode(&app) {
        return Ok(String::new());
    }
    let store = read_store().map_err(|e| e.to_string())?;
    Ok(store.current.get(&app).cloned().unwrap_or_default())
}

#[tauri::command]
pub fn add_provider(
    app: String,
    provider: SwitchProvider,
    #[allow(non_snake_case)] addToLive: Option<bool>,
) -> Result<V2CommandEnvelope<bool>, String> {
    if !is_supported_app(&app) {
        return Err(format!("Unsupported app '{}'", app));
    }

    let mut store = read_store().map_err(|e| e.to_string())?;
    let providers = store.providers.entry(app.clone()).or_default();

    if providers.contains_key(&provider.id) {
        return Err(format!("Provider '{}' already exists", provider.id));
    }

    let mut entity = provider;
    entity.app = app.clone();
    if entity.created_at.is_none() {
        entity.created_at = Some(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as i64)
                .unwrap_or_default(),
        );
    }
    providers.insert(entity.id.clone(), entity.clone());

    if !is_additive_mode(&app) && store.current.get(&app).is_none() {
        store.current.insert(app.clone(), entity.id);
    }

    let _ = addToLive; // reserved for parity contract
    write_store(&store).map_err(|e| e.to_string())?;
    Ok(V2CommandEnvelope::ok(true))
}

#[tauri::command]
pub fn update_provider(
    app: String,
    provider: SwitchProvider,
    #[allow(non_snake_case)] originalId: Option<String>,
) -> Result<V2CommandEnvelope<bool>, String> {
    if !is_supported_app(&app) {
        return Err(format!("Unsupported app '{}'", app));
    }
    let mut store = read_store().map_err(|e| e.to_string())?;
    let providers = store.providers.entry(app.clone()).or_default();
    let original = originalId.unwrap_or_else(|| provider.id.clone());
    if !providers.contains_key(&original) {
        return Err(format!("Provider '{}' not found", original));
    }
    if original != provider.id {
        providers.remove(&original);
    }
    let mut entity = provider;
    entity.app = app;
    providers.insert(entity.id.clone(), entity);
    write_store(&store).map_err(|e| e.to_string())?;
    Ok(V2CommandEnvelope::ok(true))
}

#[tauri::command]
pub fn delete_provider(app: String, id: String) -> Result<V2CommandEnvelope<bool>, String> {
    if !is_supported_app(&app) {
        return Err(format!("Unsupported app '{}'", app));
    }
    let mut store = read_store().map_err(|e| e.to_string())?;
    let providers = store.providers.entry(app.clone()).or_default();
    if providers.remove(&id).is_none() {
        return Err(format!("Provider '{}' not found", id));
    }
    if store.current.get(&app).map(|x| x == &id).unwrap_or(false) {
        store.current.remove(&app);
    }
    write_store(&store).map_err(|e| e.to_string())?;
    Ok(V2CommandEnvelope::ok(true))
}

#[tauri::command]
pub fn remove_provider_from_live_config(app: String, id: String) -> Result<V2CommandEnvelope<bool>, String> {
    if !is_supported_app(&app) {
        return Err(format!("Unsupported app '{}'", app));
    }
    if !is_additive_mode(&app) {
        return Err("remove_from_live is only valid for additive apps".to_string());
    }
    let mut store = read_store().map_err(|e| e.to_string())?;
    let providers = store.providers.entry(app).or_default();
    if let Some(p) = providers.get_mut(&id) {
        p.meta = Some(serde_json::json!({"liveConfigManaged": false}));
    } else {
        return Err(format!("Provider '{}' not found", id));
    }
    write_store(&store).map_err(|e| e.to_string())?;
    Ok(V2CommandEnvelope::ok(true))
}

#[tauri::command]
pub fn switch_provider(app_handle: tauri::AppHandle, app: String, id: String) -> Result<SwitchResult, String> {
    if !is_supported_app(&app) {
        return Err(format!("Unsupported app '{}'", app));
    }
    let mut store = read_store().map_err(|e| e.to_string())?;
    let providers = store.providers.entry(app.clone()).or_default();
    let provider = providers
        .get(&id)
        .ok_or_else(|| format!("Provider '{}' not found", id))?
        .clone();

    let pre_switch = store.clone();
    let result = if is_takeover_mode(&app, &store) {
        let providers = store.providers.entry(app.clone()).or_default();
        switch_hot(&app, &id, providers)?
    } else {
        switch_normal(Some(&app_handle), &app, &id, &mut store)?
    };

    if let Err(err) = write_store(&store) {
        // rollback/compensation handling
        let _ = write_store(&pre_switch);
        return Err(format!("switch failed and rolled back: {}", err));
    }

    let switched_event = ProviderSwitchEvent {
        app_type: app.clone(),
        provider_id: id.clone(),
        provider_name: provider.name,
        proxy_enabled: is_takeover_mode(&app, &store),
        auto_failover_enabled: false,
    };

    let _ = app_handle.emit("provider-switched", &switched_event);
    let _ = app_handle.emit("proxy-flags-changed", &switched_event);
    let _ = app_handle.emit(
        "routing-target:changed",
        serde_json::json!({ "appType": app, "providerId": id }),
    );

    Ok(result)
}

#[tauri::command]
pub fn import_default_config(app: String) -> Result<V2CommandEnvelope<bool>, String> {
    if !is_supported_app(&app) {
        return Err(format!("Unsupported app '{}'", app));
    }
    let mut store = read_store().map_err(|e| e.to_string())?;
    let providers = store.providers.entry(app.clone()).or_default();
    if !providers.is_empty() {
        return Ok(V2CommandEnvelope::ok(false));
    }

    let Some(provider) = default_provider_for_app(&app) else {
        return Ok(V2CommandEnvelope::ok(false));
    };

    let id = provider.id.clone();
    providers.insert(id.clone(), provider);
    if !is_additive_mode(&app) {
        store.current.insert(app, id);
    }

    write_store(&store).map_err(|e| e.to_string())?;
    Ok(V2CommandEnvelope::ok(true))
}

#[tauri::command]
pub fn import_providers_from_live(app: String) -> Result<V2CommandEnvelope<i64>, String> {
    if !is_supported_app(&app) {
        return Err(format!("Unsupported app '{}'", app));
    }

    let live_providers = read_app_live_providers(&app).map_err(|e| e.to_string())?;
    if live_providers.is_empty() {
        return Ok(V2CommandEnvelope::ok(0));
    }

    let mut store = read_store().map_err(|e| e.to_string())?;
    let target = store.providers.entry(app.clone()).or_default();

    let mut imported = 0_i64;
    for provider in live_providers {
        let id = provider.id.clone();
        if let Some(existing) = target.get_mut(&id) {
            let mut changed = false;
            if existing.name != provider.name {
                existing.name = provider.name.clone();
                changed = true;
            }
            if existing.category != provider.category {
                existing.category = provider.category.clone();
                changed = true;
            }
            if existing.settings_config != provider.settings_config {
                existing.settings_config = provider.settings_config.clone();
                changed = true;
            }

            let mut merged_meta = existing.meta.clone().unwrap_or_else(|| serde_json::json!({}));
            let incoming_meta = provider.meta.clone().unwrap_or_else(|| serde_json::json!({}));
            if let (Some(existing_obj), Some(incoming_obj)) =
                (merged_meta.as_object_mut(), incoming_meta.as_object())
            {
                for (key, value) in incoming_obj {
                    if existing_obj.get(key) != Some(value) {
                        existing_obj.insert(key.clone(), value.clone());
                        changed = true;
                    }
                }
            }
            if changed {
                existing.meta = Some(merged_meta);
                imported += 1;
            }
            continue;
        }
        target.insert(id, provider);
        imported += 1;
    }

    if imported > 0 {
        if !is_additive_mode(&app) && !store.current.contains_key(&app) {
            if let Some(first_id) = target.keys().next().cloned() {
                store.current.insert(app, first_id);
            }
        }
        write_store(&store).map_err(|e| e.to_string())?;
    }

    Ok(V2CommandEnvelope::ok(imported))
}

#[tauri::command]
pub fn update_providers_sort_order(
    app: String,
    updates: Vec<ProviderSortUpdate>,
) -> Result<V2CommandEnvelope<bool>, String> {
    if !is_supported_app(&app) {
        return Err(format!("Unsupported app '{}'", app));
    }
    let mut store = read_store().map_err(|e| e.to_string())?;
    let providers = store.providers.entry(app).or_default();
    for update in updates {
        if let Some(p) = providers.get_mut(&update.id) {
            p.sort_index = Some(update.sort_index);
        }
    }
    write_store(&store).map_err(|e| e.to_string())?;
    Ok(V2CommandEnvelope::ok(true))
}

#[tauri::command]
pub fn update_tray_menu() -> Result<bool, String> {
    // keep parity contract: emit a lightweight refresh event that UI can subscribe to
    // actual native menu composition is out-of-scope in this phase.
    Ok(true)
}

#[tauri::command]
pub fn tray_select_provider(
    app_handle: tauri::AppHandle,
    app: String,
    provider_id: String,
) -> Result<SwitchResult, String> {
    let result = switch_provider(app_handle.clone(), app, provider_id)?;
    let _ = app_handle.emit("tray-menu-updated", serde_json::json!({ "ok": true }));
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_provider(id: &str, app: &str, category: Option<&str>) -> SwitchProvider {
        SwitchProvider {
            id: id.to_string(),
            name: id.to_string(),
            app: app.to_string(),
            category: category.map(|c| c.to_string()),
            settings_config: serde_json::json!({}),
            sort_index: None,
            created_at: Some(1),
            meta: Some(serde_json::json!({
                "takeoverActive": false,
                "liveConfigManaged": app == "opencode"
            })),
        }
    }

    #[test]
    fn exclusive_switch_sets_current_and_sync_markers() {
        let app = "claude";
        let mut store = ProviderSwitchStore::default();
        let providers = store.providers.entry(app.to_string()).or_default();
        providers.insert("p1".to_string(), make_provider("p1", app, Some("third_party")));
        providers.insert("p2".to_string(), make_provider("p2", app, Some("third_party")));
        store.current.insert(app.to_string(), "p1".to_string());

        let result = switch_normal(None, app, "p2", &mut store).expect("switch should succeed");
        assert!(result.warnings.is_empty());
        assert_eq!(store.current.get(app).map(|s| s.as_str()), Some("p2"));

        let p2 = store
            .providers
            .get(app)
            .and_then(|m| m.get("p2"))
            .expect("p2 exists");
        let meta = p2.meta.as_ref().and_then(|m| m.as_object()).expect("meta obj");
        assert_eq!(meta.get("mcpSyncedAtApp").and_then(|v| v.as_str()), Some(app));
    }

    #[test]
    fn additive_switch_marks_live_config_managed() {
        let app = "opencode";
        let mut store = ProviderSwitchStore::default();
        let providers = store.providers.entry(app.to_string()).or_default();
        let mut p1 = make_provider("p1", app, Some("third_party"));
        p1.meta = Some(serde_json::json!({
            "takeoverActive": false,
            "liveConfigManaged": false
        }));
        providers.insert("p1".to_string(), p1);

        let result = switch_normal(None, app, "p1", &mut store).expect("switch should succeed");
        assert!(result.warnings.is_empty());

        let p1 = store
            .providers
            .get(app)
            .and_then(|m| m.get("p1"))
            .expect("p1 exists");
        let meta = p1.meta.as_ref().and_then(|m| m.as_object()).expect("meta obj");
        assert_eq!(meta.get("liveConfigManaged").and_then(|v| v.as_bool()), Some(true));
    }

    #[test]
    fn takeover_blocks_official_provider() {
        let app = "claude";
        let mut providers = HashMap::new();
        providers.insert("official".to_string(), make_provider("official", app, Some("official")));
        let err = switch_hot(app, "official", &mut providers).expect_err("must block official");
        assert!(err.contains("official"));
    }

    #[test]
    fn backfill_warning_when_old_current_missing() {
        let app = "codex";
        let mut store = ProviderSwitchStore::default();
        let providers = store.providers.entry(app.to_string()).or_default();
        providers.insert("p2".to_string(), make_provider("p2", app, Some("third_party")));
        store.current.insert(app.to_string(), "missing".to_string());

        let result = switch_normal(None, app, "p2", &mut store).expect("switch should succeed");
        assert_eq!(result.warnings.len(), 1);
        assert!(result.warnings[0].starts_with("backfill_failed:"));
    }

    #[test]
    fn migration_populates_missing_legacy_fields() {
        let mut store = ProviderSwitchStore::default();
        store.providers.insert(
            "opencode".to_string(),
            HashMap::from([(
                "legacy".to_string(),
                SwitchProvider {
                    id: "legacy".to_string(),
                    name: "Legacy".to_string(),
                    app: "".to_string(),
                    category: None,
                    settings_config: serde_json::json!({}),
                    sort_index: None,
                    created_at: None,
                    meta: None,
                },
            )]),
        );

        migrate_legacy_store(&mut store);
        let p = store
            .providers
            .get("opencode")
            .and_then(|m| m.get("legacy"))
            .expect("legacy provider exists");
        assert_eq!(p.app, "opencode");
        assert!(p.created_at.is_some());
        let meta = p.meta.as_ref().and_then(|m| m.as_object()).expect("meta obj");
        assert_eq!(meta.get("liveConfigManaged").and_then(|v| v.as_bool()), Some(true));
        assert_eq!(meta.get("takeoverActive").and_then(|v| v.as_bool()), Some(false));
    }
}
