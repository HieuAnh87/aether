//! CLI Agent detection and configuration commands.
//!
//! Detects installed CLI agents (Claude Code, Codex, Amp, OpenCode)
//! and configures them to route through the Aether proxy.

use crate::config::settings;
use crate::commands::V2CommandEnvelope;
use crate::core::domain::ports::{ProjectionWriteRequest, ProjectionWriter};
use crate::core::infrastructure::adapters::AtomicProjectionWriter;
use tauri::Emitter;

/// Status of a single CLI agent / coding tool.
#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatus {
    pub id: String,
    pub name: String,
    pub description: String,
    pub installed: bool,
    pub configured: bool,
    pub config_type: String, // "env", "file", "config", "both"
    pub config_path: Option<String>,
    pub docs_url: String,
}

// ---------------------------------------------------------------------------
// Public commands
// ---------------------------------------------------------------------------

/// Detect which CLI agents are installed and whether they are configured
/// to use the Aether proxy.
#[tauri::command]
pub fn detect_cli_agents() -> Vec<AgentStatus> {
    let home = dirs::home_dir().unwrap_or_default();

    // Read port from settings (default 8317)
    let port = settings::read_settings()
        .map(|s| s.proxy_port)
        .unwrap_or(8317);
    let endpoint = format!("http://127.0.0.1:{}", port);

    let mut agents = Vec::new();

    // 1. Claude Code — reads env vars / ~/.claude/settings.json
    let claude_installed = which_exists("claude");
    let claude_settings = home.join(".claude/settings.json");
    let claude_configured = if claude_settings.exists() {
        std::fs::read_to_string(&claude_settings)
            .map(|c| c.contains(&endpoint) || c.contains("aether-managed"))
            .unwrap_or(false)
    } else {
        check_env_configured("ANTHROPIC_BASE_URL", &endpoint)
    };

    agents.push(AgentStatus {
        id: "claude-code".to_string(),
        name: "Claude Code".to_string(),
        description: "Anthropic's official CLI for Claude models".to_string(),
        installed: claude_installed,
        configured: claude_configured,
        config_type: "config".to_string(),
        config_path: Some(claude_settings.to_string_lossy().to_string()),
        docs_url: "https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview"
            .to_string(),
    });

    // 2. Codex CLI — ~/.codex/config.toml + ~/.codex/auth.json
    let codex_installed = which_exists("codex");
    let codex_config = home.join(".codex/config.toml");
    let codex_configured = if codex_config.exists() {
        std::fs::read_to_string(&codex_config)
            .map(|c| c.contains("aether") || c.contains(&endpoint))
            .unwrap_or(false)
    } else {
        false
    };

    agents.push(AgentStatus {
        id: "codex".to_string(),
        name: "Codex CLI".to_string(),
        description: "OpenAI's Codex CLI for GPT-5 models".to_string(),
        installed: codex_installed,
        configured: codex_configured,
        config_type: "file".to_string(),
        config_path: Some(codex_config.to_string_lossy().to_string()),
        docs_url: "https://github.com/openai/codex".to_string(),
    });

    // 3. Amp CLI — ~/.config/amp/settings.json
    let amp_installed = which_exists("amp");
    let amp_config = home.join(".config/amp/settings.json");
    let amp_configured = if amp_config.exists() {
        std::fs::read_to_string(&amp_config)
            .map(|c| {
                c.contains(&endpoint)
                    || c.contains(&format!("localhost:{}", port))
                    || c.contains("aether-managed")
            })
            .unwrap_or(false)
    } else {
        false
    };

    agents.push(AgentStatus {
        id: "amp-cli".to_string(),
        name: "Amp CLI".to_string(),
        description: "Sourcegraph's Amp coding assistant".to_string(),
        installed: amp_installed,
        configured: amp_configured,
        config_type: "file".to_string(),
        config_path: Some(amp_config.to_string_lossy().to_string()),
        docs_url: "https://ampcode.com/".to_string(),
    });

    // 4. OpenCode — ~/.config/opencode/opencode.json
    let opencode_installed = which_exists("opencode");
    let opencode_config = home.join(".config/opencode/opencode.json");
    let opencode_configured = if opencode_config.exists() {
        std::fs::read_to_string(&opencode_config)
            .map(|c| c.contains("aether") && c.contains(&endpoint))
            .unwrap_or(false)
    } else {
        false
    };

    agents.push(AgentStatus {
        id: "opencode".to_string(),
        name: "OpenCode".to_string(),
        description: "Terminal-based AI coding assistant".to_string(),
        installed: opencode_installed,
        configured: opencode_configured,
        config_type: "config".to_string(),
        config_path: Some(opencode_config.to_string_lossy().to_string()),
        docs_url: "https://opencode.ai/docs/providers/".to_string(),
    });

    agents
}

/// Configure a CLI agent to use the Aether proxy.
///
/// `port` overrides the port from settings.json (useful for testing).
/// `model` optionally sets the default model for the agent.
/// `effort` optionally sets the reasoning effort (low/medium/high) for agents that support it.
#[tauri::command]
pub async fn configure_cli_agent(
    agent_id: String,
    port: Option<u16>,
    model: Option<String>,
    effort: Option<String>,
    opus_model: Option<String>,
    sonnet_model: Option<String>,
    haiku_model: Option<String>,
    small_fast_model: Option<String>,
) -> Result<V2CommandEnvelope<serde_json::Value>, String> {
    let resolved_port = port.unwrap_or_else(|| {
        settings::read_settings()
            .map(|s| s.proxy_port)
            .unwrap_or(8317)
    });

    let endpoint = format!("http://127.0.0.1:{}", resolved_port);
    let home = dirs::home_dir().ok_or("Could not find home directory")?;

    let data = match agent_id.as_str() {
        "claude-code" => configure_claude_code(
            &home,
            &endpoint,
            model,
            opus_model.as_deref(),
            sonnet_model.as_deref(),
            haiku_model.as_deref(),
            small_fast_model.as_deref(),
        ),
        "codex" => configure_codex(&home, &endpoint, model, effort),
        "amp-cli" => configure_amp_cli(&home, resolved_port),
        "opencode" => configure_opencode(&home, resolved_port, &endpoint, model, None),
        _ => Err(format!("Unknown agent: {}", agent_id)),
    }?;

    Ok(V2CommandEnvelope::ok(data))
}

// ---------------------------------------------------------------------------
// Per-agent configuration helpers
// ---------------------------------------------------------------------------

fn configure_claude_code(
    home: &std::path::Path,
    endpoint: &str,
    model: Option<String>,
    opus_model: Option<&str>,
    sonnet_model: Option<&str>,
    haiku_model: Option<&str>,
    small_fast_model: Option<&str>,
) -> Result<serde_json::Value, String> {
    let config_dir = home.join(".claude");
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let config_path = config_dir.join("settings.json");

    let selected_model = model.unwrap_or_else(|| "claude-sonnet-4-6".to_string());

    let env_config = serde_json::json!({
        "ANTHROPIC_BASE_URL": endpoint,
        "ANTHROPIC_AUTH_TOKEN": "aether-managed",
        "ANTHROPIC_MODEL": selected_model,
        "ANTHROPIC_DEFAULT_OPUS_MODEL": opus_model.unwrap_or("claude-opus-4-6"),
        "ANTHROPIC_DEFAULT_SONNET_MODEL": sonnet_model.unwrap_or("claude-sonnet-4-6"),
        "ANTHROPIC_DEFAULT_HAIKU_MODEL": haiku_model.unwrap_or("claude-haiku-4-5-20251001"),
        "ANTHROPIC_SMALL_FAST_MODEL": small_fast_model.unwrap_or("claude-haiku-4-5-20251001"),
    });

    let mut final_config = merge_into_settings_json(&config_path, "env", env_config)?;

    // Also set the top-level `model` key for Claude Code >= 2.x which reads it directly
    if let Some(obj) = final_config.as_object_mut() {
        obj.insert("model".to_string(), serde_json::json!(selected_model));
    }

    let config_str = serde_json::to_string_pretty(&final_config).map_err(|e| e.to_string())?;
    AtomicProjectionWriter
        .write_projection(ProjectionWriteRequest {
            target: config_path.to_string_lossy().to_string(),
            content: config_str,
        })
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "success": true,
        "configType": "config",
        "configPath": config_path.to_string_lossy(),
        "instructions": format!(
            "Claude Code configured. Settings written to {}. Run 'claude' to start.",
            config_path.display()
        )
    }))
}

fn configure_codex(
    home: &std::path::Path,
    endpoint: &str,
    model: Option<String>,
    effort: Option<String>,
) -> Result<serde_json::Value, String> {
    let codex_dir = home.join(".codex");
    std::fs::create_dir_all(&codex_dir).map_err(|e| e.to_string())?;

    let config_path = codex_dir.join("config.toml");

    // Read + merge into existing TOML to avoid destroying user settings.
    // We use raw string manipulation rather than pulling in the `toml` crate,
    // since we only need to upsert a handful of known keys.
    let existing = if config_path.exists() {
        std::fs::read_to_string(&config_path).unwrap_or_default()
    } else {
        String::new()
    };

    let aether_url = format!("{}/v1", endpoint);
    let selected_model = model.unwrap_or_else(|| "gpt-5.4".to_string());
    let selected_effort = effort.unwrap_or_else(|| "high".to_string());
    let merged = merge_codex_toml(&existing, &aether_url, &selected_model, &selected_effort);

    AtomicProjectionWriter
        .write_projection(ProjectionWriteRequest {
            target: config_path.to_string_lossy().to_string(),
            content: merged,
        })
        .map_err(|e| e.to_string())?;

    // Merge auth.json — only set OPENAI_API_KEY if not already present.
    let auth_path = codex_dir.join("auth.json");
    let existing_auth = if auth_path.exists() {
        std::fs::read_to_string(&auth_path)
            .ok()
            .and_then(|c| serde_json::from_str::<serde_json::Value>(&c).ok())
            .unwrap_or_else(|| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    let mut auth_obj = existing_auth;
    // Only overwrite the API key if it isn't already "aether-managed"
    if auth_obj
        .get("OPENAI_API_KEY")
        .and_then(|v| v.as_str())
        .map(|k| k != "aether-managed")
        .unwrap_or(true)
    {
        auth_obj["OPENAI_API_KEY"] = serde_json::json!("aether-managed");
    }
    let auth_content =
        serde_json::to_string_pretty(&auth_obj).map_err(|e| e.to_string())?;
    AtomicProjectionWriter
        .write_projection(ProjectionWriteRequest {
            target: auth_path.to_string_lossy().to_string(),
            content: auth_content,
        })
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "success": true,
        "configType": "file",
        "configPath": config_path.to_string_lossy(),
        "authPath": auth_path.to_string_lossy(),
        "instructions": "Codex CLI configured. Run 'codex' to start using it."
    }))
}

/// Merge Aether-specific keys into an existing Codex config.toml string.
/// Upserts: model_provider, model, model_reasoning_effort, [model_providers.aether].
fn merge_codex_toml(existing: &str, aether_url: &str, model: &str, effort: &str) -> String {
    // Parse lines, updating known scalar keys, then append provider section if missing.
    let mut lines: Vec<String> = existing.lines().map(|l| l.to_string()).collect();
    let mut set_provider = false;
    let mut set_model = false;
    let mut set_effort = false;

    for line in &mut lines {
        let trimmed = line.trim_start();
        if trimmed.starts_with("model_provider") && !trimmed.starts_with("model_providers") {
            *line = "model_provider = \"aether\"".to_string();
            set_provider = true;
        } else if trimmed.starts_with("model ") || trimmed.starts_with("model=") {
            *line = format!("model = \"{}\"", model);
            set_model = true;
        } else if trimmed.starts_with("model_reasoning_effort") {
            *line = format!("model_reasoning_effort = \"{}\"", effort);
            set_effort = true;
        }
    }

    // Prepend any missing scalar keys at the top
    let mut header = String::new();
    if !set_effort {
        header.push_str(&format!("model_reasoning_effort = \"{}\"\n", effort));
    }
    if !set_model {
        header.push_str(&format!("model = \"{}\"\n", model));
    }
    if !set_provider {
        header.push_str("model_provider = \"aether\"\n");
    }

    let body = if header.is_empty() {
        lines.join("\n")
    } else {
        format!("{}{}", header, lines.join("\n"))
    };

    // Upsert [model_providers.aether] section
    let section_header = "[model_providers.aether]";
    if body.contains(section_header) {
        // Update the base_url line within the existing section
        let updated = body
            .lines()
            .map(|l| {
                if l.trim_start().starts_with("base_url") {
                    format!("base_url = \"{}\"", aether_url)
                } else {
                    l.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join("\n");
        updated
    } else {
        format!(
            "{}\n\n{}\n\
             name = \"aether\"\n\
             base_url = \"{}\"\n\
             wire_api = \"responses\"\n",
            body, section_header, aether_url
        )
    }
}

fn configure_amp_cli(
    home: &std::path::Path,
    port: u16,
) -> Result<serde_json::Value, String> {
    let amp_dir = home.join(".config/amp");
    std::fs::create_dir_all(&amp_dir).map_err(|e| e.to_string())?;

    // Amp requires localhost (not 127.0.0.1)
    let amp_endpoint = format!("http://localhost:{}", port);

    let new_settings = serde_json::json!({
        "amp.url": amp_endpoint,
        "amp.apiKey": "aether-managed"
    });

    let config_path = amp_dir.join("settings.json");
    let final_config = if config_path.exists() {
        if let Ok(existing) = std::fs::read_to_string(&config_path) {
            if let Ok(mut existing_json) = serde_json::from_str::<serde_json::Value>(&existing) {
                if let (Some(existing_obj), Some(new_obj)) =
                    (existing_json.as_object_mut(), new_settings.as_object())
                {
                    for (k, v) in new_obj {
                        existing_obj.insert(k.clone(), v.clone());
                    }
                }
                existing_json
            } else {
                new_settings
            }
        } else {
            new_settings
        }
    } else {
        new_settings
    };

    let settings_str = serde_json::to_string_pretty(&final_config).map_err(|e| e.to_string())?;
    AtomicProjectionWriter
        .write_projection(ProjectionWriteRequest {
            target: config_path.to_string_lossy().to_string(),
            content: settings_str,
        })
        .map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "success": true,
        "configType": "file",
        "configPath": config_path.to_string_lossy(),
        "instructions": "Amp CLI configured. Run 'amp' to start using it."
    }))
}

/// Read all provider/model pairs from proxy-config.yaml.
/// Returns deduplicated namespaced model keys in the form `provider:model`.
fn read_proxy_models(home: &std::path::Path) -> Vec<(String, String)> {
    let proxy_config_path = home.join(".config/aether/proxy-config.yaml");
    let content = match std::fs::read_to_string(&proxy_config_path) {
        Ok(c) => c,
        Err(_) => return vec![],
    };

    // Simple line-by-line parser for proxy-config.yaml structure:
    //
    //   openai-compatibility:       <- top-level (indent 0)
    //     - name: giau              <- provider entry (indent 2-4, "  - name:")
    //       models:                 <- models key inside a provider (indent 4-6)
    //         - name: claude-...    <- actual model (indent 6+, "        - name:")
    //
    // We track whether we're inside a `models:` sub-block by comparing indent levels.
    // Provider-level `- name:` lines have indent < models-level `- name:` lines.
    let mut models: Vec<(String, String)> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut in_openai_section = false;
    let mut in_models_block = false;
    let mut models_indent: usize = 0;
    let mut current_provider: Option<String> = None;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Count leading spaces to determine indent level
        let indent = line.len() - line.trim_start().len();

        // Top-level key toggles section
        if indent == 0 {
            in_openai_section = trimmed == "openai-compatibility:";
            in_models_block = false;
            current_provider = None;
            continue;
        }

        if !in_openai_section {
            continue;
        }

        if let Some(rest) = trimmed.strip_prefix("- name:") {
            let value = rest.trim();
            if !in_models_block {
                if !value.is_empty() {
                    current_provider = Some(value.to_string());
                }
                continue;
            }
        }

        // Detect `models:` key inside a provider entry (any indent > 0)
        if trimmed == "models:" {
            in_models_block = true;
            models_indent = indent;
            continue;
        }

        // If indent goes back to models_indent or shallower, we've left the models block.
        // This catches both other provider keys (base-url:) AND new provider entries (- name: giau).
        // Model entries are always strictly deeper than models_indent (models_indent=4, models=indent 6).
        if in_models_block && indent <= models_indent {
            in_models_block = false;
        }

        // Only capture `- name:` lines that are inside a models: block
        if in_models_block {
            if let Some(rest) = trimmed.strip_prefix("- name:") {
                let model_name = rest.trim().to_string();
                if !model_name.is_empty() {
                    let provider = current_provider
                        .clone()
                        .unwrap_or_else(|| "unknown".to_string());
                    let namespaced = format!("{}:{}", provider, model_name);
                    if seen.insert(namespaced.clone()) {
                        models.push((namespaced, model_name));
                    }
                }
            }
        }
    }

    models
}

fn opencode_config_path(home: &std::path::Path) -> std::path::PathBuf {
    home.join(".config/opencode/opencode.json")
}

fn emit_opencode_warning(app: Option<&tauri::AppHandle>, message: impl Into<String>) {
    let payload = serde_json::json!({ "message": message.into() });
    if let Some(app_handle) = app {
        let _ = app_handle.emit("opencode-config-warning", payload);
    }
}

fn read_opencode_json_for_merge(
    app: Option<&tauri::AppHandle>,
    config_path: &std::path::Path,
) -> Result<Option<serde_json::Value>, String> {
    if !config_path.exists() {
        return Ok(None);
    }

    let raw = std::fs::read_to_string(config_path).map_err(|e| e.to_string())?;
    match serde_json::from_str::<serde_json::Value>(&raw) {
        Ok(v) => Ok(Some(v)),
        Err(e) => {
            let msg = format!(
                "Failed to parse OpenCode config at {}: {}",
                config_path.display(),
                e
            );
            log::warn!("{}", msg);
            emit_opencode_warning(app, msg.clone());
            Err(msg)
        }
    }
}

fn build_aether_provider(endpoint: &str, proxy_models: &[(String, String)]) -> serde_json::Value {
    let models_obj: serde_json::Map<String, serde_json::Value> = proxy_models
        .iter()
        .map(|(key, display)| (key.clone(), serde_json::json!({ "name": display })))
        .collect();

    serde_json::json!({
        "id": "aether",
        "name": "Aether Proxy",
        "baseURL": format!("{}/v1", endpoint),
        "apiKey": "aether-managed",
        "models": serde_json::Value::Object(models_obj)
    })
}

fn refresh_aether_models_in_config(
    config: &mut serde_json::Value,
    proxy_models: &[(String, String)],
) -> bool {
    let models_obj: serde_json::Map<String, serde_json::Value> = proxy_models
        .iter()
        .map(|(key, display)| (key.clone(), serde_json::json!({ "name": display })))
        .collect();

    if let Some(aether) = config
        .get_mut("provider")
        .and_then(|v| v.get_mut("aether"))
        .and_then(|v| v.as_object_mut())
    {
        aether.insert("models".to_string(), serde_json::Value::Object(models_obj));
        true
    } else {
        false
    }
}

fn deconfigure_opencode_json(config: &mut serde_json::Value) -> bool {
    let mut changed = false;
    if let Some(provider_obj) = config.get_mut("provider").and_then(|v| v.as_object_mut()) {
        changed = provider_obj.remove("aether").is_some();
        if provider_obj.is_empty() {
            if let Some(root) = config.as_object_mut() {
                root.remove("provider");
            }
        }
    }
    changed
}

pub fn configure_opencode(
    home: &std::path::Path,
    port: u16,
    endpoint: &str,
    model: Option<String>,
    app: Option<&tauri::AppHandle>,
) -> Result<serde_json::Value, String> {
    let config_dir = home.join(".config/opencode");
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let config_path = opencode_config_path(home);

    // Build models object from proxy config so OpenCode knows what's available
    let proxy_models = read_proxy_models(home);
    let aether_provider = build_aether_provider(endpoint, &proxy_models);

    // Merge aether provider into existing config
    let mut final_config = match read_opencode_json_for_merge(app, &config_path)? {
        Some(mut existing_json) => {
            if let Some(providers) = existing_json.get_mut("provider") {
                if let Some(obj) = providers.as_object_mut() {
                    obj.insert("aether".to_string(), aether_provider.clone());
                } else {
                    existing_json["provider"] = serde_json::json!({ "aether": aether_provider.clone() });
                }
            } else {
                existing_json["provider"] = serde_json::json!({ "aether": aether_provider.clone() });
            }
            // Ensure $schema is present
            if existing_json.get("$schema").is_none() {
                existing_json["$schema"] = serde_json::json!("https://opencode.ai/config.json");
            }
            existing_json
        }
        None => build_opencode_config(&aether_provider),
    };

    // If a specific model was selected, set it as the top-level default model.
    // Model format is "aether/<model-name>" so OpenCode picks the right provider.
    if let Some(ref selected_model) = model {
        if let Some(obj) = final_config.as_object_mut() {
            let model_key = if selected_model.contains('/') {
                selected_model.clone()
            } else {
                format!("aether/{}", selected_model)
            };
            obj.insert("model".to_string(), serde_json::json!(model_key));
        }
    }

    let config_str = serde_json::to_string_pretty(&final_config).map_err(|e| e.to_string())?;
    AtomicProjectionWriter
        .write_projection(ProjectionWriteRequest {
            target: config_path.to_string_lossy().to_string(),
            content: config_str,
        })
        .map_err(|e| e.to_string())?;

    let model_hint = model
        .as_deref()
        .map(|m| {
            if m.contains('/') {
                format!(" Default model set to '{}'.", m)
            } else {
                format!(" Default model set to 'aether/{}'.", m)
            }
        })
        .unwrap_or_else(|| " Use /model in OpenCode to select aether/<model>.".to_string());

    Ok(serde_json::json!({
        "success": true,
        "configType": "config",
        "configPath": config_path.to_string_lossy(),
        "instructions": format!(
            "OpenCode configured with Aether provider (port {}).{}",
            port, model_hint
        )
    }))
}

/// Preview what configure_opencode would write, without actually writing it.
/// Returns the JSON that would be merged into opencode.json.
#[tauri::command]
pub fn preview_opencode_config(port: Option<u16>, model: Option<String>) -> Result<serde_json::Value, String> {
    let resolved_port = port.unwrap_or_else(|| {
        settings::read_settings()
            .map(|s| s.proxy_port)
            .unwrap_or(8317)
    });
    let endpoint = format!("http://127.0.0.1:{}", resolved_port);
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let config_path = home.join(".config/opencode/opencode.json");

    let proxy_models = read_proxy_models(&home);
    let models_obj: serde_json::Map<String, serde_json::Value> = proxy_models
        .iter()
        .map(|(key, display)| (key.clone(), serde_json::json!({ "name": display })))
        .collect();

    let aether_provider = serde_json::json!({
        "id": "aether",
        "name": "Aether Proxy",
        "baseURL": format!("{}/v1", endpoint),
        "apiKey": "aether-managed",
        "models": serde_json::Value::Object(models_obj)
    });

    // Build the preview of what would be injected (just the delta)
    let mut injected = serde_json::json!({
        "provider": {
            "aether": aether_provider
        }
    });

    if let Some(ref selected_model) = model {
        let model_key = if selected_model.contains('/') {
            selected_model.clone()
        } else {
            format!("aether/{}", selected_model)
        };
        injected["model"] = serde_json::json!(model_key);
    }

    let existing_has_config = config_path.exists();
    let existing_has_aether = if existing_has_config {
        std::fs::read_to_string(&config_path)
            .map(|c| c.contains("\"aether\""))
            .unwrap_or(false)
    } else {
        false
    };

    Ok(serde_json::json!({
        "configPath": config_path.to_string_lossy(),
        "existingFileFound": existing_has_config,
        "existingAetherProvider": existing_has_aether,
        "willInject": injected,
        "isSafeMerge": true
    }))
}

#[tauri::command]
pub fn deconfigure_opencode(app: tauri::AppHandle) -> Result<V2CommandEnvelope<bool>, String> {
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let config_path = opencode_config_path(&home);
    if !config_path.exists() {
        return Ok(V2CommandEnvelope::ok(false));
    }

    let mut json = match read_opencode_json_for_merge(Some(&app), &config_path) {
        Ok(Some(v)) => v,
        Ok(None) => return Ok(V2CommandEnvelope::ok(false)),
        Err(_) => return Ok(V2CommandEnvelope::ok(false)),
    };

    let changed = deconfigure_opencode_json(&mut json);

    if changed {
        let content = serde_json::to_string_pretty(&json).map_err(|e| e.to_string())?;
        AtomicProjectionWriter
            .write_projection(ProjectionWriteRequest {
                target: config_path.to_string_lossy().to_string(),
                content,
            })
            .map_err(|e| e.to_string())?;
    }

    Ok(V2CommandEnvelope::ok(changed))
}

#[tauri::command]
pub fn refresh_opencode_models(
    app: tauri::AppHandle,
    port: Option<u16>,
) -> Result<V2CommandEnvelope<bool>, String> {
    let resolved_port = port.unwrap_or_else(|| {
        settings::read_settings()
            .map(|s| s.proxy_port)
            .unwrap_or(8317)
    });
    let endpoint = format!("http://127.0.0.1:{}", resolved_port);
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let config_path = opencode_config_path(&home);

    let proxy_models = read_proxy_models(&home);

    if !config_path.exists() {
        let _ = configure_opencode(&home, resolved_port, &endpoint, None, Some(&app))?;
        let _ = app.emit("opencode-models-refreshed", serde_json::json!({ "configured": true }));
        return Ok(V2CommandEnvelope::ok(true));
    }

    let mut json = match read_opencode_json_for_merge(Some(&app), &config_path) {
        Ok(Some(v)) => v,
        Ok(None) => build_opencode_config(&build_aether_provider(&endpoint, &proxy_models)),
        Err(_) => return Ok(V2CommandEnvelope::ok(false)),
    };

    let has_aether = json
        .get("provider")
        .and_then(|v| v.get("aether"))
        .is_some();

    if !has_aether {
        let _ = configure_opencode(&home, resolved_port, &endpoint, None, Some(&app))?;
        let _ = app.emit("opencode-models-refreshed", serde_json::json!({ "configured": true }));
        return Ok(V2CommandEnvelope::ok(true));
    }

    let _ = refresh_aether_models_in_config(&mut json, &proxy_models);

    let content = serde_json::to_string_pretty(&json).map_err(|e| e.to_string())?;
    AtomicProjectionWriter
        .write_projection(ProjectionWriteRequest {
            target: config_path.to_string_lossy().to_string(),
            content,
        })
        .map_err(|e| e.to_string())?;

    let _ = app.emit("opencode-models-refreshed", serde_json::json!({ "configured": false }));
    Ok(V2CommandEnvelope::ok(true))
}

/// Preview what configure_claude_code would write, without actually writing it.
/// Returns the JSON that would be merged into ~/.claude/settings.json.
#[tauri::command]
pub fn preview_claude_code_config(
    port: Option<u16>,
    model: Option<String>,
    opus_model: Option<String>,
    sonnet_model: Option<String>,
    haiku_model: Option<String>,
    small_fast_model: Option<String>,
) -> Result<serde_json::Value, String> {
    let resolved_port = port.unwrap_or_else(|| {
        settings::read_settings()
            .map(|s| s.proxy_port)
            .unwrap_or(8317)
    });
    let endpoint = format!("http://127.0.0.1:{}", resolved_port);
    let home = dirs::home_dir().ok_or("Could not find home directory")?;
    let config_path = home.join(".claude/settings.json");

    let selected_model = model.unwrap_or_else(|| "claude-sonnet-4-6".to_string());

    let env_delta = serde_json::json!({
        "ANTHROPIC_BASE_URL": endpoint,
        "ANTHROPIC_AUTH_TOKEN": "aether-managed",
        "ANTHROPIC_MODEL": selected_model,
        "ANTHROPIC_DEFAULT_OPUS_MODEL": opus_model.as_deref().unwrap_or("claude-opus-4-6"),
        "ANTHROPIC_DEFAULT_SONNET_MODEL": sonnet_model.as_deref().unwrap_or("claude-sonnet-4-6"),
        "ANTHROPIC_DEFAULT_HAIKU_MODEL": haiku_model.as_deref().unwrap_or("claude-haiku-4-5-20251001"),
        "ANTHROPIC_SMALL_FAST_MODEL": small_fast_model.as_deref().unwrap_or("claude-haiku-4-5-20251001"),
    });

    let injected = serde_json::json!({
        "env": env_delta,
        "model": selected_model,
    });

    let existing_has_config = config_path.exists();
    let existing_has_env = if existing_has_config {
        std::fs::read_to_string(&config_path)
            .map(|c| c.contains("ANTHROPIC_BASE_URL") || c.contains("aether-managed"))
            .unwrap_or(false)
    } else {
        false
    };

    Ok(serde_json::json!({
        "configPath": config_path.to_string_lossy(),
        "existingFileFound": existing_has_config,
        "existingEnvConfig": existing_has_env,
        "willInject": injected,
        "isSafeMerge": true
    }))
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

fn build_opencode_config(aether_provider: &serde_json::Value) -> serde_json::Value {
    serde_json::json!({
        "$schema": "https://opencode.ai/config.json",
        "provider": {
            "aether": aether_provider
        }
    })
}

/// Merge `value` into the top-level `key` object of a JSON settings file,
/// creating or overwriting keys as needed.
fn merge_into_settings_json(
    path: &std::path::Path,
    key: &str,
    value: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let existing_json = if path.exists() {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|c| serde_json::from_str::<serde_json::Value>(&c).ok())
            .unwrap_or_else(|| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    let mut result = existing_json;

    if let Some(section) = result.get_mut(key) {
        if let (Some(section_obj), Some(new_obj)) =
            (section.as_object_mut(), value.as_object())
        {
            for (k, v) in new_obj {
                section_obj.insert(k.clone(), v.clone());
            }
        }
    } else {
        result[key] = value;
    }

    Ok(result)
}

/// Check whether a binary exists by scanning known installation directories.
///
/// macOS apps are sandboxed and cannot call `which`, so we probe static paths.
fn which_exists(cmd: &str) -> bool {
    let home = dirs::home_dir().unwrap_or_default();

    let mut paths: Vec<std::path::PathBuf> = vec![
        // Homebrew (Apple Silicon)
        std::path::PathBuf::from("/opt/homebrew/bin"),
        // Homebrew (Intel) / system
        std::path::PathBuf::from("/usr/local/bin"),
        // System binaries
        std::path::PathBuf::from("/usr/bin"),
        // Cargo (Rust)
        home.join(".cargo/bin"),
        // npm global (default)
        home.join(".npm-global/bin"),
        // npm global (alternative)
        std::path::PathBuf::from("/usr/local/lib/node_modules/.bin"),
        // Homebrew node modules
        std::path::PathBuf::from("/opt/homebrew/lib/node_modules/.bin"),
        // Local bin
        home.join(".local/bin"),
        // Go binaries
        home.join("go/bin"),
        // Bun binaries
        home.join(".bun/bin"),
        // OpenCode CLI
        home.join(".opencode/bin"),
        // Volta managed binaries
        home.join(".volta/bin"),
        // pnpm global store (macOS default)
        home.join("Library/pnpm"),
        // mise/asdf shims
        home.join(".local/share/mise/shims"),
        home.join(".asdf/shims"),
    ];

    // NVM node versions
    let nvm_dir = home.join(".nvm/versions/node");
    if nvm_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
            for entry in entries.flatten() {
                let bin_path = entry.path().join("bin");
                if bin_path.exists() {
                    paths.push(bin_path);
                }
            }
        }
    }

    // fnm (Fast Node Manager) — default alias symlinks
    let fnm_dir = home.join(".fnm/aliases/default/bin");
    if fnm_dir.exists() {
        paths.push(fnm_dir);
    }

    for path in &paths {
        if path.join(cmd).exists() {
            return true;
        }
    }

    false
}

/// Check whether an environment variable starts with `expected_prefix`.
///
/// # ⚠️ macOS sandbox limitation
/// Sandboxed macOS apps do NOT inherit the user's shell environment
/// (~/.zshrc, ~/.bashrc, etc.), so `std::env::var` will almost always
/// return `Err` for user-defined variables. This function is therefore
/// unreliable for detecting env-only configured agents (Gemini CLI, Kiro)
/// and should only be used as a best-effort fallback.
fn check_env_configured(var: &str, expected_prefix: &str) -> bool {
    std::env::var(var)
        .map(|v| v.starts_with(expected_prefix))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn configure_merges_aether_and_preserves_other_providers_shape() {
        let endpoint = "http://127.0.0.1:8317";
        let proxy_models = vec![
            ("openai:gpt-4o".to_string(), "gpt-4o".to_string()),
            ("groq:llama-3.1-70b".to_string(), "llama-3.1-70b".to_string()),
        ];
        let aether = build_aether_provider(endpoint, &proxy_models);

        let mut cfg = serde_json::json!({
            "$schema": "https://opencode.ai/config.json",
            "provider": {
                "existing": {
                    "name": "Existing",
                    "baseURL": "https://api.example.com/v1"
                }
            }
        });

        cfg["provider"]["aether"] = aether;

        assert!(cfg["provider"].get("existing").is_some());
        assert_eq!(
            cfg["provider"]["aether"]["baseURL"].as_str(),
            Some("http://127.0.0.1:8317/v1")
        );
        assert_eq!(
            cfg["provider"]["aether"]["apiKey"].as_str(),
            Some("aether-managed")
        );
        assert!(cfg["provider"]["aether"]["models"].get("openai:gpt-4o").is_some());
    }

    #[test]
    fn deconfigure_removes_only_aether_provider() {
        let mut cfg = serde_json::json!({
            "provider": {
                "aether": { "name": "Aether Proxy" },
                "other": { "name": "Other" }
            }
        });

        let changed = deconfigure_opencode_json(&mut cfg);
        assert!(changed);
        assert!(cfg["provider"].get("aether").is_none());
        assert!(cfg["provider"].get("other").is_some());
    }

    #[test]
    fn refresh_updates_only_models_preserving_baseurl_and_apikey() {
        let mut cfg = serde_json::json!({
            "provider": {
                "aether": {
                    "name": "Aether Proxy",
                    "baseURL": "http://127.0.0.1:9999/v1",
                    "apiKey": "aether-managed",
                    "models": {
                        "old:model": { "name": "old:model" }
                    }
                }
            }
        });

        let updated = refresh_aether_models_in_config(
            &mut cfg,
            &[("new:model".to_string(), "new:model".to_string())],
        );

        assert!(updated);
        assert_eq!(
            cfg["provider"]["aether"]["baseURL"].as_str(),
            Some("http://127.0.0.1:9999/v1")
        );
        assert_eq!(
            cfg["provider"]["aether"]["apiKey"].as_str(),
            Some("aether-managed")
        );
        assert!(cfg["provider"]["aether"]["models"].get("new:model").is_some());
        assert!(cfg["provider"]["aether"]["models"].get("old:model").is_none());
    }
}
