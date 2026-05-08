use std::cmp::Reverse;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};
use rusqlite::{params, OptionalExtension, Transaction};
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::config;
use crate::config::{AgentConfig, PresetInfo, SlimConfig};
use crate::core::domain::ports::{PersistencePort, PersistenceTransaction};

use super::db::SqliteDatabase;

#[derive(Clone)]
pub struct SqlitePersistenceAdapter {
    db: Arc<SqliteDatabase>,
    lock: Arc<Mutex<()>>,
}

#[derive(Debug, Clone)]
pub struct PresetRecord {
    pub id: String,
    pub name: String,
    pub payload_json: String,
    pub is_active: bool,
}

#[derive(Debug, Clone)]
pub struct ProviderAccountRecord {
    pub id: String,
    pub provider: String,
    pub display_name: String,
    pub secret_ref: Option<String>,
    pub metadata_json: String,
}

#[derive(Debug, Clone)]
pub struct AgentProviderRecord {
    pub id: String,
    pub provider_type: String,
    pub config_json: String,
    pub is_enabled: bool,
}

#[derive(Debug, Clone)]
pub struct RuntimeStatusRecord {
    pub state: String,
    pub source: String,
    pub details_json: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SyncJobRecord {
    pub id: String,
    pub job_type: String,
    pub status: String,
    pub correlation_id: String,
    pub retry_count: i64,
    pub payload_json: String,
    pub error_text: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct ProjectionSyncResult {
    pub presets_written: usize,
    pub active_preset: String,
}

#[derive(Debug, Clone, Default)]
pub struct ProjectionDriftReport {
    pub has_drift: bool,
    pub conflict_type: Option<String>,
    pub detail: String,
}

#[derive(Debug, Clone, Default)]
pub struct SyncRetryWorkerResult {
    pub scanned_jobs: usize,
    pub retried_jobs: usize,
    pub succeeded_jobs: usize,
    pub failed_jobs: usize,
}

const MAX_SYNC_RETRIES: i64 = 3;
const MIGRATION_BACKUP_RETENTION: usize = 5;

#[derive(Debug, Clone, Default)]
pub struct MigrationBackupResult {
    pub backup_dir: String,
    pub files_backed_up: usize,
    pub retained_sets: usize,
}

#[derive(Debug, Clone, Default)]
pub struct MigrationRollbackResult {
    pub restored_backup_dir: String,
    pub restored_files: usize,
    pub schema_version_verified: i64,
    pub projection_checksum_verified: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncJobStatus {
    Pending,
    Running,
    Succeeded,
    Failed,
}

impl SyncJobStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            SyncJobStatus::Pending => "pending",
            SyncJobStatus::Running => "running",
            SyncJobStatus::Succeeded => "succeeded",
            SyncJobStatus::Failed => "failed",
        }
    }
}

impl SqlitePersistenceAdapter {
    pub fn new(db: SqliteDatabase) -> Self {
        Self {
            db: Arc::new(db),
            lock: Arc::new(Mutex::new(())),
        }
    }

    pub fn initialize(&self) -> Result<()> {
        self.db.ensure_initialized()
    }

    pub fn db_path(&self) -> String {
        self.db.path().display().to_string()
    }

    pub fn create_migration_session_backup(&self, session_id: &str) -> Result<MigrationBackupResult> {
        if session_id.trim().is_empty() {
            anyhow::bail!("migration backup session_id must not be empty");
        }

        let _guard = self.lock.lock().expect("persistence mutex poisoned");

        let backup_root = default_backup_root()?;
        fs::create_dir_all(&backup_root)
            .with_context(|| format!("Failed creating backup root {}", backup_root.display()))?;

        let timestamp_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();

        let backup_dir = backup_root.join(format!("migration-{}-{}", session_id, timestamp_ms));
        fs::create_dir_all(&backup_dir)
            .with_context(|| format!("Failed creating backup dir {}", backup_dir.display()))?;

        let mut files_backed_up = 0usize;

        let db_path = self.db.path().to_path_buf();
        if db_path.exists() {
            let db_backup = backup_dir.join("aether-v2.db");
            fs::copy(&db_path, &db_backup).with_context(|| {
                format!(
                    "Failed backing up SQLite DB from {} to {}",
                    db_path.display(),
                    db_backup.display()
                )
            })?;
            files_backed_up += 1;
        }

        if let Ok(slim_path) = slim_config_backup_source() {
            if slim_path.exists() {
                let slim_backup = backup_dir.join("oh-my-opencode-slim.json");
                fs::copy(&slim_path, &slim_backup).with_context(|| {
                    format!(
                        "Failed backing up slim config from {} to {}",
                        slim_path.display(),
                        slim_backup.display()
                    )
                })?;
                files_backed_up += 1;
            }
        }

        let retained_sets = enforce_backup_retention(&backup_root, MIGRATION_BACKUP_RETENTION)?;

        self.with_transaction(|tx| {
            tx.execute(
                "INSERT INTO operation_log(operation_type, payload_json, created_at)
                 VALUES('migration_backup_created', json_object('session_id', ?1, 'backup_dir', ?2, 'files_backed_up', ?3, 'retained_sets', ?4), datetime('now'))",
                params![
                    session_id,
                    backup_dir.display().to_string(),
                    files_backed_up as i64,
                    retained_sets as i64
                ],
            )
            .context("Failed writing migration backup operation log")?;
            Ok(())
        })?;

        Ok(MigrationBackupResult {
            backup_dir: backup_dir.display().to_string(),
            files_backed_up,
            retained_sets,
        })
    }

    pub fn rollback_to_latest_checkpoint(&self) -> Result<MigrationRollbackResult> {
        let _guard = self.lock.lock().expect("persistence mutex poisoned");

        let backup_root = default_backup_root()?;
        let latest_backup_dir = latest_backup_dir(&backup_root)?;
        let latest_backup_dir_str = latest_backup_dir.display().to_string();

        let db_backup_path = latest_backup_dir.join("aether-v2.db");
        if !db_backup_path.exists() {
            anyhow::bail!(
                "Latest backup '{}' missing required SQLite snapshot 'aether-v2.db'",
                latest_backup_dir.display()
            );
        }

        let mut restored_files = 0usize;

        let db_target_path = self.db.path().to_path_buf();
        if let Some(parent) = db_target_path.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("Failed ensuring DB parent dir {}", parent.display()))?;
        }

        fs::copy(&db_backup_path, &db_target_path).with_context(|| {
            format!(
                "Failed restoring SQLite snapshot from {} to {}",
                db_backup_path.display(),
                db_target_path.display()
            )
        })?;
        restored_files += 1;

        let slim_backup_path = latest_backup_dir.join("oh-my-opencode-slim.json");
        let mut projection_checksum_verified = true;

        if slim_backup_path.exists() {
            let slim_target_path = slim_config_backup_source()?;
            if let Some(parent) = slim_target_path.parent() {
                fs::create_dir_all(parent).with_context(|| {
                    format!("Failed ensuring slim config parent dir {}", parent.display())
                })?;
            }

            fs::copy(&slim_backup_path, &slim_target_path).with_context(|| {
                format!(
                    "Failed restoring slim config snapshot from {} to {}",
                    slim_backup_path.display(),
                    slim_target_path.display()
                )
            })?;
            restored_files += 1;

            let source_checksum = file_checksum_hex(&slim_backup_path)
                .context("Failed computing checksum for slim backup snapshot")?;
            let restored_checksum = file_checksum_hex(&slim_target_path)
                .context("Failed computing checksum for restored slim projection")?;
            projection_checksum_verified = source_checksum == restored_checksum;

            if !projection_checksum_verified {
                anyhow::bail!(
                    "Slim projection checksum verification failed after rollback restore"
                );
            }
        }

        let schema_version_verified = self
            .get_latest_schema_version()
            .context("Failed verifying schema version after rollback restore")?;

        self.with_transaction(|tx| {
            tx.execute(
                "INSERT INTO operation_log(operation_type, payload_json, created_at)
                 VALUES('migration_rollback_restored', json_object('backup_dir', ?1, 'restored_files', ?2, 'schema_version', ?3, 'projection_checksum_verified', ?4), datetime('now'))",
                params![
                    latest_backup_dir_str,
                    restored_files as i64,
                    schema_version_verified,
                    if projection_checksum_verified { 1 } else { 0 }
                ],
            )
            .context("Failed writing migration rollback operation log")?;
            Ok(())
        })?;

        Ok(MigrationRollbackResult {
            restored_backup_dir: latest_backup_dir.display().to_string(),
            restored_files,
            schema_version_verified,
            projection_checksum_verified,
        })
    }

    pub fn upsert_preset(&self, preset: &PresetRecord) -> Result<()> {
        validate_json_no_secrets("presets.payload_json", &preset.payload_json)?;
        self.with_transaction(|tx| {
            tx.execute(
                "INSERT INTO presets(id, name, payload_json, is_active, created_at, updated_at)
                 VALUES(?1, ?2, ?3, ?4, datetime('now'), datetime('now'))
                 ON CONFLICT(id) DO UPDATE SET
                   name=excluded.name,
                   payload_json=excluded.payload_json,
                   is_active=excluded.is_active,
                   updated_at=datetime('now')",
                params![
                    preset.id,
                    preset.name,
                    preset.payload_json,
                    if preset.is_active { 1 } else { 0 }
                ],
            )
            .context("Failed upserting preset")?;
            Ok(())
        })
    }

    pub fn upsert_provider_account(&self, account: &ProviderAccountRecord) -> Result<()> {
        validate_json_no_secrets("provider_accounts.metadata_json", &account.metadata_json)?;

        if let Some(secret_ref) = &account.secret_ref {
            if looks_like_secret_literal(secret_ref) {
                anyhow::bail!(
                    "provider_accounts.secret_ref appears to contain raw secret material; only keychain references are allowed"
                );
            }
        }

        self.with_transaction(|tx| {
            tx.execute(
                "INSERT INTO provider_accounts(id, provider, display_name, secret_ref, metadata_json, created_at, updated_at)
                 VALUES(?1, ?2, ?3, ?4, ?5, datetime('now'), datetime('now'))
                 ON CONFLICT(id) DO UPDATE SET
                   provider=excluded.provider,
                   display_name=excluded.display_name,
                   secret_ref=excluded.secret_ref,
                   metadata_json=excluded.metadata_json,
                   updated_at=datetime('now')",
                params![
                    account.id,
                    account.provider,
                    account.display_name,
                    account.secret_ref,
                    account.metadata_json
                ],
            )
            .context("Failed upserting provider account")?;
            Ok(())
        })
    }

    pub fn upsert_agent_provider(&self, provider: &AgentProviderRecord) -> Result<()> {
        validate_json_no_secrets("agent_providers.config_json", &provider.config_json)?;
        self.with_transaction(|tx| {
            tx.execute(
                "INSERT INTO agent_providers(id, provider_type, config_json, is_enabled, created_at, updated_at)
                 VALUES(?1, ?2, ?3, ?4, datetime('now'), datetime('now'))
                 ON CONFLICT(id) DO UPDATE SET
                   provider_type=excluded.provider_type,
                   config_json=excluded.config_json,
                   is_enabled=excluded.is_enabled,
                   updated_at=datetime('now')",
                params![
                    provider.id,
                    provider.provider_type,
                    provider.config_json,
                    if provider.is_enabled { 1 } else { 0 }
                ],
            )
            .context("Failed upserting agent provider")?;
            Ok(())
        })
    }

    pub fn upsert_runtime_status(&self, status: &RuntimeStatusRecord) -> Result<()> {
        self.with_transaction(|tx| {
            tx.execute(
                "INSERT INTO runtime_status(id, state, source, details_json, updated_at)
                 VALUES(1, ?1, ?2, ?3, datetime('now'))
                 ON CONFLICT(id) DO UPDATE SET
                   state=excluded.state,
                   source=excluded.source,
                   details_json=excluded.details_json,
                   updated_at=datetime('now')",
                params![status.state, status.source, status.details_json],
            )
            .context("Failed upserting runtime status")?;
            Ok(())
        })
    }

    pub fn upsert_sync_job(&self, job: &SyncJobRecord) -> Result<()> {
        validate_json_no_secrets("sync_jobs.payload_json", &job.payload_json)?;

        if let Some(error_text) = &job.error_text {
            validate_plaintext_no_secrets("sync_jobs.error_text", error_text)?;
        }

        self.with_transaction(|tx| {
            tx.execute(
                "INSERT INTO sync_jobs(id, job_type, status, correlation_id, retry_count, payload_json, error_text, created_at, updated_at)
                 VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'), datetime('now'))
                 ON CONFLICT(id) DO UPDATE SET
                   job_type=excluded.job_type,
                   status=excluded.status,
                   correlation_id=excluded.correlation_id,
                   retry_count=excluded.retry_count,
                   payload_json=excluded.payload_json,
                   error_text=excluded.error_text,
                   updated_at=datetime('now')",
                params![
                    job.id,
                    job.job_type,
                    job.status,
                    job.correlation_id,
                    job.retry_count,
                    job.payload_json,
                    job.error_text
                ],
            )
            .context("Failed upserting sync job")?;
            Ok(())
        })
    }

    pub fn create_sync_job(
        &self,
        job_type: &str,
        correlation_id: &str,
        payload_json: &str,
    ) -> Result<SyncJobRecord> {
        validate_json_no_secrets("sync_jobs.payload_json", payload_json)?;

        let job_id = format!(
            "sync-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        );

        let job = SyncJobRecord {
            id: job_id,
            job_type: job_type.to_string(),
            status: SyncJobStatus::Pending.as_str().to_string(),
            correlation_id: correlation_id.to_string(),
            retry_count: 0,
            payload_json: payload_json.to_string(),
            error_text: None,
        };

        self.upsert_sync_job(&job)?;
        Ok(job)
    }

    pub fn mark_sync_job_running(&self, job_id: &str) -> Result<()> {
        self.update_sync_job_status(job_id, SyncJobStatus::Running, None)
    }

    pub fn mark_sync_job_succeeded(&self, job_id: &str) -> Result<()> {
        self.update_sync_job_status(job_id, SyncJobStatus::Succeeded, None)
    }

    pub fn mark_sync_job_failed(&self, job_id: &str, error_text: &str) -> Result<()> {
        validate_plaintext_no_secrets("sync_jobs.error_text", error_text)?;
        self.update_sync_job_status(job_id, SyncJobStatus::Failed, Some(error_text))
    }

    pub fn increment_sync_job_retry(&self, job_id: &str, error_text: &str) -> Result<i64> {
        validate_plaintext_no_secrets("sync_jobs.error_text", error_text)?;

        self.with_transaction(|tx| {
            tx.execute(
                "UPDATE sync_jobs
                 SET status = ?2,
                     retry_count = retry_count + 1,
                     error_text = ?3,
                     updated_at = datetime('now')
                 WHERE id = ?1",
                params![
                    job_id,
                    SyncJobStatus::Failed.as_str(),
                    Some(error_text.to_string())
                ],
            )
            .context("Failed incrementing sync job retry count")?;

            let retry_count = tx
                .query_row(
                    "SELECT retry_count FROM sync_jobs WHERE id = ?1",
                    params![job_id],
                    |row| row.get::<_, i64>(0),
                )
                .context("Failed reading sync job retry count")?;

            Ok(retry_count)
        })
    }

    pub fn list_sync_jobs_by_status(&self, status: SyncJobStatus, limit: i64) -> Result<Vec<SyncJobRecord>> {
        let _guard = self.lock.lock().expect("persistence mutex poisoned");
        let conn = self
            .db
            .open_connection()
            .context("Failed opening SQLite connection for sync job listing")?;

        let mut stmt = conn
            .prepare(
                "SELECT id, job_type, status, correlation_id, retry_count, payload_json, error_text
                 FROM sync_jobs
                 WHERE status = ?1
                 ORDER BY updated_at ASC
                 LIMIT ?2",
            )
            .context("Failed preparing sync job listing query")?;

        let rows = stmt
            .query_map(params![status.as_str(), limit], |row| {
                Ok(SyncJobRecord {
                    id: row.get(0)?,
                    job_type: row.get(1)?,
                    status: row.get(2)?,
                    correlation_id: row.get(3)?,
                    retry_count: row.get(4)?,
                    payload_json: row.get(5)?,
                    error_text: row.get(6)?,
                })
            })
            .context("Failed querying sync jobs by status")?;

        let jobs: Result<Vec<_>, _> = rows.collect();
        jobs.context("Failed collecting sync jobs by status")
    }

    pub fn run_sync_retry_worker<F>(
        &self,
        limit: i64,
        mut process_job: F,
    ) -> Result<SyncRetryWorkerResult>
    where
        F: FnMut(&SyncJobRecord) -> Result<()>,
    {
        let failed_jobs = self
            .list_sync_jobs_by_status(SyncJobStatus::Failed, limit)
            .context("Failed loading failed sync jobs for retry worker")?;

        let mut result = SyncRetryWorkerResult {
            scanned_jobs: failed_jobs.len(),
            ..SyncRetryWorkerResult::default()
        };

        for job in failed_jobs {
            if job.retry_count >= MAX_SYNC_RETRIES {
                continue;
            }

            let backoff = retry_backoff_duration(job.retry_count + 1)
                .ok_or_else(|| anyhow::anyhow!("Unsupported retry backoff for retry_count={}", job.retry_count + 1))?;

            thread::sleep(backoff);

            self.mark_sync_job_running(&job.id)
                .with_context(|| format!("Failed marking sync job '{}' as running", job.id))?;

            match process_job(&job) {
                Ok(()) => {
                    self.mark_sync_job_succeeded(&job.id)
                        .with_context(|| format!("Failed marking sync job '{}' as succeeded", job.id))?;
                    result.succeeded_jobs += 1;
                    result.retried_jobs += 1;
                }
                Err(err) => {
                    let retry_count = self
                        .increment_sync_job_retry(&job.id, &err.to_string())
                        .with_context(|| format!("Failed incrementing retry for sync job '{}'", job.id))?;

                    if retry_count >= MAX_SYNC_RETRIES {
                        self.mark_sync_job_failed(
                            &job.id,
                            &format!(
                                "retry budget exhausted ({} attempts): {}",
                                MAX_SYNC_RETRIES, err
                            ),
                        )
                        .with_context(|| {
                            format!("Failed marking sync job '{}' as terminal failed", job.id)
                        })?;
                    }

                    result.failed_jobs += 1;
                    result.retried_jobs += 1;
                }
            }
        }

        Ok(result)
    }

    pub fn reconcile_slim_projection_from_sqlite(&self) -> Result<ProjectionSyncResult> {
        let _guard = self.lock.lock().expect("persistence mutex poisoned");
        let conn = self
            .db
            .open_connection()
            .context("Failed opening SQLite connection for slim projection reconciliation")?;

        let mut stmt = conn
            .prepare(
                "SELECT id, name, payload_json, is_active
                 FROM presets
                 ORDER BY name ASC",
            )
            .context("Failed preparing presets query for slim projection")?;

        let rows = stmt
            .query_map([], |row| {
                Ok(PresetRecord {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    payload_json: row.get(2)?,
                    is_active: row.get::<_, i64>(3)? != 0,
                })
            })
            .context("Failed querying presets for slim projection")?;

        let preset_rows: Result<Vec<_>, _> = rows.collect();
        let preset_rows = preset_rows.context("Failed collecting preset rows for projection")?;

        let mut projected_presets: HashMap<String, HashMap<String, AgentConfig>> = HashMap::new();
        let mut active_preset = String::new();

        for row in &preset_rows {
            let (name, active, agents) = parse_preset_payload(row)
                .with_context(|| format!("Failed parsing preset payload for '{}'", row.name))?;

            if active || row.is_active {
                active_preset = name.clone();
            }

            projected_presets.insert(name, agents);
        }

        if active_preset.is_empty() {
            active_preset = preset_rows
                .first()
                .map(|p| p.name.clone())
                .unwrap_or_default();
        }

        let slim = SlimConfig {
            schema: None,
            preset: active_preset.clone(),
            presets: projected_presets,
            extra: HashMap::new(),
        };

        config::write_slim_config(&slim)
            .context("Failed writing reconciled oh-my-opencode-slim projection")?;

        conn.execute(
            "INSERT INTO operation_log(operation_type, payload_json, created_at)
             VALUES('projection_sync_slim', json_object('presets_written', ?1, 'active_preset', ?2), datetime('now'))",
            params![slim.presets.len() as i64, slim.preset],
        )
        .context("Failed writing projection sync operation log")?;

        Ok(ProjectionSyncResult {
            presets_written: slim.presets.len(),
            active_preset,
        })
    }

    pub fn detect_slim_projection_drift(&self) -> Result<ProjectionDriftReport> {
        let _guard = self.lock.lock().expect("persistence mutex poisoned");

        let desired = self
            .build_slim_projection_from_sqlite()
            .context("Failed building desired slim projection from SQLite")?;

        let desired_json = serde_json::to_string(&desired)
            .context("Failed serializing desired slim projection")?;

        let actual = config::read_slim_config().context("Failed reading current slim projection")?;
        let actual_json = serde_json::to_string(&actual)
            .context("Failed serializing current slim projection")?;

        if desired_json == actual_json {
            self.record_projection_conflict_state(false, "none", "slim projection in sync")?;
            return Ok(ProjectionDriftReport {
                has_drift: false,
                conflict_type: None,
                detail: "Projection is in sync with SQLite desired state".to_string(),
            });
        }

        let conflict_type = if desired.preset != actual.preset {
            "active_preset_conflict"
        } else {
            "preset_payload_drift"
        };

        let detail = format!(
            "Detected drift: desired_active='{}', actual_active='{}', desired_preset_count={}, actual_preset_count={}",
            desired.preset,
            actual.preset,
            desired.presets.len(),
            actual.presets.len()
        );

        self.record_projection_conflict_state(true, conflict_type, &detail)?;

        Ok(ProjectionDriftReport {
            has_drift: true,
            conflict_type: Some(conflict_type.to_string()),
            detail,
        })
    }

    fn update_sync_job_status(
        &self,
        job_id: &str,
        status: SyncJobStatus,
        error_text: Option<&str>,
    ) -> Result<()> {
        self.with_transaction(|tx| {
            tx.execute(
                "UPDATE sync_jobs
                 SET status = ?2,
                     error_text = ?3,
                     updated_at = datetime('now')
                 WHERE id = ?1",
                params![job_id, status.as_str(), error_text],
            )
            .context("Failed updating sync job status")?;
            Ok(())
        })
    }

    pub fn update_routing_state(&self, key: &str, value: &str) -> Result<()> {
        self.with_transaction(|tx| {
            tx.execute(
                "INSERT INTO routing_state(route_key, route_value, updated_at) VALUES(?1, ?2, datetime('now'))
                 ON CONFLICT(route_key) DO UPDATE SET route_value=excluded.route_value, updated_at=datetime('now')",
                params![key, value],
            )
            .context("Failed upserting routing state")?;
            Ok(())
        })
    }

    pub fn get_latest_schema_version(&self) -> Result<i64> {
        let _guard = self.lock.lock().expect("persistence mutex poisoned");
        let conn = self
            .db
            .open_connection()
            .context("Failed opening SQLite connection for schema version query")?;

        let version = conn
            .query_row("SELECT MAX(version) FROM schema_version", [], |row| {
                row.get::<_, Option<i64>>(0)
            })
            .optional()
            .context("Failed querying schema version")?
            .flatten()
            .unwrap_or(0);

        Ok(version)
    }

    pub fn bootstrap_from_legacy_files_if_needed(&self) -> Result<bool> {
        let _guard = self.lock.lock().expect("persistence mutex poisoned");
        let mut conn = self
            .db
            .open_connection()
            .context("Failed opening SQLite connection for bootstrap import")?;

        let existing_presets = conn
            .query_row("SELECT COUNT(1) FROM presets", [], |row| row.get::<_, i64>(0))
            .context("Failed counting presets before bootstrap import")?;

        if existing_presets > 0 {
            return Ok(false);
        }

        let legacy_presets = config::get_presets().context("Failed reading legacy presets for bootstrap import")?;

        let tx = conn
            .transaction()
            .context("Failed opening SQL transaction for bootstrap import")?;

        let imported_count = legacy_presets.len() as i64;

        for preset in legacy_presets {
            let payload_json = serde_json::to_string(&preset)
                .context("Failed serializing legacy preset for bootstrap import")?;
            validate_json_no_secrets("bootstrap.presets.payload_json", &payload_json)?;
            let preset_id = preset.name.clone();

            tx.execute(
                "INSERT INTO presets(id, name, payload_json, is_active, created_at, updated_at)
                 VALUES(?1, ?2, ?3, ?4, datetime('now'), datetime('now'))
                 ON CONFLICT(id) DO UPDATE SET
                   name=excluded.name,
                   payload_json=excluded.payload_json,
                   is_active=excluded.is_active,
                   updated_at=datetime('now')",
                params![
                    preset_id,
                    preset.name,
                    payload_json,
                    if preset.active { 1 } else { 0 }
                ],
            )
            .context("Failed importing legacy preset into SQLite")?;
        }

        tx.execute(
            "INSERT INTO routing_state(route_key, route_value, updated_at) VALUES('bootstrap_source', 'legacy_file', datetime('now'))
             ON CONFLICT(route_key) DO UPDATE SET route_value=excluded.route_value, updated_at=datetime('now')",
            [],
        )
        .context("Failed writing bootstrap source marker")?;

        tx.execute(
            "INSERT INTO operation_log(operation_type, payload_json, created_at)
             VALUES('bootstrap_import', json_object('source', 'legacy_file', 'imported_presets', ?1), datetime('now'))",
            params![imported_count],
        )
        .context("Failed writing bootstrap import operation log")?;

        tx.commit()
            .context("Failed committing bootstrap import transaction")?;

        Ok(true)
    }

    fn with_transaction<T, F>(&self, operation: F) -> Result<T>
    where
        F: FnOnce(&Transaction<'_>) -> Result<T>,
    {
        let _guard = self.lock.lock().expect("persistence mutex poisoned");
        let mut conn = self
            .db
            .open_connection()
            .context("Failed opening SQLite connection for repository operation")?;

        let tx = conn
            .transaction()
            .context("Failed opening SQL transaction for repository operation")?;

        let result = operation(&tx)?;
        tx.commit()
            .context("Failed committing SQL transaction for repository operation")?;
        Ok(result)
    }

    fn build_slim_projection_from_sqlite(&self) -> Result<SlimConfig> {
        let conn = self
            .db
            .open_connection()
            .context("Failed opening SQLite connection for slim projection build")?;

        let mut stmt = conn
            .prepare(
                "SELECT id, name, payload_json, is_active
                 FROM presets
                 ORDER BY name ASC",
            )
            .context("Failed preparing presets query for slim projection build")?;

        let rows = stmt
            .query_map([], |row| {
                Ok(PresetRecord {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    payload_json: row.get(2)?,
                    is_active: row.get::<_, i64>(3)? != 0,
                })
            })
            .context("Failed querying presets for slim projection build")?;

        let preset_rows: Result<Vec<_>, _> = rows.collect();
        let preset_rows = preset_rows.context("Failed collecting preset rows for projection build")?;

        let mut projected_presets: HashMap<String, HashMap<String, AgentConfig>> = HashMap::new();
        let mut active_preset = String::new();

        for row in &preset_rows {
            let (name, active, agents) = parse_preset_payload(row)
                .with_context(|| format!("Failed parsing preset payload for '{}'", row.name))?;

            if active || row.is_active {
                active_preset = name.clone();
            }

            projected_presets.insert(name, agents);
        }

        if active_preset.is_empty() {
            active_preset = preset_rows
                .first()
                .map(|p| p.name.clone())
                .unwrap_or_default();
        }

        Ok(SlimConfig {
            schema: None,
            preset: active_preset,
            presets: projected_presets,
            extra: HashMap::new(),
        })
    }

    fn record_projection_conflict_state(
        &self,
        has_conflict: bool,
        conflict_type: &str,
        detail: &str,
    ) -> Result<()> {
        self.with_transaction(|tx| {
            tx.execute(
                "INSERT INTO routing_state(route_key, route_value, updated_at)
                 VALUES('projection_conflict_state', ?1, datetime('now'))
                 ON CONFLICT(route_key) DO UPDATE SET route_value=excluded.route_value, updated_at=datetime('now')",
                params![if has_conflict { "conflict" } else { "in_sync" }],
            )
            .context("Failed writing projection conflict state marker")?;

            tx.execute(
                "INSERT INTO operation_log(operation_type, payload_json, created_at)
                 VALUES('projection_drift_check', json_object('has_conflict', ?1, 'conflict_type', ?2, 'detail', ?3), datetime('now'))",
                params![if has_conflict { 1 } else { 0 }, conflict_type, detail],
            )
            .context("Failed writing projection drift check operation log")?;

            Ok(())
        })
    }
}

fn default_backup_root() -> Result<PathBuf> {
    let home = dirs::home_dir().context("Failed to resolve home directory for backup root")?;
    Ok(home.join(".config").join("aether").join("backups"))
}

fn slim_config_backup_source() -> Result<PathBuf> {
    let home = dirs::home_dir().context("Failed to resolve home directory for slim config backup")?;
    Ok(home
        .join(".config")
        .join("opencode")
        .join("oh-my-opencode-slim.json"))
}

fn enforce_backup_retention(backup_root: &Path, keep: usize) -> Result<usize> {
    let mut dirs: Vec<(std::time::SystemTime, PathBuf)> = fs::read_dir(backup_root)
        .with_context(|| format!("Failed reading backup root {}", backup_root.display()))?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            if !path.is_dir() {
                return None;
            }
            let modified = entry.metadata().ok()?.modified().ok()?;
            Some((modified, path))
        })
        .collect();

    dirs.sort_by(|a, b| b.0.cmp(&a.0));

    if dirs.len() > keep {
        for (_, path) in dirs.iter().skip(keep) {
            fs::remove_dir_all(path)
                .with_context(|| format!("Failed removing old backup set {}", path.display()))?;
        }
    }

    Ok(dirs.len().min(keep))
}

fn latest_backup_dir(backup_root: &Path) -> Result<PathBuf> {
    let mut dirs: Vec<(std::time::SystemTime, PathBuf)> = fs::read_dir(backup_root)
        .with_context(|| format!("Failed reading backup root {}", backup_root.display()))?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            if !path.is_dir() {
                return None;
            }
            let modified = entry.metadata().ok()?.modified().ok()?;
            Some((modified, path))
        })
        .collect();

    dirs.sort_by_key(|(modified, _)| Reverse(*modified));
    dirs.into_iter()
        .next()
        .map(|(_, path)| path)
        .ok_or_else(|| anyhow::anyhow!("No backup checkpoint found at {}", backup_root.display()))
}

fn file_checksum_hex(path: &Path) -> Result<String> {
    let bytes = fs::read(path).with_context(|| format!("Failed reading {}", path.display()))?;
    let digest = Sha256::digest(bytes);
    Ok(format!("{:x}", digest))
}

fn parse_preset_payload(
    row: &PresetRecord,
) -> Result<(String, bool, HashMap<String, AgentConfig>)> {
    if let Ok(info) = serde_json::from_str::<PresetInfo>(&row.payload_json) {
        return Ok((info.name, info.active, info.agents));
    }

    if let Ok(agents) = serde_json::from_str::<HashMap<String, AgentConfig>>(&row.payload_json) {
        return Ok((row.name.clone(), row.is_active, agents));
    }

    anyhow::bail!("Unsupported preset payload format")
}

fn retry_backoff_duration(attempt: i64) -> Option<Duration> {
    match attempt {
        1 => Some(Duration::from_secs(1)),
        2 => Some(Duration::from_secs(2)),
        3 => Some(Duration::from_secs(4)),
        _ => None,
    }
}

impl PersistencePort for SqlitePersistenceAdapter {
    fn execute(&self, tx: PersistenceTransaction) -> Result<()> {
        validate_operation_payload(&tx)?;

        let _guard = self.lock.lock().expect("persistence mutex poisoned");

        let mut conn = self
            .db
            .open_connection()
            .context("Failed opening SQLite connection for persistence transaction")?;

        let sql_tx = conn
            .transaction()
            .context("Failed opening SQL transaction")?;

        let payload_json = serde_json::to_string(&tx.payload)
            .context("Failed serializing persistence transaction payload")?;

        sql_tx
            .execute(
                "INSERT INTO operation_log(operation_type, payload_json, created_at) VALUES(?1, ?2, datetime('now'))",
                params![tx.operation, payload_json],
            )
            .context("Failed writing operation_log entry")?;

        sql_tx
            .execute(
                "INSERT INTO routing_state(route_key, route_value, updated_at) VALUES('last_operation', ?1, datetime('now'))
                 ON CONFLICT(route_key) DO UPDATE SET route_value=excluded.route_value, updated_at=datetime('now')",
                params![tx.operation],
            )
            .context("Failed updating routing_state checkpoint")?;

        sql_tx
            .commit()
            .context("Failed committing persistence transaction")?;

        Ok(())
    }
}

impl Default for SqlitePersistenceAdapter {
    fn default() -> Self {
        let path = SqliteDatabase::default_path().unwrap_or_else(|_| {
            let fallback = dirs::home_dir()
                .unwrap_or_default()
                .join(".config")
                .join("aether")
                .join("aether-v2.db");
            fallback
        });
        Self::new(SqliteDatabase::new(path))
    }
}

pub fn tx_payload_from_pairs(pairs: &[(&str, &str)]) -> HashMap<String, String> {
    pairs
        .iter()
        .map(|(k, v)| ((*k).to_string(), (*v).to_string()))
        .collect()
}

fn validate_operation_payload(tx: &PersistenceTransaction) -> Result<()> {
    if looks_like_secret_key(&tx.operation) {
        anyhow::bail!(
            "operation name '{}' is not allowed because it appears secret-related",
            tx.operation
        );
    }

    for (key, value) in &tx.payload {
        if looks_like_secret_key(key) {
            anyhow::bail!(
                "payload key '{}' in operation '{}' appears secret-related and cannot be persisted",
                key,
                tx.operation
            );
        }
        validate_plaintext_no_secrets(&format!("operation.payload.{}", key), value)?;
    }

    Ok(())
}

fn validate_json_no_secrets(field_name: &str, json_str: &str) -> Result<()> {
    let value: Value = serde_json::from_str(json_str)
        .with_context(|| format!("Failed parsing {} as JSON during secret validation", field_name))?;
    walk_json_for_secrets(field_name, &value)
}

fn walk_json_for_secrets(path: &str, value: &Value) -> Result<()> {
    match value {
        Value::Object(map) => {
            for (k, v) in map {
                if looks_like_secret_key(k) {
                    anyhow::bail!(
                        "Field '{}' contains secret-like key '{}' and cannot be persisted to SQLite",
                        path,
                        k
                    );
                }
                walk_json_for_secrets(&format!("{}.{}", path, k), v)?;
            }
        }
        Value::Array(items) => {
            for (idx, item) in items.iter().enumerate() {
                walk_json_for_secrets(&format!("{}[{}]", path, idx), item)?;
            }
        }
        Value::String(s) => {
            validate_plaintext_no_secrets(path, s)?;
        }
        _ => {}
    }

    Ok(())
}

fn validate_plaintext_no_secrets(path: &str, value: &str) -> Result<()> {
    if looks_like_secret_literal(value) {
        anyhow::bail!(
            "Field '{}' appears to contain raw secret material; persist only references",
            path
        );
    }
    Ok(())
}

fn looks_like_secret_key(key: &str) -> bool {
    let normalized = key.to_ascii_lowercase().replace(['-', '_'], "");
    [
        "apikey",
        "secret",
        "token",
        "password",
        "authorization",
        "bearer",
        "credential",
    ]
    .iter()
    .any(|needle| normalized.contains(needle))
}

fn looks_like_secret_literal(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return false;
    }

    let lowered = trimmed.to_ascii_lowercase();
    let common_prefixes = ["sk-", "rk-", "pk_", "ghp_", "xoxb-", "xoxp-", "bearer "];
    if common_prefixes.iter().any(|prefix| lowered.starts_with(prefix)) {
        return true;
    }

    trimmed.len() >= 24
        && trimmed.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::AgentConfig;
    use serde_json::json;

    fn make_adapter() -> (tempfile::TempDir, SqlitePersistenceAdapter) {
        let tmp = tempfile::tempdir().expect("tempdir");
        let db = SqliteDatabase::new(tmp.path().join("aether-v2-test.db"));
        let adapter = SqlitePersistenceAdapter::new(db);
        adapter.initialize().expect("initialize adapter");
        (tmp, adapter)
    }

    fn sample_agent(model: &str) -> AgentConfig {
        AgentConfig {
            model: model.to_string(),
            variant: None,
            skills: vec![],
            mcps: vec![],
            extra: HashMap::new(),
        }
    }

    #[test]
    fn sync_retry_worker_transitions_failed_job_to_succeeded() {
        let (_tmp, adapter) = make_adapter();

        let payload = json!({"type": "mcp-sync", "scope": "all"}).to_string();
        let job = adapter
            .create_sync_job("artifact-sync", "corr-1", &payload)
            .expect("create sync job");
        adapter
            .mark_sync_job_failed(&job.id, "transient network timeout")
            .expect("mark failed");

        let result = adapter
            .run_sync_retry_worker(10, |_job| Ok(()))
            .expect("run retry worker");

        assert_eq!(result.scanned_jobs, 1);
        assert_eq!(result.retried_jobs, 1);
        assert_eq!(result.succeeded_jobs, 1);
        assert_eq!(result.failed_jobs, 0);

        let succeeded = adapter
            .list_sync_jobs_by_status(SyncJobStatus::Succeeded, 10)
            .expect("list succeeded jobs");
        assert!(succeeded.iter().any(|j| j.id == job.id));
    }

    #[test]
    fn retry_backoff_duration_matches_spec_budget() {
        assert_eq!(retry_backoff_duration(1), Some(Duration::from_secs(1)));
        assert_eq!(retry_backoff_duration(2), Some(Duration::from_secs(2)));
        assert_eq!(retry_backoff_duration(3), Some(Duration::from_secs(4)));
        assert_eq!(retry_backoff_duration(4), None);
    }

    #[test]
    fn slim_projection_build_is_consistent_with_active_preset() {
        let (_tmp, adapter) = make_adapter();

        let mut alpha_agents = HashMap::new();
        alpha_agents.insert("opencode".to_string(), sample_agent("openai/gpt-4.1"));
        let alpha_payload = serde_json::to_string(&PresetInfo {
            name: "alpha".to_string(),
            active: false,
            agents: alpha_agents,
        })
        .expect("serialize alpha payload");

        let mut beta_agents = HashMap::new();
        beta_agents.insert("codex".to_string(), sample_agent("openai/o3"));
        let beta_payload = serde_json::to_string(&PresetInfo {
            name: "beta".to_string(),
            active: true,
            agents: beta_agents,
        })
        .expect("serialize beta payload");

        adapter
            .upsert_preset(&PresetRecord {
                id: "preset-alpha".to_string(),
                name: "alpha".to_string(),
                payload_json: alpha_payload,
                is_active: false,
            })
            .expect("upsert alpha");

        adapter
            .upsert_preset(&PresetRecord {
                id: "preset-beta".to_string(),
                name: "beta".to_string(),
                payload_json: beta_payload,
                is_active: true,
            })
            .expect("upsert beta");

        let projection = adapter
            .build_slim_projection_from_sqlite()
            .expect("build projection");

        assert_eq!(projection.preset, "beta");
        assert_eq!(projection.presets.len(), 2);
        assert_eq!(
            projection
                .presets
                .get("beta")
                .and_then(|agents| agents.get("codex"))
                .map(|cfg| cfg.model.as_str()),
            Some("openai/o3")
        );
    }
}
