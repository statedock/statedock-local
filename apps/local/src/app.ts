import {
  actorSchema,
  ConflictError,
  createPlanSchema,
  createProjectSchema,
  fileSchema,
  handoffSchema,
  NotFoundError,
  planCreationMessage,
  planStatuses,
  StateDockService,
  updatePlanSchema,
  updateProjectSchema,
} from "@statedock/core";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { Buffer } from "node:buffer";
import { z, ZodError } from "zod";
import type { Client } from "@libsql/client";
import { handleMcpRequest } from "./mcp-handler.js";
import { SecurityManager } from "./security.js";
import { registerLoginRoutes, serverAuthMiddleware } from "./server-auth.js";
import { backupDatabase } from "./storage.js";
import { applyUpdate, checkUpdate, CURRENT_VERSION } from "./updater.js";
import { exportSnapshot, importSnapshot } from "./export-import.js";
import { NotificationManager } from "./notifications.js";

export interface AppOptions {
  securityManager: SecurityManager;
  notificationManager?: NotificationManager;
  client: Client;
  dataDir: string;
  backupsDir: string;
  publicOrigin?: string;
}

export function createApp(service: StateDockService, options: AppOptions) {
  const app = new Hono<{ Variables: { actor: import("@statedock/core").Actor } }>();
  const notificationManager =
    options.notificationManager ?? new NotificationManager(options.dataDir);

  // 1. Host Validation (Prevent DNS Rebinding)
  app.use("*", options.securityManager.hostValidationMiddleware());

  // 1b. Server mode: everything beyond static assets needs the token or a signed web session.
  app.use("*", serverAuthMiddleware(options.securityManager));
  registerLoginRoutes(app, options.securityManager);

  // 2. Origin & Sec-Fetch-Site Validation for API routes (Prevent cross-site probing)
  app.use("/api/*", options.securityManager.originValidationMiddleware());

  // 3. MCP Endpoint for Coding Agents
  app.all("/mcp", async (c) => {
    const authHeader = c.req.header("Authorization");
    const isTokenValid = options.securityManager.verifyAgentToken(authHeader);

    if (!isTokenValid) {
      return c.json(
        {
          error: "unauthorized",
          message: "Invalid or missing Agent Bearer token. Please check ~/.statedock/agent_token.",
        },
        401,
      );
    }

    const actor = actorSchema.parse({
      id: "agent:local",
      type: "agent",
      name: c.req.header("x-actor-name") ?? "Coding Agent",
    });

    const publicOrigin =
      options.publicOrigin ||
      options.securityManager.publicOrigin ||
      `http://127.0.0.1:${options.securityManager.getPort()}`;
    return handleMcpRequest(service, actor, c.req.raw, publicOrigin);
  });

  // 4. System & Version Management Endpoints
  app.get("/api/system/version", async (c) => {
    const force = c.req.query("force") === "true";
    const info = await checkUpdate(force);
    return c.json({ data: info });
  });

  app.post("/api/system/update", async (c) => {
    // Hot backup before update
    try {
      await backupDatabase(options.client, options.backupsDir);
    } catch (err) {
      console.warn("[StateDock Local] Pre-update backup failed:", err);
    }

    const result = await applyUpdate(options.dataDir);
    if (!result.success) {
      return c.json({ error: "update_failed", message: result.message }, 500);
    }
    return c.json({ ok: true, message: result.message });
  });

  // 5. Project Snapshot Export & Import
  app.get("/api/system/export", async (c) => {
    const snapshot = await exportSnapshot(options.client);
    const filename = `statedock-export-${new Date().toISOString().slice(0, 10)}.json`;
    return new Response(JSON.stringify(snapshot, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  });

  app.post("/api/system/import", async (c) => {
    try {
      const body = await c.req.json();
      const result = await importSnapshot(options.client, body);
      return c.json({ ok: true, data: result });
    } catch (err: any) {
      return c.json({ error: "import_failed", message: err.message }, 400);
    }
  });

  // 6. Auth session endpoint: return 404 so Frontend activates local mode
  app.get("/api/auth/session", (c) => {
    return c.json({ error: "not_found", mode: "local" }, 404);
  });

  // 7. Setup status (Always initialized in Local mode, zero-login)
  app.get("/api/setup/status", (c) => {
    return c.json({ initialized: true, mode: "local", version: CURRENT_VERSION });
  });

  // 7. Instance info
  app.get("/api/instance/info", (c) => {
    const port = options.securityManager.getPort();
    const origin = options.securityManager.publicOrigin ?? `http://127.0.0.1:${port}`;
    return c.json({
      mode: options.securityManager.serverMode ? "server" : "local",
      version: CURRENT_VERSION,
      publicOrigin: origin,
      mcpUrl: `${origin}/mcp`,
    });
  });

  // 8. Online SQLite hot backup endpoint
  app.post("/api/admin/backup", async (c) => {
    try {
      const result = await backupDatabase(options.client, options.backupsDir);
      return c.json({ ok: true, data: result });
    } catch (err: any) {
      console.error("Backup failed", err);
      return c.json({ error: "backup_failed", message: err.message }, 500);
    }
  });

  // 9. Actor Middleware: Default to Local Developer
  app.use("*", async (c, next) => {
    c.set(
      "actor",
      actorSchema.parse({
        id: c.req.header("x-actor-id") ?? "local-user",
        type: c.req.header("x-actor-type") ?? "human",
        name: c.req.header("x-actor-name") ?? "Local Developer",
      }),
    );
    await next();
  });

  // 10. Error Handlers
  app.onError((error, c) => {
    if (error instanceof SyntaxError) return c.json({ error: "invalid_json" }, 400);
    if (error instanceof ZodError)
      return c.json({ error: "validation_error", details: error.flatten() }, 400);
    if (error instanceof NotFoundError)
      return c.json({ error: "not_found", message: error.message }, 404);
    if (error instanceof ConflictError)
      return c.json({ error: "conflict", message: error.message }, 409);
    console.error(error);
    return c.json({ error: "internal_error" }, 500);
  });

  // 11. Core Task and Project Endpoints
  app.use(
    "/api/plans/:reference/attachments",
    bodyLimit({
      maxSize: 10 * 1024 * 1024,
      onError: (c) => c.json({ message: "Attachment must not exceed 10 MB." }, 413),
    }),
  );

  app.get("/api/plans/:reference/attachments", async (c) =>
    c.json({ data: await service.listAttachments({ reference: c.req.param("reference") }) }),
  );

  app.post("/api/plans/:reference/attachments", async (c) => {
    const bytes = await c.req.arrayBuffer();
    return c.json(
      {
        data: await service.writeAttachment(
          { reference: c.req.param("reference") },
          {
            name: decodeURIComponent(c.req.header("x-file-name") ?? "file"),
            mimeType: c.req.header("content-type"),
            data: Buffer.from(bytes).toString("base64"),
          },
          c.get("actor"),
        ),
      },
      201,
    );
  });

  app.get("/api/attachments/:id", async (c) => {
    const row = await service.readAttachment(c.req.param("id"));
    return new Response(Buffer.from(row.data, "base64"), {
      headers: {
        "Content-Type": row.mimeType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  });

  app.delete("/api/attachments/:id", async (c) => {
    await service.deleteAttachment(c.req.param("id"), c.get("actor"));
    return c.body(null, 204);
  });

  app.get("/api/plans/:reference/reviews", async (c) =>
    c.json({ data: await service.listReviews({ reference: c.req.param("reference") }) }),
  );

  app.post("/api/plans/:reference/reviews", async (c) =>
    c.json(
      {
        data: await service.addReview(
          { reference: c.req.param("reference") },
          await c.req.json(),
          c.get("actor"),
        ),
      },
      201,
    ),
  );

  app.get("/api/plans/:reference/feedback", async (c) =>
    c.json({ data: await service.listFeedback({ reference: c.req.param("reference") }) }),
  );

  app.post("/api/plans/:reference/feedback", async (c) =>
    c.json(
      {
        data: await service.addFeedback(
          { reference: c.req.param("reference") },
          await c.req.json(),
          c.get("actor"),
        ),
      },
      201,
    ),
  );

  app.get("/api/plans/:reference", async (c) =>
    c.json({ data: await service.resolvePlan({ reference: c.req.param("reference") }) }),
  );

  app.post("/api/plans/:reference/start", async (c) =>
    c.json({
      data: await service.startPlan({ reference: c.req.param("reference") }, c.get("actor")),
    }),
  );

  app.post("/api/plans/:reference/move", async (c) => {
    const { targetProject } = z
      .object({ targetProject: z.string().min(1) })
      .parse(await c.req.json());
    return c.json({
      data: await service.movePlan(
        { reference: c.req.param("reference") },
        targetProject,
        c.get("actor"),
      ),
    });
  });

  app.post("/api/plans/:reference/pause", async (c) => {
    const { reason } = z.object({ reason: z.string().min(1) }).parse(await c.req.json());
    const data = await service.pauseTask(
      { reference: c.req.param("reference") },
      reason,
      c.get("actor"),
    );
    void notificationManager.dispatchNotification(
      `StateDock: 任务等待 (${c.req.param("reference")})`,
      `阻塞原因: ${reason}`,
    );
    return c.json({ data });
  });

  app.post("/api/plans/:reference/handoff", async (c) => {
    const body = handoffSchema.parse(await c.req.json());
    const data = await service.submitHandoff(
      { reference: c.req.param("reference") },
      body,
      c.get("actor"),
    );
    void notificationManager.dispatchNotification(
      `StateDock: 任务完成 (${c.req.param("reference")})`,
      data.summary || body.changes || "Agent 已完成任务并提交成果",
    );
    return c.json({ data });
  });

  app.get("/api/plan-events", async (c) =>
    c.json({
      data: await service.listPlanEvents(
        c.req.query("after") === undefined
          ? undefined
          : z.coerce.number().int().nonnegative().safe().parse(c.req.query("after")),
        c.req.query("limit") === undefined
          ? 100
          : z.coerce.number().int().min(1).max(200).parse(c.req.query("limit")),
      ),
    }),
  );

  app.get("/health", (c) => c.json({ status: "ok" }));
  app.get("/api/projects", async (c) => c.json({ data: await service.listProjects() }));

  app.post("/api/projects", async (c) =>
    c.json(
      {
        data: await service.createProject(
          createProjectSchema.parse(await c.req.json()),
          c.get("actor"),
        ),
      },
      201,
    ),
  );

  app.get("/api/projects/:project", async (c) =>
    c.json({ data: await service.getProject(c.req.param("project")) }),
  );

  app.get("/api/projects/:project/resume", async (c) =>
    c.json({ data: await service.resumeProject(c.req.param("project")) }),
  );

  app.post("/api/projects/:project/claim-next", async (c) =>
    c.json({ data: await service.claimNextTask(c.req.param("project"), c.get("actor")) }),
  );

  app.patch("/api/projects/:project", async (c) =>
    c.json({
      data: await service.updateProject(
        c.req.param("project"),
        updateProjectSchema.parse(await c.req.json()),
        c.get("actor"),
      ),
    }),
  );

  app.delete("/api/projects/:project", async (c) => {
    await service.deleteProject(c.req.param("project"), c.get("actor"));
    return c.body(null, 204);
  });

  app.get("/api/projects/:project/plans", async (c) => {
    const status = c.req.query("status");
    const parsed = status ? z.enum(planStatuses).parse(status) : undefined;
    return c.json({ data: await service.listPlans(c.req.param("project"), parsed) });
  });

  app.post("/api/projects/:project/plans", async (c) => {
    const plan = await service.createPlan(
      c.req.param("project"),
      createPlanSchema.parse(await c.req.json()),
      c.get("actor"),
    );
    return c.json(
      {
        data: {
          ...plan,
          creationMessage: planCreationMessage(plan),
          startPrompt: plan.status === "PLAN" ? `开始 ${plan.reference}` : null,
        },
      },
      201,
    );
  });

  app.get("/api/projects/:project/plans/:number", async (c) =>
    c.json({
      data: await service.getPlan(
        c.req.param("project"),
        z.coerce.number().int().positive().parse(c.req.param("number")),
      ),
    }),
  );

  app.patch("/api/projects/:project/plans/:number", async (c) =>
    c.json({
      data: await service.updatePlan(
        c.req.param("project"),
        z.coerce.number().int().positive().parse(c.req.param("number")),
        updatePlanSchema.parse(await c.req.json()),
        c.get("actor"),
      ),
    }),
  );

  app.get("/api/projects/:project/files", async (c) =>
    c.json({ data: await service.listFiles(c.req.param("project")) }),
  );

  app.get("/api/projects/:project/files/*", async (c) =>
    c.json({
      data: await service.getFile(
        c.req.param("project"),
        decodeURIComponent(c.req.path.split("/files/")[1] ?? ""),
      ),
    }),
  );

  app.put("/api/projects/:project/files", async (c) => {
    const b = fileSchema.parse(await c.req.json());
    return c.json({
      data: await service.writeFile(c.req.param("project"), b.path, b.content, c.get("actor")),
    });
  });

  app.get("/api/projects/:project/activity", async (c) =>
    c.json({
      data: await service.listActivity(
        c.req.param("project"),
        z.coerce
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .parse(c.req.query("limit") ?? "50"),
      ),
    }),
  );

  app.delete("/api/projects/:project/files/*", async (c) => {
    await service.deleteFile(
      c.req.param("project"),
      decodeURIComponent(c.req.path.split("/files/")[1] ?? ""),
      c.get("actor"),
    );
    return c.body(null, 204);
  });

  app.post("/api/projects/:project/activity", async (c) => {
    await service.appendActivity(c.req.param("project"), await c.req.json(), c.get("actor"));
    return c.body(null, 201);
  });

  // 12. Notification Endpoints (Bark, ntfy, Discord, Webhook, Telegram)
  app.get("/api/auth/notifications/bark", (c) => c.json({ data: notificationManager.listBark() }));
  app.post("/api/auth/notifications/bark", async (c) => {
    const body = await c.req.json();
    return c.json({ data: notificationManager.addBark(body) }, 201);
  });
  app.delete("/api/auth/notifications/bark/:id", (c) => {
    notificationManager.deleteBark(c.req.param("id"));
    return c.body(null, 204);
  });
  app.post("/api/auth/notifications/bark/:id/test", async (c) => {
    try {
      await notificationManager.testBark(c.req.param("id"));
      return c.json({ ok: true });
    } catch (err: any) {
      return c.json({ error: "test_failed", message: err.message }, 500);
    }
  });

  app.get("/api/auth/notifications/ntfy", (c) => c.json({ data: notificationManager.listNtfy() }));
  app.post("/api/auth/notifications/ntfy", async (c) => {
    const body = await c.req.json();
    return c.json({ data: notificationManager.addNtfy(body) }, 201);
  });
  app.delete("/api/auth/notifications/ntfy/:id", (c) => {
    notificationManager.deleteNtfy(c.req.param("id"));
    return c.body(null, 204);
  });
  app.post("/api/auth/notifications/ntfy/:id/test", async (c) => {
    try {
      await notificationManager.testNtfy(c.req.param("id"));
      return c.json({ ok: true });
    } catch (err: any) {
      return c.json({ error: "test_failed", message: err.message }, 500);
    }
  });

  app.get("/api/auth/notifications/discord", (c) =>
    c.json({ data: notificationManager.listDiscord() }),
  );
  app.post("/api/auth/notifications/discord", async (c) => {
    const body = await c.req.json();
    return c.json({ data: notificationManager.addDiscord(body) }, 201);
  });
  app.delete("/api/auth/notifications/discord/:id", (c) => {
    notificationManager.deleteDiscord(c.req.param("id"));
    return c.body(null, 204);
  });
  app.post("/api/auth/notifications/discord/:id/test", async (c) => {
    try {
      await notificationManager.testDiscord(c.req.param("id"));
      return c.json({ ok: true });
    } catch (err: any) {
      return c.json({ error: "test_failed", message: err.message }, 500);
    }
  });
  app.get("/api/auth/discord/subscriber", (c) => c.json({ data: { subscriber: null } }));

  app.get("/api/auth/notifications/webhook", (c) =>
    c.json({ data: notificationManager.listWebhook() }),
  );
  app.post("/api/auth/notifications/webhook", async (c) => {
    const body = await c.req.json();
    return c.json({ data: notificationManager.addWebhook(body) }, 201);
  });
  app.delete("/api/auth/notifications/webhook/:id", (c) => {
    notificationManager.deleteWebhook(c.req.param("id"));
    return c.body(null, 204);
  });
  app.post("/api/auth/notifications/webhook/:id/test", async (c) => {
    try {
      await notificationManager.testWebhook(c.req.param("id"));
      return c.json({ ok: true });
    } catch (err: any) {
      return c.json({ error: "test_failed", message: err.message }, 500);
    }
  });

  app.get("/api/auth/telegram", (c) => c.json({ data: [] }));

  // 13. Fallback 404 for any unhandled /api/* routes
  app.all("/api/*", (c) => {
    return c.json({ error: "not_found", message: `API route ${c.req.path} not found` }, 404);
  });

  return app;
}
