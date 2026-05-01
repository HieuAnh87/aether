//! CLIProxy Management API client.
//!
//! Syncs Agent Providers (from ~/.config/aether/agent-providers.json + Keychain)
//! into CLIProxy via its REST management API.
//!
//! Strategy: **replace-all** — each PUT replaces the entire provider list on
//! CLIProxy, so CLIProxy is always a downstream mirror of the Agent Providers store.

use anyhow::{Context, Result};
use serde_json::{json, Value};

use crate::commands::agent_providers::{read_providers_file, AgentProviderEntry, KEY_PREFIX};
use crate::config::settings;

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/// Sync all Agent Providers into CLIProxy.
///
/// - "openai" compat providers → `/v0/management/openai-compatibility`
/// - "anthropic" compat providers → `/v0/management/claude-api-key`
///
/// Best-effort: logs warnings on failure, never returns an error to the caller.
/// Callers should only invoke this when the proxy is known to be healthy.
pub async fn sync_providers_to_cliproxy(app: &tauri::AppHandle) {
    if let Err(e) = try_sync_providers(app).await {
        log::warn!("sync_providers_to_cliproxy: {}", e);
    }
}

async fn try_sync_providers(app: &tauri::AppHandle) -> Result<()> {
    let s = settings::read_settings().context("Failed to read settings")?;
    let port = s.proxy_port;
    let management_key = s.management_key;

    let base = format!("http://localhost:{}/v0/management", port);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .context("Failed to build HTTP client")?;

    let file = read_providers_file().context("Failed to read agent-providers.json")?;

    let mut openai_entries: Vec<Value> = vec![];
    let mut claude_entries: Vec<Value> = vec![];

    for (id, entry) in &file.providers {
        let api_key = get_api_key(app, id);

        match entry.compatibility.as_str() {
            "openai" => openai_entries.push(build_openai_entry(id, entry, api_key)),
            "anthropic" => claude_entries.push(build_claude_entry(entry, api_key)),
            other => log::warn!(
                "sync_providers: unknown compatibility '{}' for provider '{}', skipping",
                other,
                id
            ),
        }
    }

    let openai_count = openai_entries.len();
    let claude_count = claude_entries.len();

    // PUT replaces the entire list; sending an empty array clears all entries.
    // CLIProxy expects a raw JSON array as the body (not a wrapped object).
    put_json(
        &client,
        &format!("{}/openai-compatibility", base),
        &management_key,
        &json!(openai_entries),
    )
    .await?;

    put_json(
        &client,
        &format!("{}/claude-api-key", base),
        &management_key,
        &json!(claude_entries),
    )
    .await?;

    log::info!(
        "sync_providers_to_cliproxy: synced {} openai + {} anthropic providers",
        openai_count,
        claude_count,
    );

    Ok(())
}

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async fn put_json(
    client: &reqwest::Client,
    url: &str,
    management_key: &str,
    body: &Value,
) -> Result<()> {
    let resp = client
        .put(url)
        .header("Authorization", format!("Bearer {}", management_key))
        .json(body)
        .send()
        .await
        .with_context(|| format!("PUT {} request failed", url))?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let text = resp.text().await.unwrap_or_default();
        anyhow::bail!("PUT {} returned HTTP {}: {}", url, status, text);
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Entry builders
// ---------------------------------------------------------------------------

fn build_openai_entry(id: &str, entry: &AgentProviderEntry, api_key: Option<String>) -> Value {
    let api_key_entries: Vec<Value> = api_key
        .into_iter()
        .map(|k| json!({ "api-key": k }))
        .collect();

    let mut obj = json!({
        "name": id,
        "base-url": entry.base_url,
        "api-key-entries": api_key_entries,
    });

    if !entry.headers.is_empty() {
        obj["headers"] = json!(&entry.headers);
    }

    if !entry.models.is_empty() {
        let models: Vec<Value> = entry.models.iter().map(|m| json!({ "name": m })).collect();
        obj["models"] = json!(models);
    }

    obj
}

fn build_claude_entry(entry: &AgentProviderEntry, api_key: Option<String>) -> Value {
    let mut obj = json!({ "base-url": entry.base_url });

    if let Some(key) = api_key {
        obj["api-key"] = json!(key);
    }

    if !entry.headers.is_empty() {
        obj["headers"] = json!(&entry.headers);
    }

    if !entry.models.is_empty() {
        let models: Vec<Value> = entry.models.iter().map(|m| json!({ "name": m })).collect();
        obj["models"] = json!(models);
    }

    obj
}

// ---------------------------------------------------------------------------
// Keychain helper
// ---------------------------------------------------------------------------

fn get_api_key(app: &tauri::AppHandle, provider_id: &str) -> Option<String> {
    let key = format!("{}{}", KEY_PREFIX, provider_id);
    match crate::secrets::get(app, &key) {
        Ok(val) => val,
        Err(e) => {
            log::warn!("secrets lookup failed for provider '{}': {}", provider_id, e);
            None
        }
    }
}
