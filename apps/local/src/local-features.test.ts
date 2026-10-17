import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase, migrate } from "@statedock/db";
import { createRepository } from "@statedock/db/service";
import { StateDockService } from "@statedock/core";
import { SecurityManager } from "./security.js";
import { createApp } from "./app.js";
import { exportSnapshot, importSnapshot } from "./export-import.js";
import { getPlatformArch } from "./updater.js";

describe("StateDock Local Features", () => {
  test("SecurityManager creates and validates agent token", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "statedock-test-sec-"));
    try {
      const sec = new SecurityManager({ port: 4040, dataDir: tmpDir });
      const token = sec.getAgentToken();
      assert.ok(token && token.startsWith("sd_local_"), "Token should have sd_local_ prefix");

      assert.equal(sec.verifyAgentToken(`Bearer ${token}`), true);
      assert.equal(sec.verifyAgentToken("Bearer invalid_token"), false);
      assert.equal(sec.verifyAgentToken(undefined), false);

      // Re-initialization should load the same token from disk
      const sec2 = new SecurityManager({ port: 4040, dataDir: tmpDir });
      assert.equal(sec2.getAgentToken(), token);
    } finally {
      try {
        rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {}
    }
  });

  test("Platform and architecture detection", () => {
    const { platform, arch } = getPlatformArch();
    assert.ok(["macos", "windows", "linux"].includes(platform));
    assert.ok(["arm64", "x64"].includes(arch));
  });

  test("Local App zero-login and security endpoints", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "statedock-test-app-"));
    try {
      const dbUrl = `file:${join(tmpDir, "test.db")}`;
      const { client, db } = createDatabase(dbUrl);
      await migrate(client);

      const securityManager = new SecurityManager({ port: 4040, dataDir: tmpDir });
      const app = createApp(new StateDockService(createRepository(db)), {
        securityManager,
        client,
        dataDir: tmpDir,
        backupsDir: join(tmpDir, "backups"),
      });

      // 1. Setup status is always initialized
      const setupRes = await app.request("/api/setup/status", {
        headers: { host: "localhost:4040" },
      });
      assert.equal(setupRes.status, 200);
      const setupJson = (await setupRes.json()) as any;
      assert.equal(setupJson.initialized, true);
      assert.equal(setupJson.mode, "local");

      // 2. Instance info
      const infoRes = await app.request("/api/instance/info", {
        headers: { host: "localhost:4040" },
      });
      assert.equal(infoRes.status, 200);
      const infoJson = (await infoRes.json()) as any;
      assert.equal(infoJson.mode, "local");
      assert.equal(infoJson.mcpUrl, "http://127.0.0.1:4040/mcp");

      // 3. MCP endpoint requires valid Bearer token
      const mcpUnauthorized = await app.request("/mcp", {
        method: "POST",
        headers: { host: "localhost:4040" },
      });
      assert.equal(mcpUnauthorized.status, 401);

      // 4. DNS rebinding rejection (invalid Host)
      const badHostRes = await app.request("/api/setup/status", {
        headers: { host: "evil-site.com" },
      });
      assert.equal(badHostRes.status, 403);

      // 5. Cross-site request rejection
      const crossSiteRes = await app.request("/api/projects", {
        headers: {
          host: "localhost:4040",
          "sec-fetch-site": "cross-site",
        },
      });
      assert.equal(crossSiteRes.status, 403);

      // 6. Snapshot Export and Import
      const exportRes = await app.request("/api/system/export", {
        headers: { host: "localhost:4040" },
      });
      assert.equal(exportRes.status, 200);
      const snapshot = (await exportRes.json()) as any;
      assert.equal(snapshot.version, "1.0");
      assert.ok(Array.isArray(snapshot.data.projects));

      // Import test
      const importRes = await app.request("/api/system/import", {
        method: "POST",
        headers: {
          host: "localhost:4040",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(snapshot),
      });
      assert.equal(importRes.status, 200);
    } finally {
      try {
        rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {}
    }
  });

  test("Server mode requires the token or a signed session and accepts the public host", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "statedock-test-server-"));
    try {
      const { client, db } = createDatabase(`file:${join(tmpDir, "test.db")}`);
      await migrate(client);
      const securityManager = new SecurityManager({
        port: 3000,
        dataDir: tmpDir,
        serverMode: true,
        publicOrigin: "https://dock.example.com",
      });
      const app = createApp(new StateDockService(createRepository(db)), {
        securityManager,
        client,
        dataDir: tmpDir,
        backupsDir: join(tmpDir, "backups"),
      });
      const host = { host: "dock.example.com" };
      const token = securityManager.getAgentToken();

      // Health stays open for probes; API, MCP and pages do not.
      assert.equal((await app.request("/health", { headers: host })).status, 200);
      assert.equal((await app.request("/api/projects", { headers: host })).status, 401);
      assert.equal((await app.request("/mcp", { method: "POST", headers: host })).status, 401);
      const page = await app.request("/", { headers: host });
      assert.equal(page.status, 302);
      assert.ok(page.headers.get("location")?.startsWith("/login"));

      // Unknown hosts are still rejected when a public URL is configured.
      assert.equal(
        (await app.request("/health", { headers: { host: "evil.example.net" } })).status,
        403,
      );

      // Bearer token works for API clients.
      const bearer = await app.request("/api/projects", {
        headers: { ...host, Authorization: `Bearer ${token}` },
      });
      assert.equal(bearer.status, 200);

      // Wrong token is refused; right token yields a session cookie that unlocks the API.
      const bad = await app.request("/login", {
        method: "POST",
        headers: { ...host, "Content-Type": "application/x-www-form-urlencoded" },
        body: "token=wrong",
      });
      assert.equal(bad.status, 401);
      const login = await app.request("/login?next=%2Fprojects", {
        method: "POST",
        headers: { ...host, "Content-Type": "application/x-www-form-urlencoded" },
        body: `token=${encodeURIComponent(token)}`,
      });
      assert.equal(login.status, 302);
      assert.equal(login.headers.get("location"), "/projects");
      const cookie = login.headers.get("set-cookie") ?? "";
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /Secure/i);
      const session = cookie.split(";")[0];
      const withSession = await app.request("/api/projects", {
        headers: { ...host, cookie: session, origin: "https://dock.example.com" },
      });
      assert.equal(withSession.status, 200);

      // A session cookie alone never authorizes MCP.
      assert.equal(
        (await app.request("/mcp", { method: "POST", headers: { ...host, cookie: session } }))
          .status,
        401,
      );
    } finally {
      try {
        rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {}
    }
  });

  test("Loopback mode stays zero-login", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "statedock-test-loop-"));
    try {
      const { client, db } = createDatabase(`file:${join(tmpDir, "test.db")}`);
      await migrate(client);
      const securityManager = new SecurityManager({ port: 4040, dataDir: tmpDir });
      const app = createApp(new StateDockService(createRepository(db)), {
        securityManager,
        client,
        dataDir: tmpDir,
        backupsDir: join(tmpDir, "backups"),
      });
      const res = await app.request("/api/projects", { headers: { host: "localhost:4040" } });
      assert.equal(res.status, 200);
      assert.equal(
        (await app.request("/api/projects", { headers: { host: "dock.example.com" } })).status,
        403,
      );
    } finally {
      try {
        rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {}
    }
  });
});
