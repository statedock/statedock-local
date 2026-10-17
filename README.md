# StateDock Local

<p align="center">
  <a href="README.md"><b>English</b></a> | <a href="README_ZH.md"><b>简体中文</b></a>
</p>

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)]()
[![GitHub release](https://img.shields.io/github/v/release/statedock/statedock-local)](https://github.com/statedock/statedock-local/releases)

> **The lightweight, zero-login, self-contained personal task coordination engine and Model Context Protocol (MCP) server.**

StateDock Local is designed specifically for individual developers and AI coding agents (**Cursor**, **DeepSeek Harness**, **Antigravity**, **Claude Code**, **Windsurf**, etc.). It provides a single-user, offline-capable task coordination board and agent integration hub on your local machine.

* 🚀 **Download & Double-Click**: Bundles a standalone runtime and SQLite database. Zero external dependencies—no Node.js, Docker, or external database required.
* 🖥️ **Full Web/PWA Dashboard**: Reuses the official StateDock interface with Kanban boards, structured handoff summaries, blocker notes, and activity history.
* 🤖 **Native MCP Server**: Exposes `/mcp` out of the box with the default server identifier `statedock_local`, preventing collisions with any remote StateDock instances.
* 🔒 **Local-First Defense-in-Depth**: Strictly binds to loopback `127.0.0.1`, validates Host headers against DNS rebinding, blocks cross-site browser probing, and auto-generates high-entropy Bearer tokens.
* 📱 **Outbound Mobile Notifications**: Sends single-direction alerts to **Bark**, **Telegram**, and **Discord** when agents complete tasks or require decisions—no public IP or port forwarding needed.
* 🔄 **One-Click Atomic Updates**: Background checks against GitHub Releases with graceful database backups and atomic binary replacements.
* 📦 **Data Portability**: Full JSON snapshot export & import for seamless upgrades to StateDock Docker or Cloud.

---

## Quick Start

### 1. Download & Launch

Download the precompiled archive for your operating system from [Releases](https://github.com/statedock/statedock-local/releases):

| Platform | File | How to Run |
| :--- | :--- | :--- |
| **macOS (Apple Silicon)** | `statedock-macos-arm64.tar.gz` | Extract and double-click **`StateDock.command`** (or run `./statedock` in Terminal) |
| **Windows (x64)** | `statedock-windows-x64.zip` | Extract and double-click **`statedock.bat`** |
| **Linux (x64)** | `statedock-linux-x64.tar.gz` | Extract and run **`./statedock.sh`** in terminal |

When launched:
1. StateDock initializes your local database at `~/.statedock/statedock.db`.
2. Generates an agent token at `~/.statedock/agent_token`.
3. Binds to `http://127.0.0.1:4040`.
4. Automatically opens your default browser to the StateDock dashboard.

---

### 2. Connect Your Coding Agent

When StateDock Local starts, it prints your agent connection snippet and Bearer token in the console.

#### Option A: DeepSeek Harness (`@deepseek-ai/dsh-mcp-client` YAML format)

Add the following to your DeepSeek Harness MCP plugin configuration:

```yaml
- id: mcp-statedock-local
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: statedock_local
    transport: streamable-http
    url: http://127.0.0.1:4040/mcp
    headers:
      Authorization: 'Bearer <TOKEN_FROM_~/.statedock/agent_token>'
      x-actor-name: 'harness'
      x-actor-id: 'agent:harness'
    failOnStartupError: false
```

#### Option B: Cursor / Antigravity / Windsurf / Claude Code (JSON format)

In your agent's MCP settings file (e.g. `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "statedock_local": {
      "url": "http://127.0.0.1:4040/mcp",
      "headers": {
        "Authorization": "Bearer <TOKEN_FROM_~/.statedock/agent_token>",
        "x-actor-name": "cursor",
        "x-actor-id": "agent:cursor"
      }
    }
  }
}
```

> **Note**: Including the `x-actor-name` header attributes all task creations, status updates, and handoff summaries to your specific agent.

---

### 3. Outbound Mobile Notifications

Receive alerts on your phone whenever an agent finishes a task (`submit_handoff`) or gets blocked (`pause_task`):

1. Open `http://127.0.0.1:4040` in your browser.
2. Click the **Notification Bell (🔔)** icon in the header.
3. Configure your preferred notification channel:
   * **Bark (iOS)**: Enter your Bark key or webhook URL (e.g. `https://api.day.app/your_key`).
   * **Telegram / Discord / Generic Webhook**: Enter your incoming webhook URL.
4. Click **[Test Push]** to verify, then click **[Save Configuration]**.

---

## CLI Usage

```text
Usage:
  statedock [options]
  statedock token          Print the access / agent token
  statedock backup         Write a consistent database backup and print its path

Options:
  -p, --port <port>       Port to listen on (default: 4040, auto-increments if in use on a laptop)
  -d, --data-dir <dir>    Data storage directory (default: ~/.statedock)
  --host <addr>           Listen address (default: 127.0.0.1). A non-loopback address enables
                          server mode: sign-in and Bearer token required
  --public-url <url>      Public HTTPS origin, e.g. https://dock.example.com
  --no-open               Do not automatically launch the default browser
  -v, --version           Display version number
  -h, --help              Show help message
```

---

## Run It on a Server (VPS / Docker)

The same program is the self-hosted server. On Linux one command installs it as a systemd service
that starts on boot:

```sh
curl -fsSL https://raw.githubusercontent.com/statedock/statedock-local/main/scripts/install.sh \
  | sudo bash -s -- --public-url https://dock.example.com
```

Docker is available as a thin image (`ghcr.io/statedock/statedock`). See
[docs/server.md](docs/server.md) for HTTPS, updates with automatic backup and rollback, and moving
from the former `statedock-docker` image.

---

## Updates

StateDock checks [GitHub Releases](https://github.com/statedock/statedock-local/releases) and shows
a banner when a new version is out.

* **Laptop**: download the new archive and replace the app folder. Your data stays in `~/.statedock`.
* **Linux server**: `sudo statedock-ctl update` backs up the database, upgrades, and rolls back
  automatically if the new version does not start.

---

## Building from Source

```bash
# 1. Clone repository
git clone https://github.com/statedock/statedock-local.git
cd statedock-local

# 2. Install dependencies (Node >= 22, pnpm >= 9.15.4)
pnpm install

# 3. Run all tests
pnpm test

# 4. Build and start
pnpm build
pnpm start
```

---

## License

StateDock Local is open source software licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).
