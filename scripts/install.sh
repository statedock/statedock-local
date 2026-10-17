#!/usr/bin/env bash
# StateDock self-hosted installer for Linux (systemd).
#
#   curl -fsSL https://raw.githubusercontent.com/statedock/statedock-local/main/scripts/install.sh | sudo bash
#   curl -fsSL .../install.sh | sudo bash -s -- --public-url https://dock.example.com
#
# After install, the same script lives at /usr/local/bin/statedock-ctl:
#   sudo statedock-ctl update      back up the database, upgrade, roll back on failure
#   sudo statedock-ctl uninstall   remove the program (data kept; add --purge to delete it)
#   sudo statedock-ctl status | logs
#   sudo statedock token           print the access / agent token
set -euo pipefail

REPO="${STATEDOCK_REPO:-statedock/statedock-local}"
VERSION="${STATEDOCK_VERSION:-latest}"
APP_DIR=/opt/statedock
DATA_DIR=/var/lib/statedock
CONF_DIR=/etc/statedock
ENV_FILE="$CONF_DIR/statedock.env"
UNIT=/etc/systemd/system/statedock.service
SVC_USER=statedock
KEEP_RELEASES=3

HOST="127.0.0.1"
PORT="4040"
PUBLIC_URL=""
PURGE=0
CMD="install"

log() { printf '\033[1;34m[statedock]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[statedock]\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<USAGE
Usage: statedock-ctl [install|update|uninstall|status|logs] [options]

Options (install):
  --host <addr>        Listen address (default 127.0.0.1; 0.0.0.0 exposes it directly)
  --port <port>        Port (default 4040)
  --public-url <url>   Public HTTPS origin, e.g. https://dock.example.com
  --version <tag>      Release tag to install (default latest)
Options (uninstall):
  --purge              Also delete $DATA_DIR (database, attachments, backups, token)
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    install|update|uninstall|status|logs) CMD="$1" ;;
    --host) HOST="$2"; shift ;;
    --port) PORT="$2"; shift ;;
    --public-url) PUBLIC_URL="$2"; shift ;;
    --version) VERSION="$2"; shift ;;
    --purge) PURGE=1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown argument: $1 (see --help)" ;;
  esac
  shift
done

require_root() { [ "$(id -u)" -eq 0 ] || die "Run as root (sudo)."; }
require_systemd() { command -v systemctl >/dev/null || die "systemd is required. Use the Docker image or run 'statedock' directly."; }

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo x64 ;;
    aarch64|arm64) echo arm64 ;;
    *) die "Unsupported CPU architecture: $(uname -m)" ;;
  esac
}

download_release() { # $1 = destination dir
  local arch asset base tmp
  arch="$(detect_arch)"
  asset="statedock-linux-${arch}.tar.gz"
  if [ "$VERSION" = "latest" ]; then
    base="https://github.com/${REPO}/releases/latest/download"
  else
    base="https://github.com/${REPO}/releases/download/${VERSION}"
  fi
  tmp="$(mktemp -d)"
  log "Downloading ${asset} (${VERSION})..."
  curl -fsSL "${base}/${asset}" -o "${tmp}/${asset}" || die "Download failed: ${base}/${asset}"
  if curl -fsSL "${base}/checksums.txt" -o "${tmp}/checksums.txt" 2>/dev/null \
    && grep -q " ${asset}\$" "${tmp}/checksums.txt"; then
    (cd "$tmp" && grep " ${asset}\$" checksums.txt | sha256sum -c - >/dev/null) || die "Checksum mismatch for ${asset}"
  else
    log "No checksum published for this release; skipping verification."
  fi
  mkdir -p "$1"
  tar -xzf "${tmp}/${asset}" -C "$1"
  rm -rf "$tmp"
  [ -x "$1/bin/node" ] && [ -f "$1/dist/index.js" ] || die "Unexpected archive layout (bin/node, dist/index.js missing)."
}

write_unit() {
  cat >"$UNIT" <<UNITEOF
[Unit]
Description=StateDock self-hosted task engine and MCP server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SVC_USER}
Group=${SVC_USER}
EnvironmentFile=${ENV_FILE}
ExecStart=${APP_DIR}/current/bin/node ${APP_DIR}/current/dist/index.js --data-dir ${DATA_DIR} --no-open
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=${DATA_DIR}

[Install]
WantedBy=multi-user.target
UNITEOF
}

write_wrappers() {
  cat >/usr/local/bin/statedock <<WRAP
#!/usr/bin/env bash
# Runs StateDock commands (token, backup, --version) against the service's data directory.
set -a; [ -r ${ENV_FILE} ] && . ${ENV_FILE}; set +a
if [ "\$(id -u)" -eq 0 ]; then
  exec runuser -u ${SVC_USER} -- ${APP_DIR}/current/bin/node ${APP_DIR}/current/dist/index.js --data-dir ${DATA_DIR} --no-open "\$@"
fi
exec ${APP_DIR}/current/bin/node ${APP_DIR}/current/dist/index.js --data-dir ${DATA_DIR} --no-open "\$@"
WRAP
  chmod 755 /usr/local/bin/statedock
  if [ -f "${BASH_SOURCE[0]:-}" ] && [ "$(readlink -f "${BASH_SOURCE[0]}")" != /usr/local/bin/statedock-ctl ]; then
    install -m 755 "${BASH_SOURCE[0]}" /usr/local/bin/statedock-ctl
  elif [ ! -f /usr/local/bin/statedock-ctl ]; then
    curl -fsSL "https://raw.githubusercontent.com/${REPO}/main/scripts/install.sh" -o /usr/local/bin/statedock-ctl
    chmod 755 /usr/local/bin/statedock-ctl
  fi
}

wait_healthy() {
  local port i
  port="$(. "$ENV_FILE"; echo "${PORT:-4040}")"
  for i in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}

prune_releases() {
  ls -1dt "$APP_DIR"/releases/* 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf
}

do_install() {
  require_root; require_systemd
  if [ -L "$APP_DIR/current" ]; then
    log "StateDock is already installed. Use: sudo statedock-ctl update"
    exit 0
  fi
  id -u "$SVC_USER" >/dev/null 2>&1 || useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin "$SVC_USER"
  install -d -o "$SVC_USER" -g "$SVC_USER" -m 750 "$DATA_DIR"
  install -d -m 755 "$APP_DIR/releases" "$CONF_DIR"
  if [ ! -f "$ENV_FILE" ]; then
    {
      echo "PORT=${PORT}"
      echo "STATEDOCK_HOST=${HOST}"
      [ -n "$PUBLIC_URL" ] && echo "PUBLIC_BASE_URL=${PUBLIC_URL}"
    } >"$ENV_FILE"
    chmod 644 "$ENV_FILE"
  fi
  local rel="$APP_DIR/releases/$(date +%Y%m%d%H%M%S)"
  download_release "$rel"
  ln -sfn "$rel" "$APP_DIR/current"
  write_unit; write_wrappers
  systemctl daemon-reload
  systemctl enable --now statedock >/dev/null
  wait_healthy || die "Service did not become healthy. Check: journalctl -u statedock -n 100"
  local port; port="$(. "$ENV_FILE"; echo "${PORT:-4040}")"
  log "Installed and running (starts automatically on boot)."
  log "Data:        $DATA_DIR   Config: $ENV_FILE"
  log "Local URL:   http://127.0.0.1:${port}  (MCP: /mcp)"
  [ -n "$PUBLIC_URL" ] && log "Public URL:  ${PUBLIC_URL}  (point your HTTPS proxy at 127.0.0.1:${port})"
  log "Access token: run 'sudo statedock token' (used to sign in and as the MCP Bearer token)."
}

do_update() {
  require_root; require_systemd
  [ -L "$APP_DIR/current" ] || die "StateDock is not installed. Run install first."
  local prev rel backup
  prev="$(readlink -f "$APP_DIR/current")"
  rel="$APP_DIR/releases/$(date +%Y%m%d%H%M%S)"
  download_release "$rel"

  log "Stopping service and backing up the database..."
  systemctl stop statedock
  # VACUUM INTO on a stopped service: consistent snapshot including anything still in the WAL.
  backup="$(runuser -u "$SVC_USER" -- "$prev/bin/node" "$prev/dist/index.js" backup --data-dir "$DATA_DIR" --no-open | tail -n 1)"
  [ -f "$backup" ] || { systemctl start statedock; die "Backup failed; update aborted, previous version restarted."; }
  log "Backup: $backup"

  ln -sfn "$rel" "$APP_DIR/current"
  write_unit; write_wrappers
  systemctl daemon-reload
  systemctl start statedock
  if wait_healthy; then
    prune_releases
    log "Updated to $(statedock --version 2>/dev/null || echo 'new version')."
    return 0
  fi

  log "New version failed its health check; rolling back..."
  systemctl stop statedock
  install -o "$SVC_USER" -g "$SVC_USER" -m 640 "$backup" "$DATA_DIR/statedock.db"
  rm -f "$DATA_DIR/statedock.db-wal" "$DATA_DIR/statedock.db-shm"
  ln -sfn "$prev" "$APP_DIR/current"
  systemctl start statedock
  wait_healthy && die "Rolled back to the previous version and restored the database from $backup." \
    || die "Rollback also failed. Check: journalctl -u statedock -n 200"
}

do_uninstall() {
  require_root
  systemctl disable --now statedock >/dev/null 2>&1 || true
  rm -f "$UNIT" /usr/local/bin/statedock
  systemctl daemon-reload 2>/dev/null || true
  rm -rf "$APP_DIR"
  if [ "$PURGE" -eq 1 ]; then
    rm -rf "$DATA_DIR" "$CONF_DIR"
    userdel "$SVC_USER" 2>/dev/null || true
    log "Removed StateDock and all data."
  else
    log "Removed StateDock. Data kept in $DATA_DIR and config in $CONF_DIR (use --purge to delete)."
  fi
  rm -f /usr/local/bin/statedock-ctl
}

case "$CMD" in
  install) do_install ;;
  update) do_update ;;
  uninstall) do_uninstall ;;
  status) systemctl status statedock --no-pager ;;
  logs) journalctl -u statedock -n 200 --no-pager ;;
esac
