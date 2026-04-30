pub mod settings;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::PathBuf;

// ---------------------------------------------------------------------------
// Serde types for oh-my-opencode-slim.json
// ---------------------------------------------------------------------------

/// A single agent config within a preset.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub model: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub variant: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub skills: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub mcps: Vec<String>,
    /// Catch-all for any extra fields we don't explicitly model.
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

/// A preset is a map of agent-name → AgentConfig.
pub type Preset = HashMap<String, AgentConfig>;

/// Root of oh-my-opencode-slim.json.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SlimConfig {
    #[serde(rename = "$schema", default, skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,
    /// Currently active preset name.
    pub preset: String,
    /// All defined presets.
    #[serde(default)]
    pub presets: HashMap<String, Preset>,
    /// Catch-all for extra top-level keys.
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

// ---------------------------------------------------------------------------
// Serde types for opencode.json
// ---------------------------------------------------------------------------

/// A single model within a provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfig {
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

/// A provider entry in opencode.json.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub npm: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub options: Option<Value>,
    #[serde(default)]
    pub models: HashMap<String, ModelConfig>,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

/// Minimal opencode.json structure.
/// The provider key is `"provider"` (singular) but we try `"providers"` as fallback.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenCodeConfig {
    #[serde(flatten)]
    pub raw: HashMap<String, Value>,
}

impl OpenCodeConfig {
    /// Extract provider map, trying `"provider"` then `"providers"`.
    pub fn providers(&self) -> HashMap<String, ProviderConfig> {
        let key = if self.raw.contains_key("provider") {
            "provider"
        } else {
            "providers"
        };
        self.raw
            .get(key)
            .and_then(|v| serde_json::from_value::<HashMap<String, ProviderConfig>>(v.clone()).ok())
            .unwrap_or_default()
    }

    /// Return all available model IDs as `"provider_name/model_name"`.
    pub fn available_models(&self) -> Vec<String> {
        let mut models = Vec::new();
        for (prov_name, prov) in self.providers() {
            for model_name in prov.models.keys() {
                models.push(format!("{}/{}", prov_name, model_name));
            }
        }
        models.sort();
        models
    }

    /// Return a map of model_id → list of variant short names (e.g. ["low", "medium", "high"]).
    /// Only models that have a `variants` key with at least one entry are included.
    pub fn model_variants(&self) -> HashMap<String, Vec<String>> {
        let mut result = HashMap::new();
        for (prov_name, prov) in self.providers() {
            for (model_name, model_cfg) in &prov.models {
                if let Some(variants_val) = model_cfg.extra.get("variants") {
                    if let Some(variants_map) = variants_val.as_object() {
                        // Extract short names: "thinking-low" → "low", "thinking-medium" → "medium"
                        let mut short_names: Vec<String> = variants_map
                            .keys()
                            .map(|k| {
                                k.strip_prefix("thinking-")
                                    .unwrap_or(k)
                                    .to_string()
                            })
                            .collect();
                        short_names.sort_by(|a, b| {
                            let order = |s: &str| match s {
                                "low" => 0,
                                "medium" => 1,
                                "high" => 2,
                                _ => 3,
                            };
                            order(a).cmp(&order(b))
                        });
                        if !short_names.is_empty() {
                            let model_id = format!("{}/{}", prov_name, model_name);
                            result.insert(model_id, short_names);
                        }
                    }
                }
            }
        }
        result
    }
}

// ---------------------------------------------------------------------------
// Return type for frontend
// ---------------------------------------------------------------------------

/// Serializable preset info for the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresetInfo {
    pub name: String,
    pub active: bool,
    pub agents: HashMap<String, AgentConfig>,
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

fn opencode_config_dir() -> Result<PathBuf> {
    let home = dirs::home_dir().context("Cannot determine home directory")?;
    Ok(home.join(".config").join("opencode"))
}

fn slim_config_path() -> Result<PathBuf> {
    Ok(opencode_config_dir()?.join("oh-my-opencode-slim.json"))
}

fn opencode_config_path() -> Result<PathBuf> {
    Ok(opencode_config_dir()?.join("opencode.json"))
}

/// Ensure config directory exists.
fn ensure_config_dir() -> Result<()> {
    let dir = opencode_config_dir()?;
    if !dir.exists() {
        fs::create_dir_all(&dir).context("Failed to create config directory")?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Read / Write
// ---------------------------------------------------------------------------

pub fn read_slim_config() -> Result<SlimConfig> {
    let path = slim_config_path()?;
    if !path.exists() {
        // Return empty default config
        return Ok(SlimConfig {
            schema: None,
            preset: String::new(),
            presets: HashMap::new(),
            extra: HashMap::new(),
        });
    }
    let data = fs::read_to_string(&path)
        .with_context(|| format!("Failed to read {}", path.display()))?;
    serde_json::from_str(&data).context("Failed to parse oh-my-opencode-slim.json")
}

/// Atomic write: write to temp file, then rename.
/// Skips write if content is unchanged (idempotent).
pub fn write_slim_config(config: &SlimConfig) -> Result<()> {
    ensure_config_dir()?;
    let path = slim_config_path()?;
    let new_content = serde_json::to_string_pretty(config)
        .context("Failed to serialize slim config")?;

    // Skip if unchanged
    if let Ok(existing) = fs::read_to_string(&path) {
        if existing == new_content {
            return Ok(());
        }
    }

    // Atomic write via temp file + rename
    let dir = path.parent().context("No parent dir")?;
    let mut tmp = tempfile::NamedTempFile::new_in(dir)
        .context("Failed to create temp file")?;
    tmp.write_all(new_content.as_bytes())
        .context("Failed to write temp file")?;
    tmp.persist(&path)
        .context("Failed to persist config file")?;

    Ok(())
}

pub fn read_opencode_config() -> Result<OpenCodeConfig> {
    let path = opencode_config_path()?;
    if !path.exists() {
        return Ok(OpenCodeConfig {
            raw: HashMap::new(),
        });
    }
    let data = fs::read_to_string(&path)
        .with_context(|| format!("Failed to read {}", path.display()))?;
    serde_json::from_str(&data).context("Failed to parse opencode.json")
}

// ---------------------------------------------------------------------------
// Preset name validation
// ---------------------------------------------------------------------------

/// Validate preset name: `^[A-Za-z0-9_-]+$`
pub fn is_valid_preset_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

// ---------------------------------------------------------------------------
// Preset operations
// ---------------------------------------------------------------------------

/// Get all presets with their active status.
pub fn get_presets() -> Result<Vec<PresetInfo>> {
    let config = read_slim_config()?;
    let mut presets: Vec<PresetInfo> = config
        .presets
        .into_iter()
        .map(|(name, agents)| PresetInfo {
            active: name == config.preset,
            name,
            agents,
        })
        .collect();
    presets.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(presets)
}

/// Set the active preset.
pub fn set_active_preset(name: &str) -> Result<()> {
    let mut config = read_slim_config()?;
    if !config.presets.contains_key(name) {
        anyhow::bail!("Preset '{}' does not exist", name);
    }
    config.preset = name.to_string();
    write_slim_config(&config)
}

/// Create a new preset with default (empty) agent configs.
pub fn create_preset(name: &str) -> Result<()> {
    if !is_valid_preset_name(name) {
        anyhow::bail!("Invalid preset name: must match [A-Za-z0-9_-]+");
    }
    let mut config = read_slim_config()?;
    if config.presets.contains_key(name) {
        anyhow::bail!("Preset '{}' already exists", name);
    }

    let default_agents = ["orchestrator", "oracle", "librarian", "explorer", "designer", "fixer"];
    let mut agents = HashMap::new();
    for agent in &default_agents {
        agents.insert(
            agent.to_string(),
            AgentConfig {
                model: String::new(),
                variant: None,
                skills: Vec::new(),
                mcps: Vec::new(),
                extra: HashMap::new(),
            },
        );
    }
    config.presets.insert(name.to_string(), agents);
    write_slim_config(&config)
}

/// Update an existing preset's agent configs.
pub fn update_preset(name: &str, agents: HashMap<String, AgentConfig>) -> Result<()> {
    let mut config = read_slim_config()?;
    if !config.presets.contains_key(name) {
        anyhow::bail!("Preset '{}' does not exist", name);
    }
    config.presets.insert(name.to_string(), agents);
    write_slim_config(&config)
}

/// Delete a preset. If it was active, activate the first remaining preset.
pub fn delete_preset(name: &str) -> Result<()> {
    let mut config = read_slim_config()?;
    if !config.presets.contains_key(name) {
        anyhow::bail!("Preset '{}' does not exist", name);
    }
    config.presets.remove(name);

    // If we deleted the active preset, switch to first remaining
    if config.preset == name {
        config.preset = config
            .presets
            .keys()
            .next()
            .cloned()
            .unwrap_or_default();
    }
    write_slim_config(&config)
}

/// Duplicate a preset with auto-generated name (name-copy, name-copy-2, etc.)
pub fn duplicate_preset(name: &str) -> Result<String> {
    let config = read_slim_config()?;
    let source = config
        .presets
        .get(name)
        .context(format!("Preset '{}' does not exist", name))?
        .clone();

    // Generate unique copy name
    let mut copy_name = format!("{}-copy", name);
    let mut counter = 2;
    while config.presets.contains_key(&copy_name) {
        copy_name = format!("{}-copy-{}", name, counter);
        counter += 1;
    }

    let mut new_config = config;
    new_config.presets.insert(copy_name.clone(), source);
    write_slim_config(&new_config)?;
    Ok(copy_name)
}

/// Get all available model IDs from opencode.json.
pub fn get_available_models() -> Result<Vec<String>> {
    let config = read_opencode_config()?;
    Ok(config.available_models())
}

/// Create a backup of the slim config file before import.
pub fn backup_slim_config() -> Result<()> {
    let path = slim_config_path()?;
    if path.exists() {
        let backup = path.with_extension("json.bak");
        fs::copy(&path, &backup)
            .with_context(|| format!("Failed to backup {}", path.display()))?;
    }
    Ok(())
}
