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
      rmSync(tmpDir, { recursive: true, force: true });
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
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
