## Context

Aether is a macOS desktop AI proxy manager using Tauri v2 (Rust backend), SolidJS frontend stores, and a Go sidecar proxy. Current behavior relies on mixed persistence paths: JSON/file mutations for user-facing config plus service-level runtime synchronization. This has enabled rapid iteration but creates coupling between command handlers, persistence details, and runtime orchestration.

The rewrite direction is intentionally willing to restructure architecture in exchange for a cleaner long-term core. Core constraints:
- Must preserve user trust and data safety (no secret leakage, recoverable updates).
- Must retain compatibility with external file-based consumers (OpenCode config artifacts).
- Must execute a one-time migration and cut over directly to v2 as the only runtime mode.

## Goals / Non-Goals

**Goals:**
- Establish SQLite as SSOT for non-secret domain/runtime state.
- Enforce layered boundaries: command adapters, application services, domain logic, infrastructure adapters.
- Define deterministic sync pipelines for MCP/prompts/skills and sidecar config projection.
- Add explicit proxy runtime state management with health/retry/failover semantics.
- Provide migration-safe rollout with backups, schema migrations, and rollback strategy.

**Non-Goals:**
- Rewriting the Go sidecar internals in this change.
- Rebuilding every existing UI screen before backend stabilization.
- Storing API keys/secrets in SQLite (keychain remains source for secrets).
- Solving cross-device/cloud sync in this phase.
- Operating legacy v1 and v2 runtime modes in parallel beyond migration.

## Decisions

1. **SQLite for non-secret core state**
   - Decision: Use SQLite for presets, provider/account metadata, active routing, sync jobs, runtime status snapshots, and operation logs.
   - Rationale: transactional integrity, queryability, migration support, better consistency than scattered file writes.
   - Alternative considered: continue file-first JSON + caches. Rejected due to weak consistency and difficult evolution.

2. **Layered backend architecture**
   - Decision: Route Tauri commands through application services; isolate domain rules from IO concerns.
   - Rationale: improves testability, makes policy changes (switching, failover, sync) independent of transport.
   - Alternative considered: keep command-centric orchestration. Rejected due to continued coupling.

3. **Projection model for file compatibility**
   - Decision: Generate/refresh OpenCode-facing files and sidecar config as projections from DB state using atomic writes.
   - Rationale: preserves ecosystem compatibility while centralizing truth.
   - Alternative considered: dual-write (DB + direct mutation) in all flows. Rejected due to drift risk.

4. **Job-based sync pipelines**
   - Decision: Represent sync work (MCP/prompts/skills, proxy publication) as queued/idempotent jobs with status tracking.
   - Rationale: supports retries, observability, and predictable failure handling.
   - Alternative considered: immediate inline sync only. Rejected because failures become user-blocking and opaque.

5. **Secrets isolation**
   - Decision: Keep credentials in keychain/secrets adapter; DB stores references and metadata only.
   - Rationale: security posture and platform-native secret handling.
   - Alternative considered: encrypted blob in SQLite. Deferred to future if requirements change.

## Risks / Trade-offs

- **[Migration complexity]** Existing users have mixed file states and runtime assumptions → **Mitigation:** staged migrator, integrity checks, automatic backup before first conversion.
- **[Behavior drift during transition]** Legacy commands and new services may diverge → **Mitigation:** compatibility facade and golden-path integration tests.
- **[Operational overhead]** Added DB/job infrastructure increases moving parts → **Mitigation:** minimal schema v1, narrow job taxonomy, strict observability.
- **[Performance regressions]** Extra projection/sync steps may add latency → **Mitigation:** batched updates, debounce writes, profile critical command paths.

## Migration Plan

1. Introduce schema + repositories + migration engine and run preflight validation.
2. Execute one-time bootstrap migration from existing file-based config into SQLite.
3. Cut all write paths to DB transactions, then emit file projections atomically.
4. Activate job workers for artifact sync and proxy publication.
5. Complete command-handler migration to application services and remove legacy direct-write paths.
6. Release with v2 as the only runtime mode after migration and verification gates pass.

Rollback strategy:
- Keep timestamped backups of legacy files and DB snapshots during migration.
- If critical failures occur during rollout, restore latest known-good backup set and ship forward-fix before re-attempting cutover.

## Open Questions

- What minimum event/history retention window is required for local observability?
- Which command/API signatures require a short deprecation window versus immediate replacement?
- Should proxy health checks be passive-only initially or include active probes?
- What is the acceptable maximum delay for projection writes after a DB state change?
