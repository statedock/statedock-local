# StateDock Local

<p align="center">
  <a href="README.md"><b>English</b></a> | <a href="README_ZH.md"><b>简体中文</b></a>
</p>

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)]()
[![GitHub release](https://img.shields.io/github/v/release/statedock/statedock-local)](https://github.com/statedock/statedock-local/releases)

> **你和 Coding Agent 的共享项目记忆。**

目标、决定和交接集中在一处。Claude Code、Cursor 和 Codex 通过 MCP 读取上下文、领取任务、写回交接，换个 Agent 也不用从头解释。

StateDock Local 可以在电脑上免登录运行，也可以一条命令部署到你自己的服务器。单个程序，内置 SQLite，无需安装其他依赖。

* 🚀 **自带运行时**：每个发布包都内置运行时和 SQLite，无需安装 Node.js、Docker 或数据库。
* 🖥️ **完整 Web/PWA 控制台**：官方 StateDock 界面，任务看板、交付摘要、阻塞说明、活动记录。
* 🤖 **内置 MCP 服务**（`/mcp`）：支持 Claude Code、Cursor、Codex、DeepSeek Harness、Windsurf、Antigravity 等 MCP 客户端。
* 💻 **电脑模式**（默认）：只监听 `127.0.0.1`，免登录；校验 Host/Origin，防 DNS 重绑定和跨站探测。
* 🌐 **服务器模式**：一条命令在 Linux VPS 上安装为 systemd 服务；所有访问需登录或 Bearer 令牌。
* 🛟 **安全升级**：Linux 安装脚本每次升级前备份数据库，新版本启动失败自动回滚。
* 📱 **外发通知**：Agent 完成或卡住时推送到 Bark、ntfy、Discord 或通用 Webhook。
* 📦 **数据可迁移**：一个 SQLite 文件，另支持 JSON 导出/导入。

---

## 目录

1. [选择运行方式](#1-选择运行方式)
2. [在电脑上运行（macOS / Windows / Linux 桌面）](#2-在电脑上运行)
3. [在 Linux 服务器上运行（systemd）](#3-在-linux-服务器上运行systemd)
4. [使用 Docker](#4-使用-docker)
5. [连接 Coding Agent](#5-连接-coding-agent)
6. [通知](#6-通知)
7. [命令行参考](#7-命令行参考)
8. [数据、备份与升级](#8-数据备份与升级)
9. [常见问题](#9-常见问题)
10. [源码构建](#10-源码构建)

---

## 1. 选择运行方式

| 你想要… | 使用 | 登录 |
| :--- | :--- | :--- |
| 在 Agent 所在的电脑上用 StateDock | [下载应用](#2-在电脑上运行) | 无（只有本机能访问） |
| 在 VPS 上 24 小时运行，随处访问 | [Linux 安装脚本](#3-在-linux-服务器上运行systemd) | 访问令牌 |
| 继续使用 Docker | [Docker 镜像](#4-使用-docker) | 访问令牌 |

三种方式运行的是同一个程序、同一种数据库格式，数据可随时互相迁移。

---

## 2. 在电脑上运行

从 [Releases](https://github.com/statedock/statedock-local/releases/latest) 下载对应系统的压缩包：

| 平台 | 文件 | 启动方式 |
| :--- | :--- | :--- |
| macOS（Apple 芯片） | `statedock-macos-arm64.tar.gz` | 解压后双击 **`StateDock.command`**（或在终端运行 `./statedock`） |
| Windows（x64） | `statedock-windows-x64.zip` | 解压后双击 **`statedock.bat`** |
| Linux（x64） | `statedock-linux-x64.tar.gz` | 解压后运行 `./statedock` |
| Linux（ARM64） | `statedock-linux-arm64.tar.gz` | 解压后运行 `./statedock` |

首次启动时，StateDock 会：

1. 创建数据目录 `~/.statedock/`（Windows 为 `%USERPROFILE%\.statedock\`），数据库为 `statedock.db`；
2. 在 `~/.statedock/agent_token` 生成访问令牌；
3. 监听 `http://127.0.0.1:4040`（被占用时自动顺延到下一个空闲端口）；
4. 打开浏览器，并在终端打印可直接粘贴的 MCP 配置。

按 `Ctrl+C` 或关闭终端窗口即可停止。

> macOS 首次运行下载的文件可能被拦截：右键 `StateDock.command` → **打开**，或执行一次 `xattr -dr com.apple.quarantine <文件夹>`。

**卸载**：删除解压出的文件夹；如需同时删除数据，再删除 `~/.statedock`。

---

## 3. 在 Linux 服务器上运行（systemd）

支持任何使用 systemd 的发行版（Ubuntu、Debian、Fedora 等），x64 或 ARM64，1 核 1G 也可运行。开启 systemd 后的 WSL2 同样可用（见[常见问题](#9-常见问题)）。

### 3.1 安装

**有域名、走 HTTPS（典型 VPS）：**

```sh
curl -fsSL https://raw.githubusercontent.com/statedock/statedock-local/main/scripts/install.sh \
  | sudo bash -s -- --public-url https://dock.example.com
```

**先试用 / 内网机器（没有域名）：**

```sh
curl -fsSL https://raw.githubusercontent.com/statedock/statedock-local/main/scripts/install.sh | sudo bash
```

`--public-url` 告诉 StateDock 它的公网地址：MCP 链接会使用这个地址，并且只接受这个域名的访问。之后也可以再添加或修改（见 3.4）。

安装脚本会做这些事：

| 内容 | 位置 |
| :--- | :--- |
| 程序（保留最近 3 个版本） | `/opt/statedock/releases/…`，当前版本链接为 `/opt/statedock/current` |
| 数据：数据库、备份、访问令牌 | `/var/lib/statedock/` |
| 配置 | `/etc/statedock/statedock.env` |
| 服务 | `statedock.service`：开机自启、崩溃自动重启，以无特权的 `statedock` 用户运行 |
| 命令 | `/usr/local/bin` 下的 `statedock`（应用命令）和 `statedock-ctl`（安装/升级/卸载） |

安装参数：`--host <地址>`（默认 `127.0.0.1`）、`--port <端口>`（默认 `4040`）、`--public-url <地址>`、`--version <标签>`（默认最新版）。

### 3.2 检查

```sh
sudo statedock-ctl status           # 服务状态
curl http://127.0.0.1:4040/health   # {"status":"ok"}
sudo statedock token                # 访问令牌
```

### 3.3 通过 HTTPS 对外访问

服务默认只监听 `127.0.0.1:4040`，在你选择方式之前不会对外暴露。任选一种：

**Caddy（自动申请 Let's Encrypt 证书）**：把域名解析到服务器，开放 80 和 443 端口，安装 Caddy，在 `/etc/caddy/Caddyfile` 写入：

```caddy
dock.example.com {
    reverse_proxy 127.0.0.1:4040
}
```

然后执行 `sudo systemctl reload caddy`。

**隧道（无需开放端口）**：用 Cloudflare Tunnel 或 Tailscale 指向 `http://127.0.0.1:4040`。

**直接监听网络（仅限可信内网，或前面已有你自己的 TLS）**：设置 `STATEDOCK_HOST=0.0.0.0`（见 3.4）。访问令牌绝不能在公网上以明文 HTTP 传输。

打开 `https://dock.example.com` 会看到登录页，粘贴 `sudo statedock token` 的输出即可。浏览器会保持登录 30 天。

### 3.4 修改配置

编辑 `/etc/statedock/statedock.env`，然后执行 `sudo systemctl restart statedock`：

```ini
PORT=4040
STATEDOCK_HOST=127.0.0.1
PUBLIC_BASE_URL=https://dock.example.com
# STATEDOCK_AGENT_TOKEN=...   可选：用固定令牌代替自动生成的
```

### 3.5 服务器模式与安全

只要监听地址不是本机回环，就会进入**服务器模式**：

* 所有页面、API 和 MCP 请求都需要访问令牌：浏览器在 `/login` 登录（HttpOnly cookie，HTTPS 下带 `Secure`），Agent 发送 `Authorization: Bearer <令牌>`；
* `/health` 和静态资源保持公开，便于监控；
* 设置了 `PUBLIC_BASE_URL` 后，其他域名的请求一律拒绝；
* 浏览器登录状态不能用于 MCP，Agent 始终需要 Bearer 令牌。

只有一个所有者、一个令牌，没有账号和角色。**轮换令牌**（所有浏览器登出、所有 Agent 断开）：`sudo rm /var/lib/statedock/agent_token && sudo systemctl restart statedock`，再用 `sudo statedock token` 查看新令牌。

### 3.6 升级

```sh
sudo statedock-ctl update
```

它会下载新版本并校验 checksum，停止服务，把数据库快照保存到 `/var/lib/statedock/backups/`，切换到新版本，最多等待 30 秒确认 `/health` 正常。如果不正常，会恢复快照、切回旧版本并重启。指定版本：`--version v0.1.0`。

### 3.7 卸载

```sh
sudo statedock-ctl uninstall           # 删除程序和服务，保留数据和配置
sudo statedock-ctl uninstall --purge   # 同时删除 /var/lib/statedock、配置和服务用户
```

卸载时 `statedock-ctl` 会把自己也删除；如果普通卸载后还想彻底清除，需要先重新安装一次。

### 3.8 日志

```sh
sudo statedock-ctl logs                # 最近 200 行
sudo journalctl -u statedock -f        # 实时查看
```

---

## 4. 使用 Docker

镜像 `ghcr.io/statedock/statedock`（x64 和 ARM64）就是服务器模式下的同一个程序，监听 3000 端口，数据在 `/data`。[`deploy/compose.yaml`](deploy/compose.yaml) 搭配 Caddy 提供 HTTPS：

```sh
git clone https://github.com/statedock/statedock-local.git
cd statedock-local/deploy
# 1. 把 Caddyfile 和 compose.yaml 里的 dock.example.com 改成你的域名
# 2. 启动
docker compose up -d
# 3. 获取访问令牌
docker compose exec statedock node dist/index.js token --no-open
```

升级：`docker compose pull && docker compose up -d`。备份：`docker compose exec statedock node dist/index.js backup --no-open`（写入 `./data/backups/`）。

**从旧的 `statedock-docker` 仓库迁移？** 数据库格式完全相同。保留 `./data` 目录，把 `statedock` 服务改为 `image: ghcr.io/statedock/statedock:latest`，加上 `PUBLIC_BASE_URL`，启动即可。原有的 `STATEDOCK_AGENT_TOKEN` 继续有效；Web 界面现在会在 `/login` 要求输入它。详见 [docs/server.md](docs/server.md#moving-from-the-statedock-docker-image)。

---

## 5. 连接 Coding Agent

需要两样东西：MCP 地址和访问令牌。

| StateDock 运行在 | MCP 地址 | 令牌 |
| :--- | :--- | :--- |
| 你的电脑 | `http://127.0.0.1:4040/mcp` | `~/.statedock/agent_token` 的内容 |
| Linux 服务器 | `https://dock.example.com/mcp` | `sudo statedock token` |
| Docker | `https://dock.example.com/mcp` | `docker compose exec statedock node dist/index.js token --no-open` |

可选的 `x-actor-name` 请求头用于在任务记录里标明是哪个 Agent（如 `claude-code`、`cursor`）。

**Claude Code**

```sh
claude mcp add --transport http statedock http://127.0.0.1:4040/mcp \
  --header "Authorization: Bearer <TOKEN>" --header "x-actor-name: claude-code"
```

**Cursor / Windsurf / Antigravity 等使用 JSON 配置的客户端**（如 `~/.cursor/mcp.json`）：

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

**DeepSeek Harness**（`@deepseek-ai/dsh-mcp-client`）：

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

连接后让 Agent 调用一次 `get_instance_info`，它应该返回你的 StateDock 地址。

---

## 6. 通知

Agent 完成任务（`submit_handoff`）或卡住（`pause_task`）时给你发消息。StateDock 只发出请求，不需要开放端口。

1. 打开控制台，点击顶部的铃铛（🔔）。
2. 添加渠道：**Bark**（iOS）、**ntfy**、**Discord** 或 **通用 Webhook**（Telegram 仅在 StateDock Cloud 中提供）。
3. 点击 **测试**，然后保存。

---

## 7. 命令行参考

```text
statedock [选项]             启动服务
statedock token              输出访问令牌 / Agent 令牌
statedock backup             生成一致的数据库快照并输出路径

-p, --port <端口>            端口（默认 4040；在电脑上被占用时自动顺延）
-d, --data-dir <目录>        数据目录（默认 ~/.statedock）
--host <地址>                监听地址（默认 127.0.0.1）；非本机地址开启服务器模式
--public-url <地址>          公网地址，例如 https://dock.example.com
--no-open                    不打开浏览器
-v, --version | -h, --help
```

环境变量：`PORT`、`STATEDOCK_HOST`、`PUBLIC_BASE_URL`、`STATEDOCK_DATA_DIR`（或 `DATA_DIR`）、`STATEDOCK_AGENT_TOKEN`。

用安装脚本装在服务器上时，`statedock` 已指向 `/var/lib/statedock`，需用 `sudo` 运行。

```text
statedock-ctl install | update | uninstall [--purge] | status | logs
```

---

## 8. 数据、备份与升级

所有数据都在数据目录里（电脑上是 `~/.statedock`，服务器上是 `/var/lib/statedock`，Docker 中是 `/data`）：

| 文件 | 用途 |
| :--- | :--- |
| `statedock.db`（以及 `-wal`、`-shm`） | SQLite 数据库，包含附件 |
| `agent_token` | 访问令牌 |
| `backups/` | `statedock backup` 和升级时生成的快照 |

* **备份**：`statedock backup` 即使在 StateDock 运行时也能生成一致的快照。不要在运行时手动复制 `statedock.db`，最近的改动可能还在 `-wal` 文件里。
* **在电脑、服务器和 Docker 之间迁移**：停止 StateDock，把 `statedock.db` 复制到新的数据目录，再启动。数据库迁移会自动执行，且只会向前升级。
* **导出/导入（JSON）**：`GET /api/system/export` 下载全部项目和任务；`POST /api/system/import` 导入该文件。服务器上需加 `-H "Authorization: Bearer <令牌>"`，例如 `curl -H "Authorization: Bearer $(sudo statedock token)" http://127.0.0.1:4040/api/system/export -o statedock.json`。
* **升级**：电脑上用新的压缩包替换程序文件夹（数据目录不受影响）；Linux 服务器上执行 `sudo statedock-ctl update`；Docker 拉取新镜像。新版本见 [Releases](https://github.com/statedock/statedock-local/releases)。

---

## 9. 常见问题

| 现象 | 解决 |
| :--- | :--- |
| `systemd is required`（WSL） | 执行 `printf '[boot]\nsystemd=true\n' \| sudo tee /etc/wsl.conf`，然后在 Windows PowerShell 运行 `wsl --shutdown`，重新打开 Ubuntu。 |
| `Service did not become healthy` | 用 `sudo journalctl -u statedock -n 100` 查看原因；常见是端口被占用，修改 `/etc/statedock/statedock.env` 里的 `PORT`。 |
| 浏览器显示 `Forbidden: Unauthorized Host header` | 访问用的地址既不是 `PUBLIC_BASE_URL` 也不是本机。改用配置的域名，或修正 `PUBLIC_BASE_URL`。 |
| Agent 收到 `401 unauthorized` | `Authorization: Bearer <令牌>` 缺失或错误；用 `statedock token` 获取当前令牌。 |
| 令牌泄露 | 按 3.5 轮换令牌，并更新各 Agent 的配置。 |
| 电脑上 4040 端口被占用 | StateDock 会自动使用下一个空闲端口并打印出来；也可以用 `--port` 指定。 |

---

## 10. 源码构建

```sh
git clone https://github.com/statedock/statedock-local.git
cd statedock-local
pnpm install          # Node >= 22，pnpm 9.15.4
pnpm test
pnpm build
pnpm start            # 或：node apps/local/dist/index.js --help
node scripts/package.mjs   # 发布包生成在 ./release-bundle
```

---

## 开源协议

StateDock Local 基于 [GNU Affero 通用公共许可证 v3.0（AGPL-3.0）](LICENSE) 开源。
