import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { createGunzip } from "node:zlib";

export const CURRENT_VERSION = "0.1.1";
const GITHUB_REPO = "statedock/statedock-local";

export interface VersionInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseNotes: string;
  releaseUrl: string;
  publishedAt: string;
  assetName?: string;
  downloadUrl?: string;
  canAutoUpdate: boolean;
  checkedAt: string;
}

interface CachedCheck {
  data: VersionInfo;
  timestamp: number;
}

let memoryCache: CachedCheck | null = null;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function compareSemver(v1: string, v2: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const p1 = parse(v1);
  const p2 = parse(v2);
  for (let i = 0; i < 3; i++) {
    const a = p1[i] ?? 0;
    const b = p2[i] ?? 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

export function getPlatformArch(): { platform: string; arch: string } {
  const p = process.platform;
  const platform = p === "darwin" ? "macos" : p === "win32" ? "windows" : "linux";
  const a = process.arch;
  const arch = a === "arm64" ? "arm64" : "x64";
  return { platform, arch };
}

export async function checkUpdate(force = false): Promise<VersionInfo> {
  const now = Date.now();
  if (!force && memoryCache && now - memoryCache.timestamp < CACHE_TTL_MS) {
    return memoryCache.data;
  }

  const { platform, arch } = getPlatformArch();
  const targetAssetName = `statedock-${platform}-${arch}`;

  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: {
        "User-Agent": `StateDock-Local/${CURRENT_VERSION}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API returned status ${response.status}`);
    }

    const release = (await response.json()) as any;
    const tag = (release.tag_name || "").replace(/^v/, "");
    const hasUpdate = compareSemver(tag, CURRENT_VERSION) > 0;

    let matchedAsset: any = null;
    if (Array.isArray(release.assets)) {
      matchedAsset = release.assets.find((asset: any) =>
        asset.name.toLowerCase().includes(targetAssetName.toLowerCase()),
      );
    }

    const info: VersionInfo = {
      currentVersion: CURRENT_VERSION,
      latestVersion: tag || CURRENT_VERSION,
      hasUpdate,
      releaseNotes: release.body || "",
      releaseUrl: release.html_url || `https://github.com/${GITHUB_REPO}/releases`,
      publishedAt: release.published_at || new Date().toISOString(),
      assetName: matchedAsset?.name,
      downloadUrl: matchedAsset?.browser_download_url,
      canAutoUpdate: false,
      checkedAt: new Date().toISOString(),
    };

    memoryCache = { data: info, timestamp: now };
    return info;
  } catch (err: any) {
    // If offline or GitHub is unreachable, fall back to current version info
    const fallback: VersionInfo = {
      currentVersion: CURRENT_VERSION,
      latestVersion: CURRENT_VERSION,
      hasUpdate: false,
      releaseNotes: "",
      releaseUrl: `https://github.com/${GITHUB_REPO}/releases`,
      publishedAt: new Date().toISOString(),
      canAutoUpdate: false,
      checkedAt: new Date().toISOString(),
    };
    return fallback;
  }
}

/**
 * In-place self-update is disabled: release assets are archives (app + embedded Node), so the
 * previous approach of overwriting process.execPath would have replaced the Node runtime with an
 * archive. Updates go through the installer instead, which backs up the database first.
 */
export async function applyUpdate(
  _dataDir: string,
): Promise<{ success: boolean; message: string }> {
  const info = await checkUpdate(true);
  if (!info.hasUpdate) return { success: false, message: "Already on the latest version." };
  return {
    success: false,
    message:
      process.platform === "linux"
        ? `StateDock ${info.latestVersion} is available. On a server installed with install.sh run: sudo statedock-ctl update`
        : `StateDock ${info.latestVersion} is available. Download it from ${info.releaseUrl} and replace the app folder; your data directory is kept.`,
  };
}
