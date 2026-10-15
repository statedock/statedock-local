import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(rootDir, "release-bundle");

console.log("[Package] Preparing StateDock Local release bundle...");

if (existsSync(outDir)) {
  rmSync(outDir, { recursive: true, force: true });
}
mkdirSync(outDir, { recursive: true });

// 1. Copy apps/local/dist to release-bundle/dist
mkdirSync(join(outDir, "dist"), { recursive: true });
cpSync(join(rootDir, "apps/local/dist"), join(outDir, "dist"), { recursive: true });

// 2. Copy apps/web/dist to release-bundle/web/dist
mkdirSync(join(outDir, "web/dist"), { recursive: true });
cpSync(join(rootDir, "apps/web/dist"), join(outDir, "web/dist"), { recursive: true });

// 3. Copy packages and mcp dists
mkdirSync(join(outDir, "packages/core/dist"), { recursive: true });
cpSync(join(rootDir, "packages/core/dist"), join(outDir, "packages/core/dist"), { recursive: true });

mkdirSync(join(outDir, "packages/db/dist"), { recursive: true });
cpSync(join(rootDir, "packages/db/dist"), join(outDir, "packages/db/dist"), { recursive: true });

mkdirSync(join(outDir, "apps/mcp/dist"), { recursive: true });
cpSync(join(rootDir, "apps/mcp/dist"), join(outDir, "apps/mcp/dist"), { recursive: true });

// 4. Copy license and notices
cpSync(join(rootDir, "LICENSE"), join(outDir, "LICENSE"));
cpSync(join(rootDir, "THIRD_PARTY_NOTICES.md"), join(outDir, "THIRD_PARTY_NOTICES.md"));

console.log(`[Package] Release bundle assembled successfully at: ${outDir}`);
