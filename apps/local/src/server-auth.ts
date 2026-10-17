import type { Hono, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { SESSION_COOKIE, type SecurityManager } from "./security.js";

// Reachable without credentials in server mode: health checks, the login page and static assets
// (the SPA shell holds no data; every /api call behind it is still guarded).
const PUBLIC_PATHS = new Set([
  "/health",
  "/login",
  "/logout",
  "/offline.html",
  "/manifest.webmanifest",
  "/sw.js",
  "/favicon.ico",
  "/logo.png",
  "/big-logo.png",
  "/apple-touch-icon.png",
  "/apple-touch-icon-precomposed.png",
]);
const PUBLIC_PREFIXES = ["/assets/", "/icons/"];

function isPublic(path: string) {
  return PUBLIC_PATHS.has(path) || PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function isSecure(security: SecurityManager, url: URL) {
  return url.protocol === "https:" || Boolean(security.publicOrigin?.startsWith("https://"));
}

/** Server mode only: require the agent token (Bearer) or a signed web session for everything else. */
export function serverAuthMiddleware(security: SecurityManager): MiddlewareHandler {
  return async (c, next) => {
    if (!security.serverMode) return next();
    const path = new URL(c.req.url).pathname;
    if (isPublic(path)) return next();
    if (security.verifyAgentToken(c.req.header("Authorization"))) return next();
    if (path !== "/mcp" && security.verifySession(getCookie(c, SESSION_COOKIE))) return next();
    if (path === "/mcp" || path.startsWith("/api/")) {
      return c.json(
        { error: "unauthorized", message: "Sign in or send the agent token as a Bearer token." },
        401,
      );
    }
    const next_ = encodeURIComponent(path + new URL(c.req.url).search);
    return c.redirect(`/login?next=${next_}`, 302);
  };
}

const page = (error?: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in · StateDock</title>
<style>
:root{color-scheme:light dark;font-family:system-ui,-apple-system,sans-serif}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:Canvas;color:CanvasText}
form{width:min(360px,calc(100vw - 32px));display:grid;gap:12px;padding:24px;border:1px solid color-mix(in srgb,CanvasText 15%,transparent);border-radius:12px}
h1{font-size:18px;margin:0}p{margin:0;font-size:13px;opacity:.75;line-height:1.5}
input{font:inherit;padding:10px;border-radius:8px;border:1px solid color-mix(in srgb,CanvasText 25%,transparent);background:Canvas;color:CanvasText}
button{font:inherit;padding:10px;border-radius:8px;border:0;background:#2563eb;color:#fff;cursor:pointer}
.err{color:#dc2626}code{font-size:12px}
</style></head><body>
<form method="post" action="/login">
<h1>StateDock</h1>
<p>Paste the access token from <code>agent_token</code> in the data directory, or run <code>statedock token</code> on the server.</p>
${error ? `<p class="err">${error}</p>` : ""}
<input type="password" name="token" autocomplete="current-password" placeholder="sd_local_…" required autofocus>
<button type="submit">Sign in</button>
</form></body></html>`;

function safeNext(value: string | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export function registerLoginRoutes(app: Hono<any>, security: SecurityManager) {
  app.get("/login", (c) => {
    if (!security.serverMode) return c.redirect("/", 302);
    return c.html(page());
  });

  app.post("/login", async (c) => {
    if (!security.serverMode) return c.redirect("/", 302);
    const form = await c.req.parseBody();
    const token = typeof form.token === "string" ? form.token : undefined;
    if (!security.verifyToken(token)) {
      // Slow down guessing; the token itself is 192 bits of entropy.
      await new Promise((resolve) => setTimeout(resolve, 800));
      return c.html(page("That token is not valid."), 401);
    }
    setCookie(c, SESSION_COOKIE, security.sessionValue(), {
      httpOnly: true,
      sameSite: "Lax",
      secure: isSecure(security, new URL(c.req.url)),
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return c.redirect(safeNext(c.req.query("next")), 302);
  });

  app.get("/logout", (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.redirect("/login", 302);
  });
}
