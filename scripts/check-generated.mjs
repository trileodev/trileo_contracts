import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const before = await snapshot(resolve(root, "generated"));
const result = spawnSync(process.execPath, [resolve(root, "scripts/generate.mjs")], { cwd: root, stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
const after = await snapshot(resolve(root, "generated"));
if (JSON.stringify(before) !== JSON.stringify(after)) {
  console.error("Generated output was stale. Run npm run generate and commit the result.");
  process.exit(1);
}

async function snapshot(directory) {
  const files = await walk(directory);
  return Promise.all(files.map(async (file) => [relative(directory, file), await readFile(file, "utf8")]));
}
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? walk(resolve(directory, entry.name)) : [resolve(directory, entry.name)]))).flat().sort();
}
