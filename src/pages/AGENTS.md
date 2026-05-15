# src/pages/

15 page components defining app routes. Barrel-exported via `index.ts`.

## Pages

| Page | Purpose | Key stores |
|------|---------|------------|
| `Dashboard` | Main overview | proxyStore, presetStore, accountStore |
| `Settings` | App configuration | proxyStore |
| `Presets` | Preset management | presetStore |
| `Accounts` | Provider accounts | accountStore |
| `Monitor` | Live request monitoring | requestStore |
| `Logs` | Log viewing | logStore |
| `Analytics` | Usage analytics | analyticsStore |
| `Popup` | Tray popup (320×400) | proxyStore, presetStore |
| `ControlPanel` | Proxy control | proxyStore |
| `CliproxyOverview` | Sidecar overview | proxyStore |
| `CliproxyControlPanel` | Sidecar control | proxyStore |
| `CliproxyProviders` | Provider config | — |
| `Agents` | Agent management | agentProviderStore |
| `AgentProviders` | Agent provider management | agentProviderStore |

## Conventions

- Routes defined in `App.tsx`
- Pages consume stores from `src/stores/` — check store ownership before editing
- Two-window architecture: `main` (1200×800) and `popup` (320×400 transparent tray)
