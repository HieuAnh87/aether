# Aether — Claude Code Overrides

Strictly follow the rules in ./AGENTS.md

<!-- Generated: 2026-05-15 -->

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
|------|------|
| Exact symbol lookup, go-to-definition, rename | **Serena** (LSP-precise) |
| Execution flow tracing, blast radius analysis | **GitNexus** (knowledge graph) |
| Find all references to a symbol | **Serena** `find_referencing_symbols` |
| Understand what an entire flow does end-to-end | **GitNexus** `query` or `context` |
| Pre-commit change verification | **GitNexus** `detect_changes` |
| Type error diagnostics | **Serena** `get_diagnostics_for_file` |
