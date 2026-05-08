use anyhow::{Context, Result};
use serde_json::json;

use crate::commands::agent_providers::read_providers_file;
use crate::core::infrastructure::persistence::{RuntimeStatusRecord, SqlitePersistenceAdapter};
use crate::proxy::{self, ProxyState, ProxyStatus};

use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tokio::time::{sleep, Duration};

const START_RETRY_DELAYS_MS: [u64; 3] = [250, 500, 1000];
const DEFAULT_FAILOVER_PRIORITY: i64 = 1000;

#[derive(Debug, Clone)]
struct FailoverRouteCandidate {
    route_id: String,
    compatibility: String,
    priority: i64,
}

pub struct ProxyRuntimeService {
    persistence: SqlitePersistenceAdapter,
}

impl ProxyRuntimeService {
    pub fn new(persistence: SqlitePersistenceAdapter) -> Self {
        Self { persistence }
    }

    pub async fn start(
        &self,
        app: &AppHandle,
        state: &Mutex<ProxyState>,
        port: u16,
    ) -> Result<()> {
        let correlation_id = format!(
            "proxy-start-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0)
        );

        self.persist_runtime_status(
            Some(app),
            ProxyStatus::Starting,
            "proxy_runtime_service",
            Some(
                json!({
                    "port": port,
                    "phase": "start_requested",
                    "correlationId": correlation_id,
                })
                .to_string(),
            ),
        )?;

        let failover_candidates = self.load_failover_candidates();

        for (attempt_index, delay_ms) in START_RETRY_DELAYS_MS.iter().enumerate() {
            let attempt = attempt_index + 1;

            if attempt > 1 {
                sleep(Duration::from_millis(*delay_ms)).await;
            }

            match proxy::start_proxy(app, state, port).await {
                Ok(()) => {
                    self.persist_runtime_status(
                        Some(app),
                        ProxyStatus::Running,
                        "proxy_runtime_service",
                        Some(
                            json!({
                                "port": port,
                                "phase": "start_dispatched",
                                "attempt": attempt,
                                "retryBudget": START_RETRY_DELAYS_MS.len(),
                                "correlationId": correlation_id,
                            })
                            .to_string(),
                        ),
                    )?;
                    return Ok(());
                }
                Err(err) => {
                    let maybe_route = self.select_failover_route(&failover_candidates, "openai");
                    let error_text = err.to_string();

                    self.persist_runtime_status(
                        Some(app),
                        ProxyStatus::Degraded,
                        "proxy_runtime_service",
                        Some(
                            json!({
                                "port": port,
                                "phase": "start_retry_failed",
                                "attempt": attempt,
                                "retryBudget": START_RETRY_DELAYS_MS.len(),
                                "error": error_text,
                                "selectedFailoverRoute": maybe_route.as_ref().map(|r| r.route_id.clone()),
                                "correlationId": correlation_id,
                            })
                            .to_string(),
                        ),
                    )?;

                    if let Some(route) = maybe_route {
                        self.persistence.update_routing_state(
                            "failover_selected_route",
                            &json!({
                                "routeId": route.route_id,
                                "compatibility": route.compatibility,
                                "priority": route.priority,
                                "reason": "startup_retry_failure",
                                "attempt": attempt,
                                "correlationId": correlation_id,
                            })
                            .to_string(),
                        )?;
                    }

                    if attempt == START_RETRY_DELAYS_MS.len() {
                        self.persist_runtime_status(
                            Some(app),
                            ProxyStatus::Crashed,
                            "proxy_runtime_service",
                            Some(
                                json!({
                                    "port": port,
                                    "phase": "start_failed_terminal",
                                    "attempt": attempt,
                                    "retryBudget": START_RETRY_DELAYS_MS.len(),
                                    "error": error_text,
                                    "correlationId": correlation_id,
                                })
                                .to_string(),
                            ),
                        )?;
                        return Err(err);
                    }
                }
            }
        }

        Err(anyhow::anyhow!("proxy start retry loop exited unexpectedly"))
    }

    pub async fn stop(&self, app: &AppHandle, state: &Mutex<ProxyState>) -> Result<()> {
        self.persist_runtime_status(
            Some(app),
            ProxyStatus::Stopping,
            "proxy_runtime_service",
            Some("{\"phase\":\"stop_requested\"}".to_string()),
        )?;

        match proxy::stop_proxy(app, state).await {
            Ok(()) => {
                self.persist_runtime_status(
                    Some(app),
                    ProxyStatus::Stopped,
                    "proxy_runtime_service",
                    Some("{\"phase\":\"stopped\"}".to_string()),
                )?;
                Ok(())
            }
            Err(err) => {
                self.persist_runtime_status(
                    Some(app),
                    ProxyStatus::Crashed,
                    "proxy_runtime_service",
                    Some(format!(
                        r#"{{"phase":"stop_failed","error":{}}}"#,
                        serde_json::to_string(&err.to_string()).unwrap_or_else(|_| "\"unknown\"".to_string())
                    )),
                )?;
                Err(err)
            }
        }
    }

    pub async fn restart(
        &self,
        app: &AppHandle,
        state: &Mutex<ProxyState>,
        port: u16,
    ) -> Result<()> {
        self.persist_runtime_status(
            Some(app),
            ProxyStatus::Stopping,
            "proxy_runtime_service",
            Some(format!(r#"{{"port":{},"phase":"restart_requested"}}"#, port)),
        )?;

        match proxy::restart_proxy(app, state, port).await {
            Ok(()) => {
                self.persist_runtime_status(
                    Some(app),
                    ProxyStatus::Running,
                    "proxy_runtime_service",
                    Some(format!(r#"{{"port":{},"phase":"restart_completed"}}"#, port)),
                )?;
                Ok(())
            }
            Err(err) => {
                self.persist_runtime_status(
                    Some(app),
                    ProxyStatus::Crashed,
                    "proxy_runtime_service",
                    Some(format!(
                        r#"{{"port":{},"phase":"restart_failed","error":{}}}"#,
                        port,
                        serde_json::to_string(&err.to_string()).unwrap_or_else(|_| "\"unknown\"".to_string())
                    )),
                )?;
                Err(err)
            }
        }
    }

    fn persist_runtime_status(
        &self,
        app: Option<&AppHandle>,
        status: ProxyStatus,
        source: &str,
        details_json: Option<String>,
    ) -> Result<()> {
        let state = proxy_status_to_state(status.clone());

        self.persistence
            .upsert_runtime_status(&RuntimeStatusRecord {
                state: state.clone(),
                source: source.to_string(),
                details_json: details_json.clone(),
            })
            .context("Failed persisting proxy runtime status")?;

        if let Some(app) = app {
            let timestamp_ms = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0);

            let details = details_json
                .as_deref()
                .and_then(|raw| serde_json::from_str::<serde_json::Value>(raw).ok())
                .unwrap_or_else(|| json!({}));

            app.emit(
                "proxy-runtime-lifecycle",
                json!({
                    "state": state,
                    "source": source,
                    "details": details,
                    "timestampMs": timestamp_ms,
                }),
            )
            .context("Failed emitting proxy runtime lifecycle event")?;
        }

        Ok(())
    }
}

impl ProxyRuntimeService {
    fn load_failover_candidates(&self) -> Vec<FailoverRouteCandidate> {
        let Ok(file) = read_providers_file() else {
            return vec![];
        };

        let mut candidates: Vec<FailoverRouteCandidate> = file
            .providers
            .into_iter()
            .map(|(id, entry)| {
                let priority = entry
                    .headers
                    .get("x-aether-priority")
                    .and_then(|v| v.parse::<i64>().ok())
                    .unwrap_or(DEFAULT_FAILOVER_PRIORITY);

                FailoverRouteCandidate {
                    route_id: id,
                    compatibility: entry.compatibility,
                    priority,
                }
            })
            .collect();

        candidates.sort_by(|a, b| {
            a.compatibility
                .cmp(&b.compatibility)
                .then(a.priority.cmp(&b.priority))
                .then(a.route_id.cmp(&b.route_id))
        });

        candidates
    }

    fn select_failover_route(
        &self,
        candidates: &[FailoverRouteCandidate],
        compatibility: &str,
    ) -> Option<FailoverRouteCandidate> {
        candidates
            .iter()
            .find(|candidate| candidate.compatibility == compatibility)
            .cloned()
    }
}

fn proxy_status_to_state(status: ProxyStatus) -> String {
    match status {
        ProxyStatus::Stopped => "stopped".to_string(),
        ProxyStatus::Starting => "starting".to_string(),
        ProxyStatus::Running => "running".to_string(),
        ProxyStatus::Degraded => "degraded".to_string(),
        ProxyStatus::Stopping => "stopping".to_string(),
        ProxyStatus::Crashed => "crashed".to_string(),
    }
}
