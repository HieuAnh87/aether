# src-tauri/src/

Backend entry point — Tauri v2 app with Go sidecar management.

## Entry

`main.rs` → `lib.rs` (`app_lib::run()`)

## Modules

| Module | Purpose |
|--------|---------|
| `commands/` | Tauri command handlers (`#[tauri::command]`) |
| `core/` | Domain-driven architecture (domain → application → infrastructure) |
| `proxy/` | Sidecar spawn/kill lifecycle |
| `config/` | Configuration management |
| `keychain/` | macOS keychain access for API keys |
| `secrets/` | Secret management |
| `watcher.rs` | File system watcher for config hot-reload |

## Conventions

- Tauri commands: `#[tauri::command]` async functions, snake_case
- Error handling: `anyhow::Result` with descriptive error context
- Module layout: `mod.rs` pattern for directories
- Crate name: `app_lib`, Edition 2021, rust-version 1.77.2

## Notes

- Sidecar binary at `src-tauri/binaries/cliproxyapi-{target-triple}`
- Version pinned in `.cliproxyapi-version`
- `build.rs` panics if sidecar missing or placeholder (<1024 bytes) in release mode
