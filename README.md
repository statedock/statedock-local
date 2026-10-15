# StateDock Local

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)]()

> **轻量、免登录、开箱即用的个人任务调度引擎与 MCP 服务。**  
> **The lightweight, zero-login, self-contained personal task engine and MCP server.**

StateDock Local 是专为个人开发者与 Coding Agent（Cursor、DeepSeek Harness、Antigravity、Windsurf、Claude Code 等）打造的本地任务管理与协作中枢：

* 🚀 **下载即双击运行**：内置独立运行时与 SQLite 数据库，无需安装 Node.js、Docker 或配置外部数据库。
* 🖥️ **完整 Web/PWA 控制台**：复用官方 StateDock 交互界面，看板任务流、工作交付报告（handoff）、活动日志一览无余。
* 🤖 **开箱即用 MCP**：原生暴露 `/mcp` 端点，默认命名为 `statedock_local`，与远程或商业版配置互不冲突。
* 🔒 **本地纵深安全**：严格仅监听回环地址 `127.0.0.1`，内置 Host 白名单抵御 DNS 重绑定攻击，阻断网页跨站请求探测，自动生成专属本地 Agent 认证 Token。
* 📱 **手机通知单向外发**：支持向 **Bark**、**Telegram**、**Discord** 发送任务完成与阻塞决策通知，电脑无需公网 IP。
* 🔄 **一键自动更新**：后台静默检测 GitHub Releases，支持在 Web 界面或命令行一键原子化平滑替换升级。
* 📦 **数据完全自主**：数据保存在本地 `~/.statedock/`，支持全量 JSON 快照导出与导入，随时可无缝迁移至 StateDock Docker 或 Cloud 版本。

---

## 快速上手 / Quick Start

### 1. 下载与运行 (Download & Run)

从 [GitHub Releases](https://github.com/statedock/statedock-local/releases) 下载适合您操作系统的预打包压缩包：

* **macOS (Apple Silicon / Intel)**: `statedock-macos-arm64.tar.gz` / `statedock-macos-x64.tar.gz`
* **Windows (x64)**: `statedock-windows-x64.zip`
* **Linux (x64)**: `statedock-linux-x64.tar.gz`

#### 双击即用：
1. **解压** 下载的压缩包。
2. **启动**：
   * **macOS**：在 Finder 中直接双击 **`StateDock.command`**（或在终端运行 `./statedock`）。*(若 macOS 提示未签名，请在控制台或右键点击“打开”允许)*
   * **Windows**：直接双击 **`statedock.bat`**。
   * **Linux**：在终端运行 **`./statedock.sh`**。
3. **完成**：StateDock 会在终端打印 Agent 连接凭据，并**自动唤起默认浏览器**打开任务看板：`http://127.0.0.1:4040`。

---

### 2. 连接您的 Coding Agent (Connect Agent)

StateDock Local 启动时会自动在 `~/.statedock/agent_token` 生成专属访问令牌，并在终端打印出配置片段。

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

在您的 Agent MCP 配置文件中添加（服务名称建议使用 `statedock_local`）：

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

---

### 3. 配置手机通知 (Mobile Push Notifications)

您离开工位时，Agent 完成了任务（`submit_handoff`）或遇到阻塞等待您决策（`pause_task`）时，StateDock Local 能够直接给手机发送通知：

1. 打开浏览器控制台 `http://127.0.0.1:4040`。
2. 点击右上角 **通知铃铛 (🔔)** 图标。
3. 填入您的通知通道：
   * **Bark (iOS)**: 填入 Bark 设备 Key 或 URL（例如 `https://api.day.app/your_key`）。
   * **Telegram / Discord / Webhook**: 填入对应的 Bot Webhook 地址。
4. 点击 **[测试发送]** 确认手机能收到提醒，点击 **[保存设置]** 即可。

---

## 命令行参数 / CLI Options

如果您喜欢在终端中运行，支持以下常用选项：

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

## 自动更新 / Auto-Update

StateDock Local 会在后台静默检查 [GitHub Releases](https://github.com/statedock/statedock-local/releases) 最新版本：

* **Web 界面**：检测到新版本时，顶部会自动出现更新提示横幅并附带 Release Notes。点击 **[立即更新]**，程序会自动备份数据库、下载新版本、原子化替换二进制并安全重启。
* **安全保护**：跨平台验证 SHA256 校验和，更新前自动创建数据库快照，升级无忧。

---

## 本地编译与开发 / Building from Source

如果您是开发者并希望从源码运行：

```bash
# 1. 克隆代码仓库
git clone https://github.com/statedock/statedock-local.git
cd statedock-local

# 2. 安装依赖 (推荐 Node >= 22, pnpm >= 9.15.4)
pnpm install

# 3. 运行全套测试 (22 个测试用例，覆盖安全、数据迁移、MCP 交互)
pnpm test

# 4. 构建并本地启动
pnpm build
pnpm start
```

---

## 开源协议 / License

StateDock Local 采用 [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE) 协议完全开源。
