# Aether

<!-- Generated: 2026-05-15 -->
<!-- Run /maintain-context-docs to check for drift -->

macOS desktop app (Tauri v2 + SolidJS) managing a bundled Go sidecar (`CLIProxyAPI`) as an AI proxy. GUI for AI agent presets, provider accounts, and proxy routing.

> Full architecture: **[ARCHITECTURE.md](./ARCHITECTURE.md)**

## Commands

```bash
pnpm install
./scripts/download-sidecar.sh   # REQUIRED before any Rust build

# Dev (full app)
pnpm tauri dev

# Dev (frontend only, Vite port 1420)
pnpm dev

# Typecheck
tsc -b

# Production build (requires real sidecar)
pnpm tauri build

# Bump version (syncs package.json, tauri.conf.json, Cargo.toml)
./scripts/version-bump.sh <version>
```

No tests, linter, formatter, or CI.

## Boundaries

- **Never modify** `src-tauri/build.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/*.json`, `.cliproxyapi-version`, `scripts/download-sidecar.sh`, `src/styles/app.css` without explicit request
- **Config path is `~/.config/aether/`**, not `~/Library/Application Support/` — Go sidecar flag parser breaks on spaces
- Main window close hides to tray, doesn't quit

## Where to look

| Task | Location | Note |
|------|----------|------|
| Frontend pages | `src/pages/` | Barrel exports via `index.ts` |
| UI components | `src/components/` | Barrel exports via `index.ts` |
| State stores | `src/stores/` | See store ownership table below |
| Tauri commands | `src-tauri/src/commands/` | `#[tauri::command]` async functions |
| Backend core (DDD) | `src-tauri/src/core/` | domain → application → infrastructure |
| Proxy lifecycle | `src-tauri/src/proxy/` | Sidecar spawn/kill logic |
| OpenSpec changes | `openspec/changes/` | Active + archived feature specs |

## Conventions (deviations only)

- **SolidJS, NOT React.** Use `createSignal`, `createEffect`, `<For>`, `<Show>` — never `useState`, `useEffect`
- Store pattern: exported `const fooStore = { ... }` object with signal getters + action functions wrapping `invoke()`
- Tauri commands: snake_case async functions with `anyhow::Result`
- Strict TS: `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `verbatimModuleSyntax`
- Type-only imports: `import type { Foo } from ...`

## Notes

- Reads `~/.config/opencode/opencode.json` for AI models/providers
- Proxy config at `~/.config/aether/proxy-config.yaml`, settings at `~/.config/aether/settings.json`
- Default proxy port: **8317**
- macOS-only, min macOS 13.0, entitlements grant network + keychain access
- Sidecar version pinned in `.cliproxyapi-version`, binary at `src-tauri/binaries/cliproxyapi-{target-triple}`

---

## Store Ownership

| Store | Domain | Key consumers |
|-------|--------|---------------|
| `proxyStore` | Proxy lifecycle, status, port | Dashboard, Settings, Popup |
| `presetStore` | Preset CRUD, model/provider parsing | Dashboard, Presets, EditPresetForm |
| `accountStore` | Provider accounts, API key status | Accounts, AddAccountModal |
| `requestStore` | Live request monitoring | Monitor, RequestTable |
| `logStore` | Log viewing/parsing | Logs page |
| `analyticsStore` | Usage analytics | Analytics page |
| `configWatcher` | External config hot-reload | App.tsx → triggers `presetStore.refresh` |
| `providerSwitchStore` | Provider switching | ProviderSwitchStore |
| `agentProviderStore` | Agent provider management | AgentProviders page |
| `themeStore` | Theme state | App-wide |
| `commandClient` | Tauri command client | All stores |

---

## Code Intelligence

This project uses **Serena** (LSP) and **GitNexus** (knowledge graph) for code navigation.

| Need | Tool |
|------|------|
| Symbol lookup, go-to-definition, rename | **Serena** (`find_symbol`, `find_declaration`, `rename_symbol`) |
| Execution flow, blast radius | **GitNexus** (`query`, `context`, `impact`) |
| Pre-commit verification | **GitNexus** `detect_changes` |
| Type diagnostics | **Serena** `get_diagnostics_for_file` |

> If GitNexus warns index is stale, run `npx gitnexus analyze` first.
