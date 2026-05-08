# Aether v2 Command Migration Mapping

This document maps command/runtime behavior changes introduced in the v2 cutover.

## Response Contract Migration

Mutating commands now return a structured envelope:

```json
{
  "status": "ok|error",
  "data": {},
  "error": "...",
  "code": "...",
  "correlationId": "..."
}
```

Frontend callers SHOULD use `invokeCompat(...)` from `src/stores/commandClient.ts`, which supports both legacy raw responses and the v2 envelope.

## Mutating Command Mapping

The following command groups were migrated from raw `Result<T, String>` payload expectations to envelope-compatible success payloads:

- Preset mutations:
  - `set_active_preset`
  - `create_preset`
  - `update_preset`
  - `delete_preset`
  - `duplicate_preset`
- Provider account mutations:
  - `add_provider_account`
  - `update_api_key`
  - `delete_provider_account`
- Agent provider mutations:
  - `add_agent_provider`
  - `update_agent_provider`
  - `delete_agent_provider`
- Runtime/control mutations:
  - `start_proxy`
  - `stop_proxy`
  - `restart_proxy`
  - `start_event_stream`
- File/settings/cache mutations:
  - `write_file`
  - `update_settings`
  - `write_usage_cache`
- Agent configuration mutation:
  - `configure_cli_agent`

## Runtime Status Rename/Behavior Changes

Legacy runtime state assumptions were updated:

- Removed status: `restarting`
- Added statuses: `stopping`, `degraded`
- Current runtime status set:
  - `running`, `stopped`, `starting`, `stopping`, `degraded`, `crashed`

Frontend status renderers and stores should rely on:
- `proxy-status-changed` (existing)
- `proxy-runtime-lifecycle` (new lifecycle stream)

## Direct Write Path Migration

Legacy direct file writes in mutation paths were replaced by atomic projection write flows (`AtomicProjectionWriter`) or equivalent temp-file-and-rename paths to preserve durability and reduce partial-write risk.

Key migrated areas include:
- command-level writes (`write_file`, provider file persistence, usage cache temp writes)
- proxy config generation
- CLI tool configuration writers (Claude/Codex/Amp/OpenCode)
- secrets persistence now uses tempfile+persist semantics for encrypted payload writes.
