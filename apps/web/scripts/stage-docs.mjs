import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(webDirectory, "../..");
const publicDirectory = resolve(webDirectory, "public");
await mkdir(publicDirectory, { recursive: true });
// The guide, the agent setup guide and the workflow rules are served by the instance itself,
// so an agent connected to it reads the rules of that same instance.
for (const [from, to] of [
  ["docs/doc.md", "doc.md"],
  ["docs/doc.zh.md", "doc.zh.md"],
  ["docs/agent-setup.md", "agent.md"],
  ["docs/agent-setup.md", "setup.md"],
  ["skills/statedock/SKILL.md", "skill.md"],
]) {
  await copyFile(resolve(repositoryRoot, from), resolve(publicDirectory, to));
}

const specSource = resolve(repositoryRoot, "docs", "spec");
const specTarget = resolve(publicDirectory, "spec");
await mkdir(specTarget, { recursive: true });
for (const name of await readdir(specSource)) {
  await copyFile(resolve(specSource, name), resolve(specTarget, name));
}
