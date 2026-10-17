# Run StateDock on your own server

The same StateDock Local program runs on a laptop and on a server. On a laptop it listens only on
`127.0.0.1` with no sign-in. On a server you give it a non-loopback `--host`, which turns on
**server mode**:

- every page, API and MCP request needs the access token: browsers sign in once at `/login`
  (a signed, HttpOnly cookie, valid 30 days), agents send it as `Authorization: Bearer <token>`;
- `/health` and static assets stay open for probes;
- with `--public-url`, only that host (plus loopback) is accepted, and MCP links use it.

There is a single owner and a single token; no users or roles. The token is in
`<data-dir>/agent_token`; `statedock token` prints it. Deleting the file and restarting rotates it
and signs every browser out.

## Linux VPS (systemd) — recommended

Works on x64 and arm64, including 1 CPU / 1 GB machines. No Node, Docker or SQLite to install.

```sh
curl -fsSL https://raw.githubusercontent.com/statedock/statedock-local/main/scripts/install.sh \
  | sudo bash -s -- --public-url https://dock.example.com
```

This installs the program in `/opt/statedock`, keeps data in `/var/lib/statedock`, writes settings
to `/etc/statedock/statedock.env`, and registers a `statedock` systemd service that starts on boot
and restarts on failure. By default it listens on `127.0.0.1:4040`; put an HTTPS proxy in front:

```caddy
dock.example.com {
    reverse_proxy 127.0.0.1:4040
}
```

Or use a tunnel (Cloudflare Tunnel, Tailscale) and skip opening ports at all. Only listen on
`0.0.0.0` (`--host 0.0.0.0`) if something else terminates HTTPS — the token must not travel over
plain HTTP.

| Task              | Command                         |
| ----------------- | ------------------------------- |
| Access token      | `sudo statedock token`          |
| Status / logs     | `sudo statedock-ctl status` / `logs` (or `journalctl -u statedock`) |
| Manual backup     | `sudo statedock backup`         |
| Update            | `sudo statedock-ctl update`     |
| Uninstall         | `sudo statedock-ctl uninstall` (data kept; `--purge` deletes it) |
| Change settings   | edit `/etc/statedock/statedock.env`, then `sudo systemctl restart statedock` |

### How updates protect your data

`statedock-ctl update` downloads and verifies the new release, stops the service, writes a
consistent snapshot with SQLite `VACUUM INTO` (it includes anything still in the WAL) to
`/var/lib/statedock/backups/`, switches `/opt/statedock/current` to the new release and starts it.
Database migrations only move forward and run at start. If the new version does not answer
`/health` within 30 seconds, the script restores the snapshot, switches back to the previous
release and restarts it. The last three releases are kept.

## Docker (optional)

The image is a thin wrapper around the same program (`ghcr.io/statedock/statedock`), started in
server mode on port 3000 with data in `/data`. See `deploy/compose.yaml` (StateDock + Caddy for
HTTPS):

```sh
cd deploy
# set your domain in Caddyfile and PUBLIC_BASE_URL in compose.yaml
docker compose up -d
docker compose exec statedock node dist/index.js token --no-open
```

## Connect a coding agent remotely

```json
{
  "mcpServers": {
    "statedock": {
      "url": "https://dock.example.com/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

## Moving from the statedock-docker image

The database format is identical (same schema and migrations), and the new image reads the same
`/data/statedock.db`.

- **Keep Docker:** in your `compose.yaml` replace the `statedock` service's `image:`/`build:` with
  `image: ghcr.io/statedock/statedock:latest`, keep `./data:/data`, add
  `PUBLIC_BASE_URL=https://your-domain`, and `docker compose up -d`. If you set
  `STATEDOCK_AGENT_TOKEN`, it keeps working. The web UI now asks for that token (or the generated
  one in `/data/agent_token`) at `/login`.
- **Switch to systemd:** run the installer above, then
  `sudo systemctl stop statedock && sudo cp ./data/statedock.db /var/lib/statedock/statedock.db && sudo chown statedock: /var/lib/statedock/statedock.db && sudo systemctl start statedock`.

Stop the old container before copying the database so its WAL is checkpointed.
