# StateDock Local

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)]()

> **The lightweight, offline-first personal task coordination engine and Model Context Protocol (MCP) server.**

StateDock Local provides a self-contained personal development environment:
* **Zero Infrastructure**: Runs directly on your machine with built-in SQLite. No Docker or Cloudflare required.
* **Instant UI**: Reuses the official StateDock PWA interface with full Kanban task boards, handoff notes, and activity history.
* **Coding Agent Ready**: Exposes `/mcp` out-of-the-box for **Cursor**, **Antigravity**, **Claude Code**, and **Windsurf**.
* **Zero-Login Local Experience**: Automatic local owner session without registration or passwords.
* **Local-First Security**: Strict loopback binding (`127.0.0.1`), Host whitelist (anti-DNS rebinding), `Sec-Fetch-Site` cross-origin blocking, and auto-generated high-entropy Agent tokens.
* **Auto-Update**: Built-in GitHub Releases update check and one-click atomic self-updating.
* **Outbound Mobile Notifications**: Single-direction alerts to **Bark**, **Telegram**, and **Discord** when agents complete handoffs or encounter blockers.
* **Data Portability**: Full JSON snapshot export & import for seamless migration to StateDock Docker or Cloud.

---

## Quick Start

### 1. Download & Run

Download the precompiled executable for your platform from [Releases](https://github.com/statedock/statedock-local/releases):

* **macOS (Apple Silicon / Intel)**
* **Windows (x64)**
* **Linux (x64)**

Run the executable:

```bash
./statedock
```

StateDock Local will:
1. Initialize local SQLite database at `~/.statedock/statedock.db`.
2. Generate an agent authorization token at `~/.statedock/agent_token`.
3. Bind to `http://127.0.0.1:4040`.
4. Automatically open your default browser with the StateDock dashboard.

### 2. Connect Your Coding Agent

In your agent's MCP configuration (e.g. `~/.cursor/mcp.json` or Antigravity):

```json
{
  "mcpServers": {
    "statedock": {
      "url": "http://127.0.0.1:4040/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_AGENT_TOKEN>"
      }
    }
  }
}
```

> The token is automatically printed in the terminal when StateDock starts, and stored securely at `~/.statedock/agent_token`.

---

## CLI Options

```text
Usage:
  statedock [options]

Options:
  -p, --port <port>       Port to listen on (default: 4040, auto-increments if busy)
  -d, --data-dir <dir>    Custom directory for database and tokens (default: ~/.statedock)
  --no-open               Do not automatically open default browser on launch
  -v, --version           Show current version
  -h, --help              Show help message
```

---

## Automatic Updates

StateDock Local checks for new versions in the background against [GitHub Releases](https://github.com/statedock/statedock-local/releases).

* **Web UI**: When a new release is detected, an update banner appears with release notes. Clicking **[Update Now]** creates an automatic database backup, downloads the new version, atomically replaces the binary, and gracefully restarts the server.
* **CLI**: The update mechanism detects your operating system and architecture, verifies SHA256 checksums, and handles file replacement safely across macOS, Linux, and Windows.

---

## Development & Building

### Prerequisites
* Node.js >= 22
* pnpm >= 9.15.4

### Commands

```bash
# Install dependencies
pnpm install

# Run all unit and integration tests
pnpm test

# Build all workspace packages and Web PWA
pnpm build

# Start local server in development mode
pnpm dev

# Package release bundle
node scripts/package.mjs
```

---

## License

StateDock Local is open source software licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).
