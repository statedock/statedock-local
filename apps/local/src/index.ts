#!/usr/bin/env node
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { StateDockService } from "@statedock/core";
import { createDatabase, migrate } from "@statedock/db";
import { createRepository } from "@statedock/db/service";
import { existsSync } from "node:fs";
import { createServer as createNetServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { openBrowser } from "./browser.js";
import { SecurityManager } from "./security.js";
import { backupDatabase, initStorageConfig } from "./storage.js";
import { CURRENT_VERSION } from "./updater.js";

// Parse basic CLI arguments
const args = process.argv.slice(2);
let customPort: number | null = null;
let noOpen = false;
let customDataDir: string | undefined = undefined;
let host = process.env.STATEDOCK_HOST || "127.0.0.1";
let publicUrl = process.env.PUBLIC_BASE_URL || undefined;
// Subcommands: `statedock token` prints the access token, `statedock backup` writes a
// consistent snapshot (VACUUM INTO) to <data-dir>/backups and prints its path.
const command = args[0] === "token" || args[0] === "backup" ? args.shift() : undefined;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "-v" || arg === "--version") {
    console.log(`StateDock Local v${CURRENT_VERSION}`);
    process.exit(0);
  }
  if (arg === "-h" || arg === "--help") {
    console.log(`
StateDock Local (v${CURRENT_VERSION})
Lightweight personal task engine & MCP server

Usage:
  statedock [options]

Options:
  -p, --port <port>       Port to listen on (default: 4040)
  -d, --data-dir <dir>    Directory for database and tokens (default: ~/.statedock)
  --host <addr>           Address to listen on (default: 127.0.0.1). Any non-loopback
                          address enables server mode: sign-in and Bearer token required.
  --public-url <url>      Public origin, e.g. https://dock.example.com (remote MCP links)
  --no-open               Do not automatically open the default browser

Commands:
  statedock token         Print the access / agent token and exit
  statedock backup        Write a consistent database backup and print its path

Environment: PORT, STATEDOCK_HOST, PUBLIC_BASE_URL, STATEDOCK_DATA_DIR (or DATA_DIR)
  -v, --version           Show version number
  -h, --help              Show this help message
`);
    process.exit(0);
  }
  if ((arg === "-p" || arg === "--port") && args[i + 1]) {
    customPort = parseInt(args[++i], 10);
  }
  if (arg === "--no-open") {
    noOpen = true;
  }
  if ((arg === "-d" || arg === "--data-dir") && args[i + 1]) {
    customDataDir = args[++i];
  }
  if (arg === "--host" && args[i + 1]) {
    host = args[++i];
  }
  if (arg === "--public-url" && args[i + 1]) {
    publicUrl = args[++i];
  }
}

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);
const serverMode = !LOOPBACK.has(host);
if (publicUrl) {
  try {
    publicUrl = new URL(publicUrl).origin;
  } catch {
    console.error(`[StateDock] Invalid --public-url: ${publicUrl}`);
    process.exit(1);
  }
}

async function findAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolvePort) => {
    const s = createNetServer();
    s.listen(startPort, host, () => {
      s.close(() => resolvePort(startPort));
    });
    s.on("error", () => {
      resolvePort(findAvailablePort(startPort + 1));
    });
  });
}

function resolveWebRoot(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(currentDir, "../../web/dist"),
    resolve(currentDir, "../web/dist"),
    resolve(currentDir, "./web/dist"),
    resolve(process.cwd(), "apps/web/dist"),
    resolve(process.cwd(), "web/dist"),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) {
      return c;
    }
  }
  return candidates[0];
}

async function main() {
  const defaultPort = customPort || Number(process.env.PORT ?? 4040);
  const storage = initStorageConfig(customDataDir);

  if (command === "token") {
    console.log(
      new SecurityManager({ port: defaultPort, dataDir: storage.dataDir }).getAgentToken(),
    );
    return;
  }

  // A service keeps a fixed port so reverse proxies and agents can rely on it.
  const port = serverMode ? defaultPort : await findAvailablePort(defaultPort);
  process.env.DATABASE_URL = storage.databaseUrl;

  const { client, db } = createDatabase(storage.databaseUrl);

  // SQLite WAL and concurrency settings
  await client.execute("PRAGMA journal_mode = WAL");
  await client.execute("PRAGMA busy_timeout = 5000");
  await client.execute("PRAGMA synchronous = NORMAL");

  if (command === "backup") {
    const result = await backupDatabase(client, storage.backupsDir);
    console.log(result.path);
    return;
  }

  // Database migrations
  await migrate(client);

  // Ensure default project exists so the initial UI is ready to use
  const countRes = await client.execute("SELECT count(*) as count FROM projects");
  const count = Number(countRes.rows[0]?.count ?? 0);
  if (count === 0) {
    const now = new Date().toISOString();
    await client.execute({
      sql: "INSERT INTO projects (id, slug, name, description, local_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [
        "workspace-default",
        "default",
        "Personal Workspace",
        "Default workspace for local development",
        process.cwd(),
        now,
        now,
      ],
    });
  }

  // Security Manager (generates/reads ~/.statedock/agent_token)
  const securityManager = new SecurityManager({
    port,
    dataDir: storage.dataDir,
    serverMode,
    publicOrigin: publicUrl,
  });

  const app = createApp(new StateDockService(createRepository(db)), {
    securityManager,
    client,
    dataDir: storage.dataDir,
    backupsDir: storage.backupsDir,
  });

  // Serve Web PWA static assets
  const webRoot = resolveWebRoot();
  if (existsSync(webRoot)) {
    app.get("/assets/*", serveStatic({ root: webRoot }));
    app.get("/icons/*", serveStatic({ root: webRoot }));
    app.get("/logo.png", serveStatic({ root: webRoot, path: "logo.png" }));
    app.get("/big-logo.png", serveStatic({ root: webRoot, path: "big-logo.png" }));
    app.get("/apple-touch-icon.png", serveStatic({ root: webRoot, path: "apple-touch-icon.png" }));
    app.get(
      "/apple-touch-icon-precomposed.png",
      serveStatic({ root: webRoot, path: "apple-touch-icon-precomposed.png" }),
    );
    app.get("/offline.html", serveStatic({ root: webRoot, path: "offline.html" }));
    app.get("/doc.md", serveStatic({ root: webRoot, path: "doc.md" }));
    app.get("/doc.zh.md", serveStatic({ root: webRoot, path: "doc.zh.md" }));
    app.get("/favicon.ico", serveStatic({ root: webRoot, path: "favicon.ico" }));
    app.get("/manifest.webmanifest", serveStatic({ root: webRoot, path: "manifest.webmanifest" }));
    app.get("/sw.js", serveStatic({ root: webRoot, path: "sw.js" }));
    app.get("/", serveStatic({ root: webRoot, path: "index.html" }));
    // Wildcard fallback for SPA client-side routing
    app.get("*", serveStatic({ root: webRoot, path: "index.html" }));
  }

  // Start loopback listener
  serve(
    {
      fetch: app.fetch,
      port,
      hostname: host,
    },
    (info) => {
      const url = publicUrl ?? `http://${serverMode ? host : "127.0.0.1"}:${info.port}`;
      const token = securityManager.getAgentToken();

      console.log("\n" + "=".repeat(66));
      console.log(`  StateDock Local v${CURRENT_VERSION} is running!`);
      console.log("=".repeat(66));
      console.log(`  Web Dashboard:  ${url}`);
      console.log(`  MCP Endpoint:   ${url}/mcp`);
      console.log(`  Data Directory: ${storage.dataDir}`);
      console.log(`  Database File:  ${storage.databaseUrl}`);
      console.log(`  Agent Token:    ${join(storage.dataDir, "agent_token")}`);
      if (serverMode) {
        console.log("  Server mode:    sign-in required (statedock token prints the access token)");
        if (!publicUrl?.startsWith("https://"))
          console.log(
            "  WARNING: no HTTPS public URL; put Caddy or a tunnel in front before exposing it.",
          );
      }
      console.log("-".repeat(66));
      console.log("  Coding Agent MCP Configuration (Cursor / Antigravity):");
      console.log(
        JSON.stringify(
          {
            mcpServers: {
              statedock_local: {
                url: `${url}/mcp`,
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              },
            },
          },
          null,
          2,
        )
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n"),
      );
      console.log("=".repeat(66) + "\n");

      if (!noOpen && !serverMode) {
        openBrowser(url);
      }
    },
  );
}

main().catch((err) => {
  console.error("[StateDock Local] Fatal initialization error:", err);
  process.exit(1);
});
