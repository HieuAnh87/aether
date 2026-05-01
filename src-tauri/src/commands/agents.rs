//! CLI Agent detection and configuration commands.
//!
//! Detects installed CLI agents (Claude Code, Codex, Gemini CLI, Amp, OpenCode, Kiro)
//! and configures them to route through the Aether proxy.

use crate::config::settings;

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

    // 3. Gemini CLI — env var only
    let gemini_installed = which_exists("gemini");
    let gemini_configured = check_env_configured("CODE_ASSIST_ENDPOINT", &endpoint);

    agents.push(AgentStatus {
        id: "gemini-cli".to_string(),
        name: "Gemini CLI".to_string(),
        description: "Google's Gemini CLI for Gemini models".to_string(),
        installed: gemini_installed,
        configured: gemini_configured,
        config_type: "env".to_string(),
        config_path: None,
        docs_url: "https://github.com/google-gemini/gemini-cli".to_string(),
    });

    // 4. Amp CLI — ~/.config/amp/settings.json
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

    // 5. OpenCode — ~/.config/opencode/opencode.json
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

    // 6. Kiro — env var only
    let kiro_installed = which_exists("kiro") || which_exists("kiro-cli");
    let kiro_configured = check_env_configured("KIRO_ENDPOINT", &endpoint);

    agents.push(AgentStatus {
        id: "kiro".to_string(),
        name: "Kiro".to_string(),
        description: "AWS's AI coding agent with spec-driven development".to_string(),
        installed: kiro_installed,
        configured: kiro_configured,
        config_type: "env".to_string(),
        config_path: None,
        docs_url: "https://kiro.dev/docs/".to_string(),
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
) -> Result<serde_json::Value, String> {
    let resolved_port = port.unwrap_or_else(|| {
        settings::read_settings()
            .map(|s| s.proxy_port)
            .unwrap_or(8317)
    });

    let endpoint = format!("http://127.0.0.1:{}", resolved_port);
    let home = dirs::home_dir().ok_or("Could not find home directory")?;

    match agent_id.as_str() {
        "claude-code" => configure_claude_code(&home, &endpoint, model),
        "codex" => configure_codex(&home, &endpoint, model, effort),
        "gemini-cli" => configure_gemini_cli(&endpoint),
        "amp-cli" => configure_amp_cli(&home, resolved_port),
        "opencode" => configure_opencode(&home, resolved_port, &endpoint, model),
        "kiro" => configure_kiro(&endpoint),
        _ => Err(format!("Unknown agent: {}", agent_id)),
    }
}

// ---------------------------------------------------------------------------
// Per-agent configuration helpers
// ---------------------------------------------------------------------------

fn configure_claude_code(
    home: &std::path::Path,
    endpoint: &str,
    model: Option<String>,
) -> Result<serde_json::Value, String> {
    let config_dir = home.join(".claude");
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let config_path = config_dir.join("settings.json");

    let selected_model = model.unwrap_or_else(|| "claude-sonnet-4-6".to_string());

    let env_config = serde_json::json!({
        "ANTHROPIC_BASE_URL": endpoint,
        "ANTHROPIC_AUTH_TOKEN": "aether-managed",
        "ANTHROPIC_MODEL": selected_model,
        "ANTHROPIC_DEFAULT_OPUS_MODEL": "claude-opus-4-6",
        "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-sonnet-4-6",
        "ANTHROPIC_DEFAULT_HAIKU_MODEL": "claude-haiku-4-5-20251001",
        "ANTHROPIC_SMALL_FAST_MODEL": "claude-haiku-4-5-20251001"
    });

    let mut final_config = merge_into_settings_json(&config_path, "env", env_config)?;

    // Also set the top-level `model` key for Claude Code >= 2.x which reads it directly
    if let Some(obj) = final_config.as_object_mut() {
        obj.insert("model".to_string(), serde_json::json!(selected_model));
    }

    let config_str = serde_json::to_string_pretty(&final_config).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, &config_str).map_err(|e| e.to_string())?;

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

    std::fs::write(&config_path, &merged).map_err(|e| e.to_string())?;

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
    std::fs::write(&auth_path, &auth_content).map_err(|e| e.to_string())?;

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

fn configure_gemini_cli(endpoint: &str) -> Result<serde_json::Value, String> {
    let shell_config = format!("export CODE_ASSIST_ENDPOINT=\"{}\"", endpoint);

    Ok(serde_json::json!({
        "success": true,
        "configType": "env",
        "shellConfig": shell_config,
        "instructions": "Add the above line to your ~/.bashrc, ~/.zshrc, or shell config file, then restart your terminal."
    }))
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
    std::fs::write(&config_path, &settings_str).map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "success": true,
        "configType": "file",
        "configPath": config_path.to_string_lossy(),
        "instructions": "Amp CLI configured. Run 'amp' to start using it."
    }))
}

/// Read all model names from proxy-config.yaml.
/// Returns a deduplicated list of model names across all openai-compat providers.
fn read_proxy_models(home: &std::path::Path) -> Vec<String> {
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
    let mut models: Vec<String> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut in_openai_section = false;
    let mut in_models_block = false;
    let mut models_indent: usize = 0;

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
            continue;
        }

        if !in_openai_section {
            continue;
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
                if !model_name.is_empty() && seen.insert(model_name.clone()) {
                    models.push(model_name);
                }
            }
        }
    }

    models
}

fn configure_opencode(
    home: &std::path::Path,
    port: u16,
    endpoint: &str,
    model: Option<String>,
) -> Result<serde_json::Value, String> {
    let config_dir = home.join(".config/opencode");
    std::fs::create_dir_all(&config_dir).map_err(|e| e.to_string())?;
    let config_path = config_dir.join("opencode.json");

    // Build models object from proxy config so OpenCode knows what's available
    let proxy_models = read_proxy_models(home);
    let models_obj: serde_json::Map<String, serde_json::Value> = proxy_models
        .iter()
        .map(|m| (m.clone(), serde_json::json!({})))
        .collect();

    let mut aether_provider = serde_json::json!({
        "npm": "@ai-sdk/openai-compatible",
        "name": "Aether",
        "options": {
            "baseURL": format!("{}/v1", endpoint),
            "apiKey": "aether-managed"
        }
    });

    if !models_obj.is_empty() {
        aether_provider["models"] = serde_json::Value::Object(models_obj);
    }

    // Merge aether provider into existing config
    let mut final_config = if config_path.exists() {
        if let Ok(existing) = std::fs::read_to_string(&config_path) {
            if let Ok(mut existing_json) = serde_json::from_str::<serde_json::Value>(&existing) {
                if let Some(providers) = existing_json.get_mut("provider") {
                    if let Some(obj) = providers.as_object_mut() {
                        obj.insert("aether".to_string(), aether_provider);
                    }
                } else {
                    existing_json["provider"] = serde_json::json!({ "aether": aether_provider });
                }
                // Ensure $schema is present
                if existing_json.get("$schema").is_none() {
                    existing_json["$schema"] = serde_json::json!("https://opencode.ai/config.json");
                }
                existing_json
            } else {
                build_opencode_config(&aether_provider)
            }
        } else {
            build_opencode_config(&aether_provider)
        }
    } else {
        build_opencode_config(&aether_provider)
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
    std::fs::write(&config_path, &config_str).map_err(|e| e.to_string())?;

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
        .map(|m| (m.clone(), serde_json::json!({})))
        .collect();

    let mut aether_provider = serde_json::json!({
        "npm": "@ai-sdk/openai-compatible",
        "name": "Aether",
        "options": {
            "baseURL": format!("{}/v1", endpoint),
            "apiKey": "aether-managed"
        }
    });

    if !models_obj.is_empty() {
        aether_provider["models"] = serde_json::Value::Object(models_obj);
    }

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

fn configure_kiro(endpoint: &str) -> Result<serde_json::Value, String> {
    let shell_config = format!(
        "export KIRO_ENDPOINT=\"{}\"\nexport KIRO_API_KEY=\"aether-managed\"",
        endpoint
    );

    Ok(serde_json::json!({
        "success": true,
        "configType": "env",
        "shellConfig": shell_config,
        "instructions": "Add the above lines to your ~/.bashrc, ~/.zshrc, or shell config file, then restart your terminal."
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
