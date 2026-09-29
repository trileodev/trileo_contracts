import { describe, expect, it } from "vitest";
import { createSchemaValidator, readFixtures } from "./test-helpers.js";

describe("contract fixtures", () => {
  it("accepts every valid fixture and covers every schema", async () => {
    const { ajv, schemas } = await createSchemaValidator();
    const fixtures = await readFixtures("valid");
    const covered = new Set(fixtures.map((fixture) => fixture.schema));
    for (const fixture of fixtures) {
      const validate = ajv.getSchema(fixture.schema);
      expect(validate, fixture.schema).toBeDefined();
      expect(validate?.(fixture.data), JSON.stringify(validate?.errors)).toBe(true);
    }
    for (const schema of schemas) expect(covered.has(String((schema as { $id?: string }).$id)), String((schema as { title?: string }).title)).toBe(true);
  });

  it("rejects every malformed and security fixture", async () => {
    const { ajv } = await createSchemaValidator();
    for (const fixture of await readFixtures("invalid")) {
      const validate = ajv.getSchema(fixture.schema);
      expect(validate, fixture.schema).toBeDefined();
      expect(validate?.(fixture.data), fixture.reason).toBe(false);
    }
  });
});
