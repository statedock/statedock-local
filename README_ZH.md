# StateDock Local (本地免登录版)

<p align="center">
  <a href="README.md"><b>English</b></a> | <a href="README_ZH.md"><b>简体中文</b></a>
</p>

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)]()
[![GitHub release](https://img.shields.io/github/v/release/statedock/statedock-local)](https://github.com/statedock/statedock-local/releases)

> **轻量、免登录、开箱即用的个人任务调度引擎与 MCP 服务。**

StateDock Local 是专为个人开发者与 Coding Agent（**DeepSeek Harness**、**Cursor**、**Antigravity**、**Claude Code**、**Windsurf** 等）打造的本地任务协作中枢：

* 🚀 **下载解压，双击即用**：压缩包内已完整内置独立运行时与 SQLite 数据库。电脑无需安装 Node.js、Docker 或配置外部数据库，开箱即跑。
* 🖥️ **完整 Web/PWA 控制台**：复用官方 StateDock 交互界面，看板任务流、工作交付报告（handoff）、活动日志一览无余。
* 🤖 **原生 MCP 服务**：开箱即用暴露 `/mcp` 端点，默认服务器名称为 `statedock_local`，绝不与任何远程或商业部署产生命名冲突。
* 🔒 **本地纵深安全**：严格仅绑定回环地址 `127.0.0.1`，内置 Host 白名单阻断 DNS 重绑定攻击，拒绝跨站探测请求，自动生成高强度本地 Agent 认证 Token。
* 📱 **手机通知单向外发**：支持向 **Bark**、**Telegram**、**Discord** 发送任务完成与阻塞决策通知，电脑无需公网 IP，离席也能掌握 Agent 进展。
* 🔄 **一键自动更新**：后台静默检测 GitHub Releases，支持在 Web 界面或命令行一键备份、原子替换与平滑重启。
* 📦 **数据完全自主**：所有数据均保存在本地 `~/.statedock/`，支持全量 JSON 快照导出与导入，随时可无缝迁移至 StateDock Docker 或 Cloud 版本。

---

## 快速上手

### 1. 下载与运行

从 [GitHub Releases](https://github.com/statedock/statedock-local/releases) 下载适合您操作系统的预打包压缩包：

| 操作系统 | 下载文件 | 运行方式 |
| :--- | :--- | :--- |
| **macOS (Apple Silicon)** | `statedock-macos-arm64.tar.gz` | 解压后双击 **`StateDock.command`**（或在终端运行 `./statedock`） |
| **macOS (Intel)** | `statedock-macos-x64.tar.gz` | 解压后双击 **`StateDock.command`**（或在终端运行 `./statedock`） |
| **Windows (x64)** | `statedock-windows-x64.zip` | 解压后双击 **`statedock.bat`** |
| **Linux (x64)** | `statedock-linux-x64.tar.gz` | 解压后在终端运行 **`./statedock.sh`** |

启动后：
1. StateDock 自动初始化本地数据库 `~/.statedock/statedock.db`；
2. 自动生成专属 Agent Token 并保存在 `~/.statedock/agent_token`；
3. 监听并在终端显示 `http://127.0.0.1:4040`；
4. **自动唤起系统默认浏览器**打开 StateDock 任务看板。

> **macOS 首次运行提示**：如果 macOS 弹出“无法打开，因为无法验证开发者”，请在 Finder 中对 `StateDock.command` 点击右键选择“打开”，或在“系统设置 -> 隐私与安全性”中点击“仍要打开”。

---

### 2. 连接您的 Coding Agent

StateDock Local 启动时会在终端打印 Agent 连接配置代码段。

#### 方案 A：DeepSeek Harness (YAML 格式)

在 DeepSeek Harness 的 MCP 插件配置中添加：

```yaml
- id: mcp-statedock-local
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: statedock_local
    transport: streamable-http
    url: http://127.0.0.1:4040/mcp
    headers:
      Authorization: 'Bearer <TOKEN_IN_~/.statedock/agent_token>'
      x-actor-name: 'harness'
      x-actor-id: 'agent:harness'
    failOnStartupError: false
```

#### 方案 B：Cursor / Antigravity / Windsurf / Claude Code (JSON 格式)

在您的 Agent MCP 配置文件（例如 `~/.cursor/mcp.json`）中添加：

```json
{
  "mcpServers": {
    "statedock_local": {
      "url": "http://127.0.0.1:4040/mcp",
      "headers": {
        "Authorization": "Bearer <TOKEN_IN_~/.statedock/agent_token>",
        "x-actor-name": "cursor",
        "x-actor-id": "agent:cursor"
      }
    }
  }
}
```

> **提示**：带上 `x-actor-name` 标头后，Agent 创建任务、更新状态和记录交付结果时，都会在 Web 看板中准确显示为该 Agent 提交。

---

### 3. 配置手机推送通知

当您离开电脑时，Agent 如果完成了任务（`submit_handoff`）或遇到阻塞需要您决策（`pause_task`），StateDock Local 可以直接给手机发送通知：

1. 打开浏览器控制台 `http://127.0.0.1:4040`；
2. 点击右上角 **通知铃铛 (🔔)** 图标；
3. 填入您的通知参数：
   * **Bark (iOS)**: 填入 Bark 设备 Key 或 URL（例如 `https://api.day.app/your_key`）；
   * **Telegram / Discord / 自定义 Webhook**: 填入 Webhook 地址；
4. 点击 **[测试发送]** 确认手机能收到提醒，点击 **[保存设置]** 即可。

---

## 命令行参数 (CLI)

支持常用命令行启动参数：

```text
Usage:
  statedock [options]

Options:
  -p, --port <port>       指定 HTTP/MCP 监听端口 (默认: 4040，端口被占会自动递增)
  -d, --data-dir <dir>    指定数据与配置存放目录 (默认: ~/.statedock)
  --no-open               启动时不自动唤起默认浏览器
  -v, --version           显示版本号
  -h, --help              查看帮助说明
```

---

## 自动更新机制

StateDock Local 会在后台静默检查 [GitHub Releases](https://github.com/statedock/statedock-local/releases) 的新版本：

* **Web 提示**：检测到新版本后，页面顶部出现更新提示横幅与 Release Notes。
* **安全平滑**：点击 **[立即更新]**，程序会自动备份数据库、下载新版本压缩包、校验 SHA256 哈希值、原子替换程序文件并自动平滑重启。

---

## 源码构建与开发

如果您希望从源码自行构建或二次开发：

```bash
# 1. 克隆代码仓库
git clone https://github.com/statedock/statedock-local.git
cd statedock-local

# 2. 安装依赖 (推荐 Node >= 22, pnpm >= 9.15.4)
pnpm install

# 3. 运行全套单元与集成测试
pnpm test

# 4. 构建并启动本地服务
pnpm build
pnpm start
```

---

## 开源协议

StateDock Local 采用 [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE) 开源协议。
