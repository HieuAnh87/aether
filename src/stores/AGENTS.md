# src/stores/

State management layer — 11 stores using SolidJS signals + Tauri `invoke()` calls.

## Conventions

- **Store pattern**: exported `const fooStore = { ... }` object with signal getters + action functions
- Actions wrap `invoke()` from `@tauri-apps/api/core`
- No centralized state manager — each store is a standalone module
- `commandClient.ts` provides the Tauri command client used by all stores

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

## Notes

- `configWatcher` is not a store but a watcher — it triggers `presetStore.refresh` on external config changes
- Stores barrel-export via `index.ts` (check for re-exports when adding new stores)
