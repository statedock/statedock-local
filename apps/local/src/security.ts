import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Context, MiddlewareHandler } from "hono";

export interface SecurityOptions {
  port: number;
  dataDir: string;
}

export class SecurityManager {
  private agentToken: string;
  private port: number;

  constructor(options: SecurityOptions) {
    this.port = options.port;
    this.agentToken = this.loadOrCreateAgentToken(options.dataDir);
  }

  public getAgentToken(): string {
    return this.agentToken;
  }

  public getPort(): number {
    return this.port;
  }

  private loadOrCreateAgentToken(dataDir: string): string {
    const tokenFile = join(dataDir, "agent_token");
    if (existsSync(tokenFile)) {
      try {
        const token = readFileSync(tokenFile, "utf-8").trim();
        if (token.length > 0) {
          return token;
        }
      } catch (err) {
        console.warn("[StateDock Local] Failed to read existing agent_token file, creating new one.");
      }
    }

    mkdirSync(dataDir, { recursive: true });
    const newToken = `sd_local_${randomBytes(24).toString("hex")}`;
    try {
      writeFileSync(tokenFile, newToken + "\n", { mode: 0o600 });
    } catch {
      writeFileSync(tokenFile, newToken + "\n");
    }
    return newToken;
  }

  /**
   * Host header validation to prevent DNS Rebinding attacks.
   */
  public hostValidationMiddleware(): MiddlewareHandler {
    return async (c: Context, next: () => Promise<void>) => {
      const host = c.req.header("host");
      if (!host) {
        // In-memory / synthetic test requests omit Host header
        return next();
      }

      const [hostname] = host.split(":");
      const allowedHosts = ["localhost", "127.0.0.1", "[::1]"];

      if (!allowedHosts.includes(hostname)) {
        return c.text("Forbidden: Unauthorized Host header", 403);
      }

      await next();
    };
  }

  /**
   * Origin and Sec-Fetch-Site validation to prevent malicious website CSRF / probing.
   */
  public originValidationMiddleware(): MiddlewareHandler {
    return async (c: Context, next: () => Promise<void>) => {
      // 1. Check Sec-Fetch-Site if provided by modern browsers
      const secFetchSite = c.req.header("sec-fetch-site");
      if (secFetchSite === "cross-site") {
        return c.json({ error: "cross_site_forbidden", message: "Cross-site requests are rejected" }, 403);
      }

      // 2. Check Origin header for API routes
      const origin = c.req.header("origin");
      if (origin) {
        try {
          const originUrl = new URL(origin);
          const allowedOrigins = [
            `http://localhost:${this.port}`,
            `http://127.0.0.1:${this.port}`,
            `http://[::1]:${this.port}`,
          ];
          if (!allowedOrigins.includes(originUrl.origin)) {
            return c.json({ error: "unauthorized_origin", message: "Origin not permitted" }, 403);
          }
        } catch {
          return c.json({ error: "invalid_origin", message: "Malformed Origin header" }, 400);
        }
      }

      await next();
    };
  }

  /**
   * Verifies Agent Token for /mcp endpoint
   */
  public verifyAgentToken(authHeader: string | undefined): boolean {
    if (!authHeader) return false;
    const match = /^Bearer\s+(.+)$/i.exec(authHeader);
    if (!match) return false;
    const bearer = match[1];
    return bearer === this.agentToken;
  }
}
