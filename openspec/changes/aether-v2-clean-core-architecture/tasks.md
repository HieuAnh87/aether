## 1. Architecture Foundation

- [x] 1.1 Define v2 module boundaries (commands adapters, application services, domain policies, infra adapters) and scaffold package structure in `src-tauri/src`
- [x] 1.2 Introduce core service interfaces/ports for persistence, secrets, projection writer, sidecar management, and event publishing
- [x] 1.3 Add architecture guardrails (module conventions + lint/review checklist) to keep command handlers thin

## 2. SQLite SSOT and Migration Engine

- [x] 2.1 Design SQLite schema for presets, provider account metadata, agent providers, routing state, runtime status, and sync jobs
- [x] 2.2 Implement schema version table and deterministic startup migration runner
- [x] 2.3 Implement repository layer with transactional write APIs for core aggregates
- [x] 2.4 Add bootstrap importer to seed DB from existing file-based config on first v2 run

## 3. Secrets and Security Boundaries

- [x] 3.1 Refactor account credential flows to store secrets only in keychain and keep DB references/metadata only
- [x] 3.2 Add validation checks preventing accidental secret persistence into SQLite or projection files

## 4. Artifact Sync Pipeline

- [x] 4.1 Implement persisted sync job model (pending/running/succeeded/failed, retries, error details, correlation id)
- [x] 4.2 Implement MCP/prompts/skills desired-state reconciliation from SQLite to projection outputs
- [x] 4.3 Add drift/conflict detection for externally modified artifact files and surface conflict states
- [x] 4.4 Add retry worker for transient sync failures with bounded backoff policy

## 5. Proxy Runtime Resilience

- [x] 5.1 Implement proxy runtime state machine (stopped/starting/running/degraded/stopping/crashed) with validated transitions
- [x] 5.2 Refactor sidecar lifecycle orchestration into application service integrated with state persistence
- [x] 5.3 Implement startup retry/failover policy with compatibility-aware route selection
- [x] 5.4 Emit runtime lifecycle events for frontend/store consumption and diagnostics

## 6. Safe Persistence, Backups, and Rollback

- [x] 6.1 Standardize atomic temp-file-and-rename projection writer for all non-secret outputs
- [x] 6.2 Implement migration-session backup creation and retention policy for rollback safety
- [x] 6.3 Implement rollback command/service that restores latest known-good checkpoint on migration failure

## 7. Command/API Transition

- [x] 7.1 Migrate preset/account/provider commands from direct file mutation to service-layer transactional flows
- [x] 7.2 Add compatibility response mapping to minimize frontend breakage during staged rollout
- [x] 7.3 Update frontend stores to consume v2 command semantics and runtime events
- [x] 7.4 Remove legacy direct-write runtime paths and enforce structured v2 response envelope for mutating commands
- [x] 7.5 Publish command migration mapping docs for removed/renamed behaviors

## 8. Validation, Rollout, and Cutover

- [x] 8.1 Add integration tests for migration success/failure, sync idempotency, and runtime crash/retry transitions
- [x] 8.2 Add end-to-end tests for preset activation and projection outputs consistency
- [x] 8.3 Run one-time migration validation on representative user states and verify cutover readiness gates
- [x] 8.4 Release v2 as the only runtime mode after migration and verification criteria pass
