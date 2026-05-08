# Aether v2 Architecture Guardrails

This document defines enforceable conventions for the v2 backend layering introduced under `src-tauri/src/core`.

## Module Conventions

### Layer boundaries

- `commands/*` are **adapters only**.
  - Accept/validate Tauri input
  - Call application services
  - Map output to command response envelope
  - MUST NOT contain business policy, persistence logic, or direct file mutation logic.
- `core/application/*` orchestrates use-cases.
  - Coordinates domain policies and infrastructure ports
  - Owns transaction boundaries and correlation IDs
- `core/domain/*` defines policy + contracts.
  - Traits (ports), domain events, policy/state types
  - No direct filesystem/network/DB calls
- `core/infrastructure/*` implements adapters.
  - Database, keychain, sidecar, projection writer, event sink

### Dependency direction

Allowed direction:

`commands` → `core/application` → `core/domain`

`core/infrastructure` → `core/domain` (implements domain ports)

Forbidden:

- `core/domain` importing `commands` or concrete infrastructure modules
- `commands` invoking `std::fs::*` or sidecar process APIs directly for business flows
- Cross-feature direct adapter coupling (use domain/application boundaries)

## Review Checklist (Required for PR review)

- [ ] Command handlers are thin adapters only (no policy logic)
- [ ] Domain rules are expressed in `core/domain` and testable without IO
- [ ] Infrastructure concerns are behind trait ports
- [ ] Mutating flows pass through application services, not direct file writes
- [ ] New/changed mutating commands include structured v2 response envelope mapping
- [ ] Projection writes use atomic writer path (temp + rename)
- [ ] Correlation IDs are propagated through job/runtime events where applicable

## Suggested Local Verification

- Run Rust compile check for backend:
  - `cargo check --manifest-path src-tauri/Cargo.toml`
- Run frontend typecheck:
  - `tsc -b`
