# AGENTS.md

## What this is

Aether — macOS desktop app (Tauri v2 + SolidJS) that manages a bundled Go sidecar (`CLIProxyAPI`) as an AI proxy. GUI for configuring AI agent presets, provider accounts, and proxy routing.

> Full architecture docs with Mermaid diagrams: **[ARCHITECTURE.md](./ARCHITECTURE.md)**

## Setup

```bash
pnpm install
./scripts/download-sidecar.sh   # REQUIRED before any Rust build — fetches CLIProxyAPI binary
```

The sidecar version is pinned in `.cliproxyapi-version`. The script places it at `src-tauri/binaries/cliproxyapi-{target-triple}`. `build.rs` will **panic** if the binary is missing or is a placeholder (<1024 bytes) in release mode.

## Commands

| Task | Command |
|------|---------|
| Dev (full app) | `pnpm tauri dev` |
| Dev (frontend only) | `pnpm dev` (Vite on port 1420) |
| Typecheck | `tsc -b` |
| Production build | `pnpm tauri build` (requires real sidecar) |
| Bump version | `./scripts/version-bump.sh <version>` (syncs package.json, tauri.conf.json, Cargo.toml) |

No tests, linter, formatter, or CI exist in this repo.

---

## Architecture

### Frontend (`src/`)

- **SolidJS** (not React) — uses `createSignal`, `createEffect`, `<For>`, `<Show>`, etc. JSX pragma is `solid-js`.
- Entry: `index.tsx` → `App.tsx` (routes defined there)
- Pages in `src/pages/`, components in `src/components/` — both have barrel `index.ts` exports
- Stores in `src/stores/` — `proxyStore`, `accountStore`, `presetStore`, `requestStore`, `configWatcher`
- Styling: Tailwind CSS v4 via `@tailwindcss/vite` — custom dark glassmorphism tokens in `src/styles/app.css`
- Two windows: `main` (1200×800, overlay titlebar) and `popup` (320×400, transparent tray popup)

### Backend (`src-tauri/src/`)

- Entry: `main.rs` → `lib.rs` (`app_lib::run()`)
- Modules: `commands/` (incl. `agents.rs`), `config/`, `proxy/`, `keychain/`, `watcher.rs`
- Tauri commands cover: preset CRUD, proxy lifecycle, event streaming, provider accounts, settings, agent detection, file I/O, version info

### Sidecar

- `CLIProxyAPI` Go binary from `router-for-me/CLIProxyAPI`
- Managed via Tauri shell plugin (spawn, stdin-write, kill)
- Version exposed at compile time as `BUNDLED_SIDECAR_VERSION` env var

---

## Store Ownership

Each store owns a specific domain. Know which store a page/component depends on before editing.

| Store | Domain | Consumed by (pages) | Consumed by (components) |
|-------|--------|---------------------|--------------------------|
| `proxyStore` | Proxy lifecycle, status, port | Dashboard, CliproxyOverview, ControlPanel, Settings, Popup | App.tsx |
| `presetStore` | Preset CRUD, model/provider parsing | Dashboard, Presets, Popup | EditPresetForm, PresetCard, CreatePresetModal, configWatcher |
| `accountStore` | Provider accounts, API key status | Dashboard, Accounts | AddAccountModal, ProviderCard |
| `requestStore` | Live request monitoring | Monitor | RequestTable, RequestDetailPanel |
| `configWatcher` | External config hot-reload | — | App.tsx → triggers `presetStore.refresh` |

---

## Style & Conventions

### TypeScript / SolidJS

- **SolidJS, NOT React.** Never use `useState`, `useEffect`, `useRef`, etc.
- Reactive primitives: `createSignal`, `createEffect`, `createMemo`, `createResource`
- Control flow: `<Show>`, `<For>`, `<Switch>`/`<Match>` — not ternaries or `.map()`
- Lifecycle: `onMount`, `onCleanup` — not `useEffect`
- Store pattern: exported `const fooStore = { ... }` object with signal getters + action functions that wrap `invoke()`
- Interface naming: `FooProps` for component props (e.g. `EditPresetFormProps`)
- Helper functions: standalone named functions (e.g. `providerColor`), not class methods
- Strict TS flags: `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `verbatimModuleSyntax`
- Imports: use `type` keyword for type-only imports (`import type { Foo } from ...`)
- Target: ES2023, ESM modules (`"type": "module"`)

### Rust

- Edition 2021, rust-version 1.77.2
- Tauri commands: `#[tauri::command]` async functions, snake_case
- Error handling: `anyhow::Result` with descriptive error context
- Module layout: `mod.rs` pattern for directories
- Crate name: `app_lib`

### CSS

- Tailwind CSS v4 via `@tailwindcss/vite` — utility-first
- Custom dark glassmorphism tokens in `src/styles/app.css`
- Separate `popup.css` for tray popup window

---

## Key Quirks

- **Config path is `~/.config/aether/`**, not `~/Library/Application Support/`. The Go sidecar's flag parser breaks on spaces in paths. Do not change this.
- Reads `~/.config/opencode/opencode.json` for AI models/providers and `~/.config/opencode/oh-my-opencode-slim.json` for preset configs.
- Proxy config generated at `~/.config/aether/proxy-config.yaml`, settings at `~/.config/aether/settings.json`. Default proxy port: **8317**.
- Main window close hides to tray instead of quitting.
- macOS-only: `macOSPrivateApi: true`, min macOS 13.0, entitlements grant network + keychain access.

---

## Sensitive Files — Do Not Modify Without Explicit Request

| File | Why |
|------|-----|
| `src-tauri/build.rs` | Sidecar validation logic — wrong changes = build panic |
| `src-tauri/tauri.conf.json` | Window config, permissions, capabilities — breaks app if misconfigured |
| `src-tauri/capabilities/*.json` | macOS entitlements (network, keychain) |
| `.cliproxyapi-version` | Sidecar version pin — must match download script |
| `scripts/download-sidecar.sh` | Fetches correct binary per target triple |
| `src/styles/app.css` | Global design tokens — changes cascade everywhere |

---

## Serena — LSP-Powered Code Intelligence

This project is onboarded with [Serena](https://github.com/serena-ai/serena) for LSP-aware code navigation and refactoring.

### Available Memories

| Memory | Content |
|--------|---------|
| `project_overview` | Purpose, tech stack, three-layer architecture, file structure |
| `suggested_commands` | Setup, dev, build, version bump commands |
| `style_and_conventions` | SolidJS patterns, TS strict flags, Rust conventions, Tailwind |
| `task_completion` | Checklist for verifying changes (typecheck, quirks) |
| `architecture/dependency_graph` | Page→store, component→store, backend module deps, execution flows |
| `analytics/implementation` | Analytics store implementation details and patterns |
| `bugfix/analyticsStore_duplicate_memos` | Fix for duplicate memo computations in analytics store |
| `global/changelog-2026-03-31` | Global changelog entry from March 2026 |

### When to Use Serena

- **Symbol lookup**: `find_symbol` — find any function/class/interface by name across the codebase
- **Go to definition**: `find_declaration` — jump to where a symbol is defined
- **Find references**: `find_referencing_symbols` — who calls/uses this symbol?
- **Find implementations**: `find_implementations` — concrete implementations of interfaces
- **Safe refactoring**: `rename_symbol` — LSP-powered rename across all files
- **Safe delete**: `safe_delete_symbol` — only deletes if no references exist
- **Diagnostics**: `get_diagnostics_for_file` — type errors, warnings per file
- **Code overview**: `get_symbols_overview` — quick scan of all symbols in a file

### Serena vs GitNexus

| Need | Use |
|------|-----|
| Exact symbol lookup, go-to-definition, rename | **Serena** (LSP-precise) |
| Execution flow tracing, blast radius analysis | **GitNexus** (knowledge graph) |
| Find all references to a symbol | **Serena** `find_referencing_symbols` |
| Understand what an entire flow does end-to-end | **GitNexus** `query` or `context` |
| Pre-commit change verification | **GitNexus** `detect_changes` |
| Type error diagnostics | **Serena** `get_diagnostics_for_file` |

---

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **aether** (2300 symbols, 4437 relationships, 200 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/aether/context` | Codebase overview, check index freshness |
| `gitnexus://repo/aether/clusters` | All functional areas |
| `gitnexus://repo/aether/processes` | All execution flows |
| `gitnexus://repo/aether/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
