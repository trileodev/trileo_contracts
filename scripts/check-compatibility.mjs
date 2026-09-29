import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const baseline = JSON.parse(await readFile(resolve(root, "compatibility/v1-required.json"), "utf8"));
const subjects = JSON.parse(await readFile(resolve(root, "subjects/v1.json"), "utf8"));
for (const [key, expected] of Object.entries(baseline.subjects)) {
  if (subjects[key] !== expected) throw new Error(`Breaking v1 subject change: ${key}`);
}
for (const [schemaPath, expectedRequired] of Object.entries(baseline.requiredFields)) {
  const schema = JSON.parse(await readFile(resolve(root, schemaPath), "utf8"));
  const actual = new Set(schema.required ?? []);
  for (const field of expectedRequired) if (!actual.has(field)) throw new Error(`Breaking v1 field removal: ${schemaPath}#${field}`);
}
console.log("v1 compatibility baseline satisfied.");
