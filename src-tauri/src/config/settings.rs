use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default = "default_auto_start")]
    pub auto_start_proxy: bool,
    #[serde(default)]
    pub launch_at_login: bool,
    #[serde(default = "default_port")]
    pub proxy_port: u16,
    #[serde(default = "default_management_key")]
    pub management_key: String,
}

fn default_auto_start() -> bool {
    true
}
fn default_port() -> u16 {
    8317
}
fn default_management_key() -> String {
    "aether-managed".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            auto_start_proxy: true,
            launch_at_login: false,
            proxy_port: 8317,
            management_key: "aether-managed".to_string(),
        }
    }
}

fn settings_path() -> Result<PathBuf, anyhow::Error> {
    let config_dir = dirs::config_dir()
        .ok_or_else(|| anyhow::anyhow!("Could not find config directory"))?;
    Ok(config_dir.join("aether").join("settings.json"))
}

pub fn read_settings() -> Result<AppSettings, anyhow::Error> {
    let path = settings_path()?;
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let content = std::fs::read_to_string(&path)?;
    let settings: AppSettings = serde_json::from_str(&content)?;
    Ok(settings)
}

pub fn write_settings(settings: &AppSettings) -> Result<(), anyhow::Error> {
    let path = settings_path()?;
    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    // Atomic write via tempfile
    let dir = path.parent().unwrap();
    let mut tmp = tempfile::NamedTempFile::new_in(dir)?;
    serde_json::to_writer_pretty(&mut tmp, settings)?;
    tmp.persist(&path)?;
    Ok(())
}
