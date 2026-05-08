use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use rusqlite::{params, Connection, OptionalExtension};

const CURRENT_SCHEMA_VERSION: i64 = 1;

const MIGRATION_1: &str = r#"
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS presets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS provider_accounts (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    display_name TEXT NOT NULL,
    secret_ref TEXT,
    metadata_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_providers (
    id TEXT PRIMARY KEY,
    provider_type TEXT NOT NULL,
    config_json TEXT NOT NULL,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS routing_state (
    route_key TEXT PRIMARY KEY,
    route_value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS runtime_status (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    state TEXT NOT NULL,
    source TEXT NOT NULL,
    details_json TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sync_jobs (
    id TEXT PRIMARY KEY,
    job_type TEXT NOT NULL,
    status TEXT NOT NULL,
    correlation_id TEXT NOT NULL,
    retry_count INTEGER NOT NULL DEFAULT 0,
    payload_json TEXT NOT NULL,
    error_text TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS operation_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"#;

fn migration_plan() -> Vec<(i64, &'static str)> {
    vec![(1, MIGRATION_1)]
}

#[derive(Debug, Clone)]
pub struct SqliteDatabase {
    db_path: PathBuf,
}

impl SqliteDatabase {
    pub fn new<P: Into<PathBuf>>(db_path: P) -> Self {
        Self {
            db_path: db_path.into(),
        }
    }

    pub fn default_path() -> Result<PathBuf> {
        let base = dirs::home_dir()
            .context("Failed to resolve home directory for SQLite DB path")?
            .join(".config")
            .join("aether");
        Ok(base.join("aether-v2.db"))
    }

    pub fn ensure_initialized(&self) -> Result<()> {
        ensure_parent_dir(&self.db_path)?;

        let mut conn = Connection::open(&self.db_path)
            .with_context(|| format!("Failed to open SQLite DB at {}", self.db_path.display()))?;

        apply_migrations(&mut conn)?;
        Ok(())
    }

    pub fn open_connection(&self) -> Result<Connection> {
        let conn = Connection::open(&self.db_path)
            .with_context(|| format!("Failed to open SQLite DB at {}", self.db_path.display()))?;
        Ok(conn)
    }

    pub fn path(&self) -> &Path {
        &self.db_path
    }
}

fn ensure_parent_dir(path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("Failed to create DB directory {}", parent.display()))?;
    }
    Ok(())
}

fn apply_migrations(conn: &mut Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))",
        [],
    )
    .context("Failed creating schema_version table")?;

    let tx = conn.transaction().context("Failed opening migration transaction")?;

    let current_version = tx
        .query_row("SELECT MAX(version) FROM schema_version", [], |row| row.get::<_, Option<i64>>(0))
        .optional()
        .context("Failed reading schema version")?
        .flatten()
        .unwrap_or(0);

    for (version, sql) in migration_plan() {
        if version > current_version {
            tx.execute_batch(sql)
                .with_context(|| format!("Failed applying migration version {}", version))?;
            tx.execute(
                "INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES(?1, datetime('now'))",
                params![version],
            )
            .with_context(|| format!("Failed recording migration version {}", version))?;
        }
    }

    let latest = tx
        .query_row("SELECT MAX(version) FROM schema_version", [], |row| row.get::<_, Option<i64>>(0))
        .optional()
        .context("Failed validating final schema version")?
        .flatten()
        .unwrap_or(0);

    if latest != CURRENT_SCHEMA_VERSION {
        anyhow::bail!(
            "Schema version mismatch after migration. expected={}, got={}",
            CURRENT_SCHEMA_VERSION,
            latest
        );
    }

    tx.commit().context("Failed committing migration transaction")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ensure_initialized_applies_migration_and_sets_expected_version() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let db_path = tmp.path().join("aether-v2-test.db");
        let db = SqliteDatabase::new(&db_path);

        db.ensure_initialized().expect("initialize db");

        let conn = db.open_connection().expect("open connection");
        let version = conn
            .query_row("SELECT MAX(version) FROM schema_version", [], |row| {
                row.get::<_, Option<i64>>(0)
            })
            .expect("query schema version")
            .unwrap_or(0);

        assert_eq!(version, CURRENT_SCHEMA_VERSION);
    }

    #[test]
    fn ensure_initialized_fails_when_schema_version_is_ahead_of_supported() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let db_path = tmp.path().join("aether-v2-test.db");
        let db = SqliteDatabase::new(&db_path);

        db.ensure_initialized().expect("first init");

        let conn = db.open_connection().expect("open connection");
        conn.execute(
            "INSERT OR REPLACE INTO schema_version(version, applied_at) VALUES(?1, datetime('now'))",
            params![CURRENT_SCHEMA_VERSION + 10],
        )
        .expect("force schema version ahead");

        let err = db
            .ensure_initialized()
            .expect_err("should fail on schema mismatch");
        assert!(
            err.to_string().contains("Schema version mismatch"),
            "unexpected error: {err}"
        );
    }
}
