import { execSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(rootDir, "release-bundle");

console.log("[Package] Preparing StateDock Local release bundle...");

if (existsSync(outDir)) {
  rmSync(outDir, { recursive: true, force: true });
}

// 1. Deploy production dependencies and workspace packages into release-bundle
console.log("[Package] Deploying production dependencies via pnpm...");
execSync("pnpm --filter @statedock/local deploy --prod release-bundle", {
  cwd: rootDir,
  stdio: "inherit",
});

// 2. Copy apps/web/dist to release-bundle/web/dist
console.log("[Package] Copying Web PWA assets...");
mkdirSync(join(outDir, "web/dist"), { recursive: true });
cpSync(join(rootDir, "apps/web/dist"), join(outDir, "web/dist"), { recursive: true });

// 3. Create double-clickable launchers
console.log("[Package] Creating launch scripts...");

// macOS Finder double-clickable .command file
const macCommandContent = `#!/usr/bin/env bash
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

if [ -x "$DIR/bin/node" ]; then
  NODE_EXEC="$DIR/bin/node"
elif command -v node >/dev/null 2>&1; then
  NODE_EXEC="node"
else
  echo "=========================================================="
  echo "  StateDock Local requires Node.js runtime (v20+)."
  echo "  Please install Node.js from https://nodejs.org"
  echo "=========================================================="
  echo ""
  read -p "Press Enter to exit..."
  exit 1
fi

"$NODE_EXEC" "$DIR/dist/index.js" "$@"
`;
writeFileSync(join(outDir, "StateDock.command"), macCommandContent, { encoding: "utf8" });
chmodSync(join(outDir, "StateDock.command"), 0o755);

// Unix CLI launcher (./statedock)
const unixCliContent = `#!/usr/bin/env bash
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

if [ -x "$DIR/bin/node" ]; then
  exec "$DIR/bin/node" "$DIR/dist/index.js" "$@"
elif command -v node >/dev/null 2>&1; then
  exec node "$DIR/dist/index.js" "$@"
else
  echo "StateDock Local requires Node.js runtime (v20+). Please install Node.js from https://nodejs.org"
  exit 1
fi
`;
writeFileSync(join(outDir, "statedock"), unixCliContent, { encoding: "utf8" });
chmodSync(join(outDir, "statedock"), 0o755);

writeFileSync(join(outDir, "statedock.sh"), unixCliContent, { encoding: "utf8" });
chmodSync(join(outDir, "statedock.sh"), 0o755);

// Windows double-clickable / CLI launcher
const winBatContent = `@echo off
cd /d "%~dp0"

if exist "%~dp0bin\\node.exe" (
  "%~dp0bin\\node.exe" "%~dp0dist\\index.js" %*
) else (
  where node >nul 2>nul
  if %ERRORLEVEL% EQU 0 (
    node "%~dp0dist\\index.js" %*
  ) else (
    echo ==========================================================
    echo   StateDock Local requires Node.js runtime (v20+).
    echo   Please install Node.js from https://nodejs.org
    echo ==========================================================
    pause
    exit /b 1
  )
)
`;
writeFileSync(join(outDir, "statedock.bat"), winBatContent, { encoding: "utf8" });

// 4. Copy license, documentation and notices
cpSync(join(rootDir, "LICENSE"), join(outDir, "LICENSE"));
cpSync(join(rootDir, "THIRD_PARTY_NOTICES.md"), join(outDir, "THIRD_PARTY_NOTICES.md"));
cpSync(join(rootDir, "README.md"), join(outDir, "README.md"));

console.log(`[Package] Release bundle assembled successfully at: ${outDir}`);
