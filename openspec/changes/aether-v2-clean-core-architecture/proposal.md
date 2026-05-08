## Why

Aether currently mixes configuration persistence, provider/account domain logic, proxy orchestration, and UI-facing command handlers across file-backed JSON and ad-hoc synchronization paths. This makes large feature work (multi-provider switching, robust sync, failover behavior, and safe migrations) slower and riskier than necessary.

## What Changes

- Introduce a new clean core architecture with SQLite as the system of record for runtime/domain state, while keeping secrets in OS keychain.
- Reorganize backend into explicit domain/application/infrastructure layers, separating command handlers from business logic.
- Add deterministic sync pipelines for OpenCode artifacts (MCP/prompts/skills) and sidecar proxy config generation.
- Introduce resilient proxy runtime orchestration with health state, retry/failover policy, and observable lifecycle events.
- Standardize atomic persistence, backups, and migration workflows for non-secret file outputs and compatibility exports.
- **BREAKING**: Existing direct file-based write paths and legacy command semantics are removed; v2 DB-backed workflows and projection/export flows become the default and only supported runtime.

## Capabilities

### New Capabilities
- `core-state-sqlite-ssot`: Define SQLite-backed source of truth for presets, provider accounts metadata, agent providers, routing state, and sync jobs.
- `domain-layered-backend`: Define layered backend boundaries (commands → application services → domain → infra adapters) and service contracts.
- `artifact-sync-pipeline`: Define managed, idempotent sync for MCP/prompts/skills with change detection, conflict handling, and projection writes.
- `proxy-runtime-resilience`: Define proxy orchestration state machine with health checks, retry/failover policy, and lifecycle event emission.
- `safe-persistence-and-migration`: Define atomic writes, backup rotation, schema/data migrations, and rollback-safe export/update flows.
- `command-api-compatibility`: Define v2 command contract envelope, removed legacy behavior handling, and migration guidance for breaking command changes.

### Modified Capabilities
- None.

## Impact

- Affected code: `src-tauri/src/{commands,config,proxy,watcher,secrets,keychain}` and multiple frontend stores under `src/stores`.
- Data model impact: new SQLite schema, migration framework, and projection/export layer for file compatibility.
- API/command impact: Tauri command contracts may shift from direct file mutation to DB-backed transactional operations.
- Runtime impact: sidecar config publishing and proxy lifecycle handling become policy-driven with explicit state.
