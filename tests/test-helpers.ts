import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import Ajv2020, { type AnySchema, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

export const root = resolve(process.cwd());

export async function walkJson(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walkJson(path) : entry.name.endsWith(".json") ? [path] : [];
  }));
  return files.flat().sort();
}

export async function createSchemaValidator(): Promise<{ ajv: Ajv2020; schemas: AnySchema[] }> {
  const schemaFiles = await walkJson(resolve(root, "schemas/v1"));
  const schemas = await Promise.all(schemaFiles.map(async (file) => JSON.parse(await readFile(file, "utf8")) as AnySchema));
  const ajv = new Ajv2020({ allErrors: true, strict: true, unicodeRegExp: true });
  addFormats(ajv);
  for (const schema of schemas) ajv.addSchema(schema);
  return { ajv, schemas };
}

export type Fixture = { schema: string; data: unknown; reason?: string };

export async function readFixtures(kind: "valid" | "invalid"): Promise<Fixture[]> {
  const files = await walkJson(resolve(root, `fixtures/${kind}`));
  const groups = await Promise.all(files.map(async (file) => JSON.parse(await readFile(file, "utf8")) as Fixture[]));
  return groups.flat();
}
