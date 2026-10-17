import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Context, MiddlewareHandler } from "hono";

export interface SecurityOptions {
  port: number;
  dataDir: string;
  /**
   * Server mode: listening beyond loopback (VPS / Docker). Every API, MCP and page request then
   * needs the agent token (Bearer) or a web session signed with it.
   */
  serverMode?: boolean;
  /** Public origin such as https://dock.example.com; its host is accepted besides loopback. */
  publicOrigin?: string;
}

export const SESSION_COOKIE = "statedock_session";
const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export class SecurityManager {
  private agentToken: string;
  private port: number;
  public readonly serverMode: boolean;
  public readonly publicOrigin?: string;

  constructor(options: SecurityOptions) {
    this.port = options.port;
    this.serverMode = Boolean(options.serverMode);
    this.publicOrigin = options.publicOrigin?.replace(/\/+$/, "") || undefined;
    this.agentToken = this.loadOrCreateAgentToken(options.dataDir);
  }

  private publicHost(): string | undefined {
    if (!this.publicOrigin) return undefined;
    try {
      return new URL(this.publicOrigin).hostname;
    } catch {
      return undefined;
    }
  }

  /** Stateless web session: rotating agent_token signs every browser out. */
  public sessionValue(): string {
    return createHmac("sha256", this.agentToken).update("statedock-web-session-v1").digest("hex");
  }

  public verifySession(cookieValue: string | undefined): boolean {
    return Boolean(cookieValue) && safeEqual(cookieValue!, this.sessionValue());
  }

  public verifyToken(candidate: string | undefined): boolean {
    return Boolean(candidate) && safeEqual(candidate!.trim(), this.agentToken);
  }

  public getAgentToken(): string {
    return this.agentToken;
  }

  public getPort(): number {
    return this.port;
  }

  private loadOrCreateAgentToken(dataDir: string): string {
    // Explicit token (Docker / statedock-docker compatibility) wins over the generated file.
    const fromEnv = process.env.STATEDOCK_AGENT_TOKEN?.trim();
    if (fromEnv) return fromEnv;
    const tokenFile = join(dataDir, "agent_token");
    if (existsSync(tokenFile)) {
      try {
        const token = readFileSync(tokenFile, "utf-8").trim();
        if (token.length > 0) {
          return token;
        }
      } catch (err) {
        console.warn(
          "[StateDock Local] Failed to read existing agent_token file, creating new one.",
        );
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

      const hostname = host.startsWith("[")
        ? host.slice(0, host.indexOf("]") + 1)
        : host.split(":")[0];
      const publicHost = this.publicHost();
      // Server mode without a public URL is reached by IP or arbitrary DNS; auth guards it instead.
      if (this.serverMode && !publicHost) return next();
      const allowedHosts = publicHost ? [...LOOPBACK_HOSTS, publicHost] : LOOPBACK_HOSTS;

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
        return c.json(
          { error: "cross_site_forbidden", message: "Cross-site requests are rejected" },
          403,
        );
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
            ...(this.publicOrigin ? [this.publicOrigin] : []),
          ];
          // Same-origin requests in server mode (e.g. reached by IP behind no public URL).
          const sameOrigin = this.serverMode && originUrl.host === c.req.header("host");
          if (!allowedOrigins.includes(originUrl.origin) && !sameOrigin) {
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
    return this.verifyToken(match[1]);
  }
}
