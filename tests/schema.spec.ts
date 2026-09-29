import { describe, expect, it } from "vitest";
import { createSchemaValidator } from "./test-helpers.js";

describe("v1 schemas", () => {
  it("loads every schema under strict JSON Schema 2020-12 validation", async () => {
    const { ajv, schemas } = await createSchemaValidator();
    expect(schemas.length).toBeGreaterThan(20);
    for (const schema of schemas) expect(() => ajv.getSchema(String((schema as { $id?: string }).$id))).not.toThrow();
  });

  it("gives every object DTO an explicit additional-properties policy", async () => {
    const { schemas } = await createSchemaValidator();
    for (const schema of schemas) {
      const typed = schema as { title?: string; type?: string; additionalProperties?: unknown };
      if (typed.type === "object") expect(typed.additionalProperties, typed.title).toBe(false);
    }
  });
});
