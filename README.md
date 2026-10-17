# StateDock Local

<p align="center">
  <a href="README.md"><b>English</b></a> | <a href="README_ZH.md"><b>简体中文</b></a>
</p>

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)]()
[![GitHub release](https://img.shields.io/github/v/release/statedock/statedock-local)](https://github.com/statedock/statedock-local/releases)

> **The lightweight, zero-login, self-contained personal task coordination engine and Model Context Protocol (MCP) server.**

StateDock Local is designed specifically for individual developers and AI coding agents (**Cursor**, **DeepSeek Harness**, **Antigravity**, **Claude Code**, **Windsurf**, etc.). It provides a single-user, offline-capable task coordination board and agent integration hub on your local machine.

* 🚀 **Self-contained**: every release bundles its own runtime and SQLite. No Node.js, Docker or database server to install.
* 🖥️ **Full Web/PWA dashboard**: the official StateDock interface — task board, handoff summaries, blockers, activity history.
* 🤖 **Built-in MCP server** at `/mcp` for Claude Code, Cursor, Codex, DeepSeek Harness, Windsurf, Antigravity and other MCP clients.
* 💻 **Laptop mode** (default): listens only on `127.0.0.1`, no sign-in, Host/Origin checks against DNS rebinding and cross-site probing.
* 🌐 **Server mode**: one command installs it on a Linux VPS as a systemd service; sign-in and Bearer token protect everything.
* 🛟 **Safe upgrades**: the Linux installer backs up the database before every upgrade and rolls back automatically if the new version fails to start.
* 📱 **Outbound notifications**: Bark, ntfy, Discord or a generic webhook when an agent finishes or gets blocked.
* 📦 **Portable data**: one SQLite file plus JSON export/import.

---

## Contents

1. [Choose how to run it](#1-choose-how-to-run-it)
2. [On your computer (macOS / Windows / Linux desktop)](#2-on-your-computer)
3. [On a Linux server (systemd)](#3-on-a-linux-server-systemd)
4. [With Docker](#4-with-docker)
5. [Connect your coding agent](#5-connect-your-coding-agent)
6. [Notifications](#6-notifications)
7. [Command line reference](#7-command-line-reference)
8. [Data, backups and upgrades](#8-data-backups-and-upgrades)
9. [Troubleshooting](#9-troubleshooting)
10. [Building from source](#10-building-from-source)

---

## 1. Choose how to run it

| You want to… | Use | Sign-in |
| :--- | :--- | :--- |
| Use StateDock on the computer where your agents run | [Download the app](#2-on-your-computer) | None (only this computer can reach it) |
| Run it 24/7 on a VPS and reach it from anywhere | [Linux installer](#3-on-a-linux-server-systemd) | Access token |
| Keep using Docker | [Docker image](#4-with-docker) | Access token |

All three run the same program on the same database format, so you can move your data between them at any time.

---

## 2. On your computer

Download the archive for your system from [Releases](https://github.com/statedock/statedock-local/releases/latest):

| Platform | File | How to start |
| :--- | :--- | :--- |
| macOS (Apple Silicon) | `statedock-macos-arm64.tar.gz` | Extract, double-click **`StateDock.command`** (or run `./statedock` in Terminal) |
| Windows (x64) | `statedock-windows-x64.zip` | Extract, double-click **`statedock.bat`** |
| Linux (x64) | `statedock-linux-x64.tar.gz` | Extract, run `./statedock` |
| Linux (ARM64) | `statedock-linux-arm64.tar.gz` | Extract, run `./statedock` |

On first start StateDock:

1. creates its data folder `~/.statedock/` (`%USERPROFILE%\.statedock\` on Windows) with the database `statedock.db`;
2. generates an access token in `~/.statedock/agent_token`;
3. listens on `http://127.0.0.1:4040` (the next free port if 4040 is taken);
4. opens your browser and prints a ready-to-paste MCP configuration in the terminal.

Stop it with `Ctrl+C` or by closing the terminal window.

> macOS may block the first launch of a downloaded file. Right-click `StateDock.command` → **Open**, or run `xattr -dr com.apple.quarantine <folder>` once.

**Uninstall:** delete the extracted folder. To remove your data as well, delete `~/.statedock`.

---

## 3. On a Linux server (systemd)

Supported: any systemd-based distribution (Ubuntu, Debian, Fedora, …) on x64 or ARM64, including 1 CPU / 1 GB machines. Also works in WSL2 once systemd is enabled (see [Troubleshooting](#9-troubleshooting)).

### 3.1 Install

**Behind a domain with HTTPS (typical VPS):**

```sh
curl -fsSL https://raw.githubusercontent.com/statedock/statedock-local/main/scripts/install.sh \
  | sudo bash -s -- --public-url https://dock.example.com
```

**Just try it / private machine (no domain):**

```sh
curl -fsSL https://raw.githubusercontent.com/statedock/statedock-local/main/scripts/install.sh | sudo bash
```

`--public-url` tells StateDock its public address, so MCP links point there and only that host name is accepted. You can add or change it later (see 3.4).

The installer:

| What | Where |
| :--- | :--- |
| Program (last 3 versions kept) | `/opt/statedock/releases/…`, active one linked as `/opt/statedock/current` |
| Data: database, backups, access token | `/var/lib/statedock/` |
| Settings | `/etc/statedock/statedock.env` |
| Service | `statedock.service` — starts on boot, restarts on failure, runs as the unprivileged `statedock` user |
| Commands | `statedock` (app commands) and `statedock-ctl` (install/update/uninstall) in `/usr/local/bin` |

Installer options: `--host <addr>` (default `127.0.0.1`), `--port <port>` (default `4040`), `--public-url <url>`, `--version <tag>` (default latest).

### 3.2 Check it

```sh
sudo statedock-ctl status           # service state
curl http://127.0.0.1:4040/health   # {"status":"ok"}
sudo statedock token                # your access token
```

### 3.3 Make it reachable over HTTPS

By default the service listens only on `127.0.0.1:4040`, so nothing is exposed until you choose how. Pick one:

**Caddy (automatic Let's Encrypt certificates).** Point your domain's DNS to the server, open ports 80 and 443, install Caddy, and put this in `/etc/caddy/Caddyfile`:

```caddy
dock.example.com {
    reverse_proxy 127.0.0.1:4040
}
```

Then `sudo systemctl reload caddy`.

**A tunnel (no open ports):** Cloudflare Tunnel or Tailscale pointing at `http://127.0.0.1:4040`.

**Directly on the network (only on a trusted LAN or behind your own TLS terminator):** set `STATEDOCK_HOST=0.0.0.0` (see 3.4). The access token must never travel over plain HTTP on the public internet.

Open `https://dock.example.com`: you will see the sign-in page. Paste the output of `sudo statedock token`. The browser stays signed in for 30 days.

### 3.4 Change settings

Edit `/etc/statedock/statedock.env`, then `sudo systemctl restart statedock`:

```ini
PORT=4040
STATEDOCK_HOST=127.0.0.1
PUBLIC_BASE_URL=https://dock.example.com
# STATEDOCK_AGENT_TOKEN=...   optional fixed token instead of the generated one
```

### 3.5 Server mode and security

Whenever StateDock listens on anything other than loopback, **server mode** is on:

* every page, API and MCP request requires the access token — browsers sign in at `/login` (HttpOnly cookie, `Secure` over HTTPS), agents send `Authorization: Bearer <token>`;
* `/health` and static assets stay public for monitoring;
* with `PUBLIC_BASE_URL` set, requests for any other host name are rejected;
* a browser session never authorizes MCP; agents always need the Bearer token.

There is one owner and one token, no accounts or roles. **To rotate the token** (signs every browser out and disconnects agents): `sudo rm /var/lib/statedock/agent_token && sudo systemctl restart statedock`, then `sudo statedock token`.

### 3.6 Update

```sh
sudo statedock-ctl update
```

It downloads the new release and verifies its checksum, stops the service, saves a database snapshot to `/var/lib/statedock/backups/`, switches to the new version and waits up to 30 seconds for it to answer `/health`. If it does not, the snapshot is restored, the previous version is switched back and restarted. Install a specific version with `--version v0.1.0`.

### 3.7 Uninstall

```sh
sudo statedock-ctl uninstall           # remove program and service, keep data and settings
sudo statedock-ctl uninstall --purge   # also delete /var/lib/statedock, settings and the service user
```

`statedock-ctl` removes itself on uninstall; to purge after a normal uninstall, install again first.

### 3.8 Logs

```sh
sudo statedock-ctl logs                # last 200 lines
sudo journalctl -u statedock -f        # follow live
```

---

## 4. With Docker

The image `ghcr.io/statedock/statedock` (x64 and ARM64) is the same program in server mode, listening on port 3000 with data in `/data`. [`deploy/compose.yaml`](deploy/compose.yaml) runs it with Caddy for HTTPS:

```sh
git clone https://github.com/statedock/statedock-local.git
cd statedock-local/deploy
# 1. replace dock.example.com in Caddyfile and compose.yaml with your domain
# 2. start
docker compose up -d
# 3. get the access token
docker compose exec statedock node dist/index.js token --no-open
```

Update: `docker compose pull && docker compose up -d`. Back up: `docker compose exec statedock node dist/index.js backup --no-open` (written to `./data/backups/`).

**Coming from the old `statedock-docker` repository?** The database format is identical. Keep your `./data` folder, switch the `statedock` service to `image: ghcr.io/statedock/statedock:latest`, add `PUBLIC_BASE_URL`, and start it. An existing `STATEDOCK_AGENT_TOKEN` keeps working; the web UI now asks for it at `/login`. Details: [docs/server.md](docs/server.md#moving-from-the-statedock-docker-image).

---

## 5. Connect your coding agent

You need two things: the MCP URL and the access token.

| Where StateDock runs | MCP URL | Token |
| :--- | :--- | :--- |
| Your computer | `http://127.0.0.1:4040/mcp` | contents of `~/.statedock/agent_token` |
| Linux server | `https://dock.example.com/mcp` | `sudo statedock token` |
| Docker | `https://dock.example.com/mcp` | `docker compose exec statedock node dist/index.js token --no-open` |

The optional `x-actor-name` header names the agent in task history (e.g. `claude-code`, `cursor`).

**Claude Code**

```sh
claude mcp add --transport http statedock http://127.0.0.1:4040/mcp \
  --header "Authorization: Bearer <TOKEN>" --header "x-actor-name: claude-code"
```

**Cursor / Windsurf / Antigravity and other JSON-configured clients** (e.g. `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "statedock": {
      "url": "http://127.0.0.1:4040/mcp",
      "headers": {
        "Authorization": "Bearer <TOKEN>",
        "x-actor-name": "cursor"
      }
    }
  }
}
```

**DeepSeek Harness** (`@deepseek-ai/dsh-mcp-client`):

```yaml
- id: mcp-statedock
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: statedock
    transport: streamable-http
    url: http://127.0.0.1:4040/mcp
    headers:
      Authorization: 'Bearer <TOKEN>'
      x-actor-name: 'harness'
    failOnStartupError: false
```

Ask the agent to call `get_instance_info` once connected; it should report your StateDock address.

---

## 6. Notifications

Get a message when an agent finishes a task (`submit_handoff`) or gets blocked (`pause_task`). StateDock only sends outbound requests, so no open ports are needed.

1. Open the dashboard and click the bell (🔔) in the header.
2. Add a channel: **Bark** (iOS), **ntfy**, **Discord** or a **generic webhook** (Telegram is available in StateDock Cloud only).
3. Click **Test**, then save.

---

## 7. Command line reference

```text
statedock [options]          start the server
statedock token              print the access / agent token
statedock backup             write a consistent database snapshot and print its path

-p, --port <port>            port (default 4040; on a laptop the next free port is used if taken)
-d, --data-dir <dir>         data folder (default ~/.statedock)
--host <addr>                listen address (default 127.0.0.1); non-loopback enables server mode
--public-url <url>           public origin, e.g. https://dock.example.com
--no-open                    do not open the browser
-v, --version | -h, --help
```

Environment variables: `PORT`, `STATEDOCK_HOST`, `PUBLIC_BASE_URL`, `STATEDOCK_DATA_DIR` (or `DATA_DIR`), `STATEDOCK_AGENT_TOKEN`.

On a server installed with the script, `statedock` already points at `/var/lib/statedock`; run it with `sudo`.

```text
statedock-ctl install | update | uninstall [--purge] | status | logs
```

---

## 8. Data, backups and upgrades

Everything lives in the data folder (`~/.statedock` on a computer, `/var/lib/statedock` on a server, `/data` in Docker):

| File | Purpose |
| :--- | :--- |
| `statedock.db` (+ `-wal`, `-shm`) | the SQLite database, including attachments |
| `agent_token` | access token |
| `backups/` | snapshots from `statedock backup` and upgrades |

* **Back up:** `statedock backup` writes a consistent snapshot even while StateDock is running. Do not copy `statedock.db` by hand while it runs; the `-wal` file may hold recent changes.
* **Move between computer, server and Docker:** stop StateDock, copy `statedock.db` into the new data folder, start it. Schema migrations run automatically and only move forward.
* **Export/import (JSON):** `GET /api/system/export` downloads all projects and tasks; `POST /api/system/import` loads such a file. On a server add `-H "Authorization: Bearer <token>"`, e.g. `curl -H "Authorization: Bearer $(sudo statedock token)" http://127.0.0.1:4040/api/system/export -o statedock.json`.
* **Upgrading:** on a computer, replace the app folder with the new archive (your data folder is untouched). On a Linux server, `sudo statedock-ctl update`. In Docker, pull the new image. New versions are listed on [Releases](https://github.com/statedock/statedock-local/releases).

---

## 9. Troubleshooting

| Symptom | Fix |
| :--- | :--- |
| `systemd is required` (WSL) | Run `printf '[boot]\nsystemd=true\n' \| sudo tee /etc/wsl.conf`, then `wsl --shutdown` in Windows PowerShell and reopen Ubuntu. |
| `Service did not become healthy` | `sudo journalctl -u statedock -n 100` shows why; often the port is in use — change `PORT` in `/etc/statedock/statedock.env`. |
| Browser shows `Forbidden: Unauthorized Host header` | The address you used is not `PUBLIC_BASE_URL` or loopback. Use the configured domain, or fix `PUBLIC_BASE_URL`. |
| Agent gets `401 unauthorized` | Wrong or missing `Authorization: Bearer <token>`; get the current token with `statedock token`. |
| Token leaked | Rotate it (section 3.5) and update your agents. |
| Port 4040 busy on a laptop | StateDock picks the next free port and prints it; or start with `--port`. |

---

## 10. Building from source

```sh
git clone https://github.com/statedock/statedock-local.git
cd statedock-local
pnpm install          # Node >= 22, pnpm 9.15.4
pnpm test
pnpm build
pnpm start            # or: node apps/local/dist/index.js --help
node scripts/package.mjs   # release bundle in ./release-bundle
```

---

## License

StateDock Local is open source software licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).
