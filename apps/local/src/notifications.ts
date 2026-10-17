import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface BarkConnection {
  id: string;
  name: string;
  device_key: string;
  enabled: boolean;
  created_at: string;
  projectIds?: string[] | null;
}

export interface NtfyConnection {
  id: string;
  name: string;
  topic_url: string;
  has_auth_token: boolean;
  enabled: boolean;
  created_at: string;
  projectIds?: string[] | null;
  authToken?: string;
}

export interface DiscordConnection {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  created_at: string;
  projectIds?: string[] | null;
}

export interface WebhookConnection {
  id: string;
  name: string;
  url: string;
  has_secret: boolean;
  enabled: boolean;
  created_at: string;
  projectIds?: string[] | null;
  secret?: string;
}

interface NotificationStore {
  bark: BarkConnection[];
  ntfy: NtfyConnection[];
  discord: DiscordConnection[];
  webhook: WebhookConnection[];
}

export class NotificationManager {
  private storeFile: string;
  private store: NotificationStore;

  constructor(dataDir: string) {
    this.storeFile = join(dataDir, "notifications.json");
    this.store = this.loadStore();
  }

  private loadStore(): NotificationStore {
    if (existsSync(this.storeFile)) {
      try {
        return JSON.parse(readFileSync(this.storeFile, "utf-8"));
      } catch {
        console.warn("[StateDock Local] Corrupt notifications.json, resetting to empty.");
      }
    }
    return {
      bark: [],
      ntfy: [],
      discord: [],
      webhook: [],
    };
  }

  private saveStore(): void {
    try {
      mkdirSync(join(this.storeFile, ".."), { recursive: true });
      writeFileSync(this.storeFile, JSON.stringify(this.store, null, 2), "utf-8");
    } catch (err) {
      console.error("[StateDock Local] Failed to save notifications.json", err);
    }
  }

  // Bark
  public listBark(): BarkConnection[] {
    return this.store.bark;
  }

  public addBark(input: {
    name: string;
    address: string;
    projectIds?: string[] | null;
  }): BarkConnection {
    // Extract key from full url like https://api.day.app/KEY or raw KEY
    let key = input.address.trim();
    if (key.includes("/")) {
      const parts = key.split("/").filter(Boolean);
      key = parts[parts.length - 1] ?? key;
    }

    const conn: BarkConnection = {
      id: `bark_${randomBytes(8).toString("hex")}`,
      name: input.name.trim(),
      device_key: key,
      enabled: true,
      created_at: new Date().toISOString(),
      projectIds: input.projectIds ?? null,
    };
    this.store.bark.push(conn);
    this.saveStore();
    return conn;
  }

  public deleteBark(id: string): void {
    this.store.bark = this.store.bark.filter((b) => b.id !== id);
    this.saveStore();
  }

  public async testBark(id: string): Promise<void> {
    const conn = this.store.bark.find((b) => b.id === id);
    if (!conn) throw new Error("Bark connection not found");
    const url = `https://api.day.app/${encodeURIComponent(conn.device_key)}/${encodeURIComponent("StateDock Local")}/${encodeURIComponent("这是一条来自本地 StateDock 的测试通知！")}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Bark API responded with status ${res.status}`);
    }
  }

  // Ntfy
  public listNtfy(): NtfyConnection[] {
    return this.store.ntfy;
  }

  public addNtfy(input: {
    name: string;
    topic: string;
    authToken?: string;
    projectIds?: string[] | null;
  }): NtfyConnection {
    const conn: NtfyConnection = {
      id: `ntfy_${randomBytes(8).toString("hex")}`,
      name: input.name.trim(),
      topic_url: input.topic.trim(),
      has_auth_token: Boolean(input.authToken),
      authToken: input.authToken,
      enabled: true,
      created_at: new Date().toISOString(),
      projectIds: input.projectIds ?? null,
    };
    this.store.ntfy.push(conn);
    this.saveStore();
    return conn;
  }

  public deleteNtfy(id: string): void {
    this.store.ntfy = this.store.ntfy.filter((n) => n.id !== id);
    this.saveStore();
  }

  public async testNtfy(id: string): Promise<void> {
    const conn = this.store.ntfy.find((n) => n.id === id);
    if (!conn) throw new Error("ntfy connection not found");
    const headers: Record<string, string> = { Title: "StateDock Local" };
    if (conn.authToken) headers["Authorization"] = `Bearer ${conn.authToken}`;
    const res = await fetch(conn.topic_url, {
      method: "POST",
      headers,
      body: "这是一条来自本地 StateDock 的测试通知！",
    });
    if (!res.ok) throw new Error(`ntfy returned status ${res.status}`);
  }

  // Discord
  public listDiscord(): DiscordConnection[] {
    return this.store.discord;
  }

  public addDiscord(input: {
    name: string;
    url: string;
    projectIds?: string[] | null;
  }): DiscordConnection {
    const conn: DiscordConnection = {
      id: `discord_${randomBytes(8).toString("hex")}`,
      name: input.name.trim(),
      url: input.url.trim(),
      enabled: true,
      created_at: new Date().toISOString(),
      projectIds: input.projectIds ?? null,
    };
    this.store.discord.push(conn);
    this.saveStore();
    return conn;
  }

  public deleteDiscord(id: string): void {
    this.store.discord = this.store.discord.filter((d) => d.id !== id);
    this.saveStore();
  }

  public async testDiscord(id: string): Promise<void> {
    const conn = this.store.discord.find((d) => d.id === id);
    if (!conn) throw new Error("Discord webhook not found");
    const res = await fetch(conn.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "🔔 **StateDock Local**\n这是一条来自本地 StateDock 的测试通知！",
      }),
    });
    if (!res.ok) throw new Error(`Discord returned status ${res.status}`);
  }

  // Webhook
  public listWebhook(): WebhookConnection[] {
    return this.store.webhook;
  }

  public addWebhook(input: {
    name: string;
    url: string;
    secret?: string;
    projectIds?: string[] | null;
  }): WebhookConnection {
    const conn: WebhookConnection = {
      id: `webhook_${randomBytes(8).toString("hex")}`,
      name: input.name.trim(),
      url: input.url.trim(),
      has_secret: Boolean(input.secret),
      secret: input.secret,
      enabled: true,
      created_at: new Date().toISOString(),
      projectIds: input.projectIds ?? null,
    };
    this.store.webhook.push(conn);
    this.saveStore();
    return conn;
  }

  public deleteWebhook(id: string): void {
    this.store.webhook = this.store.webhook.filter((w) => w.id !== id);
    this.saveStore();
  }

  public async testWebhook(id: string): Promise<void> {
    const conn = this.store.webhook.find((w) => w.id === id);
    if (!conn) throw new Error("Webhook connection not found");
    const res = await fetch(conn.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(conn.secret ? { "X-StateDock-Secret": conn.secret } : {}),
      },
      body: JSON.stringify({
        event: "test",
        title: "StateDock Local",
        message: "这是一条来自本地 StateDock 的测试通知！",
        timestamp: new Date().toISOString(),
      }),
    });
    if (!res.ok) throw new Error(`Webhook returned status ${res.status}`);
  }

  /**
   * Dispatches task status updates to all configured outbound channels
   */
  public async dispatchNotification(title: string, message: string): Promise<void> {
    // 1. Bark
    for (const b of this.store.bark) {
      if (!b.enabled) continue;
      const url = `https://api.day.app/${encodeURIComponent(b.device_key)}/${encodeURIComponent(title)}/${encodeURIComponent(message)}`;
      fetch(url).catch((err) => console.warn(`[Notification] Bark dispatch error: ${err.message}`));
    }

    // 2. ntfy
    for (const n of this.store.ntfy) {
      if (!n.enabled) continue;
      const headers: Record<string, string> = { Title: title };
      if (n.authToken) headers["Authorization"] = `Bearer ${n.authToken}`;
      fetch(n.topic_url, { method: "POST", headers, body: message }).catch((err) =>
        console.warn(`[Notification] ntfy dispatch error: ${err.message}`),
      );
    }

    // 3. Discord
    for (const d of this.store.discord) {
      if (!d.enabled) continue;
      fetch(d.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: `🔔 **${title}**\n${message}` }),
      }).catch((err) => console.warn(`[Notification] Discord dispatch error: ${err.message}`));
    }

    // 4. Webhook
    for (const w of this.store.webhook) {
      if (!w.enabled) continue;
      fetch(w.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(w.secret ? { "X-StateDock-Secret": w.secret } : {}),
        },
        body: JSON.stringify({
          event: "task_event",
          title,
          message,
          timestamp: new Date().toISOString(),
        }),
      }).catch((err) => console.warn(`[Notification] Webhook dispatch error: ${err.message}`));
    }
  }
}
