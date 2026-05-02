# Aether

<div align="center">

**AI Proxy Manager for macOS**

A native macOS desktop application for managing AI agent presets and routing requests through a local proxy.

[![macOS](https://img.shields.io/badge/macOS-13.0+-blue.svg)](https://www.apple.com/macos/)
[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB.svg)](https://tauri.app/)
[![SolidJS](https://img.shields.io/badge/SolidJS-1.9-2C4F7C.svg)](https://www.solidjs.com/)

</div>

---

## Quick Start

```bash
# 1. Download the latest release
# Visit https://github.com/hieuda/aether/releases

# 2. Install Aether.app to Applications folder

# 3. Launch Aether and start the proxy
# Click "Start Proxy" in the Dashboard

# 4. Configure your AI client to use the proxy
# Set proxy URL to: http://localhost:8317
```

That's it! Your AI requests will now be routed through Aether's intelligent proxy.

---

## Overview

Aether is a macOS desktop application that provides a graphical interface for managing AI agent presets and provider accounts. It bundles and manages a Go-based proxy sidecar ([CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)) that routes AI requests based on configurable presets.

### Key Features

- 🎯 **Agent Preset Management** — Create, edit, and organize AI agent configurations
- 🔑 **Provider Account Management** — Securely store API keys in macOS Keychain
- 📊 **Request Monitoring** — Real-time view of proxied requests with detailed logs
- 🚀 **Local Proxy Server** — Bundled Go sidecar runs on port 8317 (configurable)
- 🎨 **Native macOS UI** — Dark glassmorphism design with system tray integration
- 🔄 **Hot Reload** — Automatically detects external config changes

---

## Architecture

Aether is built with three layers:

1. **Frontend** — SolidJS + Tailwind CSS v4
2. **Backend** — Rust (Tauri v2) with native macOS integrations
3. **Sidecar** — Go binary (CLIProxyAPI) managed as a child process

```
┌─────────────────────────────────────────┐
│         SolidJS Frontend (UI)           │
│  Stores: proxy, preset, account, etc.   │
└─────────────────┬───────────────────────┘
                  │ Tauri IPC
┌─────────────────▼───────────────────────┐
│       Rust Backend (Tauri v2)           │
│  Commands, Config, Keychain, Watcher    │
└─────────────────┬───────────────────────┘
                  │ stdin/stdout
┌─────────────────▼───────────────────────┐
│      Go Sidecar (CLIProxyAPI)           │
│   Proxy Server on localhost:8317        │
└─────────────────────────────────────────┘
```

For detailed architecture documentation with Mermaid diagrams, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Prerequisites

- **macOS 13.0+** (Ventura or later)
- **Node.js 18+** and **pnpm**
- **Rust 1.77.2+** (for building from source)
- **Xcode Command Line Tools**

---

## Installation

### From Release (Recommended)

Download the latest `.dmg` from [Releases](https://github.com/hieuda/aether/releases) and drag Aether to your Applications folder.

#### macOS Users

The app is not signed with an Apple Developer certificate yet. If macOS blocks the app:

```bash
xattr -cr /Applications/Aether.app
```

### From Source

```bash
# Clone the repository
git clone https://github.com/hieuda/aether.git
cd aether

# Install dependencies
pnpm install

# Download the bundled sidecar binary (REQUIRED)
./scripts/download-sidecar.sh

# Run in development mode
pnpm tauri dev

# Build for production
pnpm tauri build
```

> **Important:** The `download-sidecar.sh` script must be run before any Rust build. The sidecar version is pinned in `.cliproxyapi-version`.

---

## Configuration

Aether reads and writes configuration files in `~/.config/aether/`:

| File                  | Purpose                                       |
| --------------------- | --------------------------------------------- |
| `proxy-config.yaml` | Generated proxy configuration for CLIProxyAPI |
| `settings.json`     | Application settings (port, auto-start, etc.) |

It also reads AI model/provider data from:

- `~/.config/opencode/opencode.json` — Model and provider definitions
- `~/.config/opencode/oh-my-opencode-slim.json` — Preset configurations

> **Note:** Config path is `~/.config/aether/` (not `~/Library/Application Support/`) because the Go sidecar's flag parser breaks on spaces in paths.

---

## Usage

### Starting the Proxy

1. Launch Aether from Applications or the menu bar icon
2. Click **Start Proxy** in the Dashboard or Control Panel
3. The proxy will start on port **8317** (default, configurable in Settings)

### Creating a Preset

1. Navigate to **Presets** page
2. Click **Create Preset**
3. Configure:
   - Name and description
   - Model selection (provider/model/variant)
   - Temperature, max tokens, etc.
4. Save

### Adding Provider Accounts

1. Navigate to **Accounts** page
2. Click **Add Account**
3. Select provider (OpenAI, Anthropic, etc.)
4. Enter API key (stored securely in macOS Keychain)

### Monitoring Requests

1. Navigate to **Monitor** page
2. View real-time request logs with:
   - Timestamp, method, path
   - Status code, duration
   - Request/response bodies

---

## Development

### Project Structure

```
aether/
├── src/                    # SolidJS frontend
│   ├── pages/             # Route pages
│   ├── components/        # Reusable components
│   ├── stores/            # State management
│   └── styles/            # Tailwind CSS
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── commands/      # Tauri commands
│   │   ├── config/        # Config management
│   │   ├── proxy/         # Sidecar lifecycle
│   │   └── keychain/      # macOS Keychain integration
│   └── binaries/          # Sidecar binaries (downloaded)
├── scripts/               # Build and utility scripts
└── public/                # Static assets
```

### Available Commands

| Task                | Command                                 |
| ------------------- | --------------------------------------- |
| Dev (full app)      | `pnpm tauri dev`                      |
| Dev (frontend only) | `pnpm dev`                            |
| Typecheck           | `tsc -b`                              |
| Build               | `pnpm tauri build`                    |
| Bump version        | `./scripts/version-bump.sh <version>` |

### Tech Stack

- **Frontend:** SolidJS 1.9, Tailwind CSS v4, SolidJS Router
- **Backend:** Rust (Tauri v2), Tokio async runtime
- **Sidecar:** Go (CLIProxyAPI)
- **Build:** Vite 6, TypeScript 6.0, esbuild

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- **TypeScript/SolidJS:** Use SolidJS primitives (`createSignal`, `createEffect`), not React hooks
- **Rust:** Follow Rust 2021 edition conventions, use `anyhow::Result` for errors
- **CSS:** Tailwind utility-first, custom tokens in `src/styles/app.css`

---

## License

    This project is licensed under the MIT License - see the[LICENSE](LICENSE) file for details.

---

## Acknowledgments

- [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) — Go-based AI proxy server
- [Tauri](https://tauri.app/) — Rust-based desktop app framework
- [SolidJS](https://www.solidjs.com/) — Reactive JavaScript library

---

## Support

- **Issues:** [GitHub Issues](https://github.com/hieuda/aether/issues)
- **Discussions:** [GitHub Discussions](https://github.com/hieuda/aether/discussions)

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=hieuda/aether&type=Date)](https://star-history.com/#hieuda/aether&Date)

---

<div align="center">

Made with ❤️ for the AI developer community

</div>
