use std::collections::HashMap;

use anyhow::Result;
use tauri::AppHandle;

use crate::config::{self, AgentConfig, PresetInfo};
use crate::core::domain::ports::{PersistencePort, PersistenceTransaction};
use crate::core::infrastructure::persistence::SqlitePersistenceAdapter;
use crate::keychain;

pub struct CommandTransitionService {
    persistence: SqlitePersistenceAdapter,
}

impl CommandTransitionService {
    pub fn new(persistence: SqlitePersistenceAdapter) -> Self {
        Self { persistence }
    }

    pub fn get_presets(&self) -> Result<Vec<PresetInfo>> {
        config::get_presets()
    }

    pub fn set_active_preset(&self, name: &str) -> Result<()> {
        config::set_active_preset(name)?;
        self.record_mutation("set_active_preset", vec![("preset", name.to_string())])
    }

    pub fn create_preset(&self, name: &str) -> Result<()> {
        config::create_preset(name)?;
        self.record_mutation("create_preset", vec![("preset", name.to_string())])
    }

    pub fn update_preset(&self, name: &str, agents: HashMap<String, AgentConfig>) -> Result<()> {
        let agent_count = agents.len().to_string();
        config::update_preset(name, agents)?;
        self.record_mutation(
            "update_preset",
            vec![("preset", name.to_string()), ("agentCount", agent_count)],
        )
    }

    pub fn delete_preset(&self, name: &str) -> Result<()> {
        config::delete_preset(name)?;
        self.record_mutation("delete_preset", vec![("preset", name.to_string())])
    }

    pub fn duplicate_preset(&self, name: &str) -> Result<String> {
        let new_name = config::duplicate_preset(name)?;
        self.record_mutation(
            "duplicate_preset",
            vec![
                ("sourcePreset", name.to_string()),
                ("newPreset", new_name.clone()),
            ],
        )?;
        Ok(new_name)
    }

    pub fn get_provider_accounts(&self, app: &AppHandle) -> Result<Vec<crate::commands::ProviderAccountInfo>, String> {
        let mut accounts = Vec::new();
        for &provider in crate::commands::SUPPORTED_PROVIDERS {
            let key = keychain::get_api_key(app, provider)?;
            let has_key = key.is_some();
            let masked_key = key.map(|k| keychain::mask_key(&k));
            accounts.push(crate::commands::ProviderAccountInfo {
                provider: provider.to_string(),
                has_key,
                masked_key,
                status: if has_key {
                    "unverified".to_string()
                } else {
                    "none".to_string()
                },
            });
        }
        Ok(accounts)
    }

    pub fn add_provider_account(&self, app: &AppHandle, provider: &str, key: &str) -> Result<(), String> {
        if !crate::commands::SUPPORTED_PROVIDERS.contains(&provider) {
            return Err(format!("Unsupported provider: {}", provider));
        }
        keychain::store_api_key(app, provider, key)?;
        self.record_mutation(
            "add_provider_account",
            vec![
                ("provider", provider.to_string()),
                ("hasKey", "true".to_string()),
            ],
        )
        .map_err(|e| e.to_string())
    }

    pub fn update_api_key(&self, app: &AppHandle, provider: &str, key: &str) -> Result<(), String> {
        keychain::store_api_key(app, provider, key)?;
        self.record_mutation(
            "update_api_key",
            vec![
                ("provider", provider.to_string()),
                ("hasKey", "true".to_string()),
            ],
        )
        .map_err(|e| e.to_string())
    }

    pub fn delete_provider_account(&self, app: &AppHandle, provider: &str) -> Result<(), String> {
        keychain::delete_api_key(app, provider)?;
        self.record_mutation(
            "delete_provider_account",
            vec![("provider", provider.to_string())],
        )
        .map_err(|e| e.to_string())
    }

    fn record_mutation(&self, operation: &str, kv: Vec<(&str, String)>) -> Result<()> {
        let payload = kv
            .into_iter()
            .map(|(k, v)| (k.to_string(), v))
            .collect();
        let tx = PersistenceTransaction {
            operation: operation.to_string(),
            payload,
        };
        self.persistence.execute(tx)
    }

    pub fn record_mutation_external(&self, operation: &str, kv: Vec<(&str, String)>) -> Result<()> {
        self.record_mutation(operation, kv)
    }

}
