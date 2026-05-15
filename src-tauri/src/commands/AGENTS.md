# src-tauri/src/commands/

Tauri command handlers — exposed to frontend via `invoke()`.

## Commands

| File | Purpose |
|------|---------|
| `agents.rs` | Agent detection and management |
| `agent_providers.rs` | Agent provider CRUD |
| `provider_switch.rs` | Provider switching orchestration |
| `mod.rs` | Module exports |

## Conventions

- `#[tauri::command]` async functions, snake_case naming
- Return `anyhow::Result<T>` for error handling
- Called from frontend stores via `invoke('command_name', { args })`

## Notes

- Commands are the **only** way frontend communicates with backend
- Command names in `invoke()` must match the `#[tauri::command]` function name exactly
- Additional commands may exist in other modules (proxy, config, keychain, secrets)
