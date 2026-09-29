import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { root } from "./test-helpers.js";

describe("v1 compatibility", () => {
  it("preserves the committed v1 baseline", () => {
    const result = spawnSync(process.execPath, [resolve(root, "scripts/check-compatibility.mjs")], { cwd: root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });
});
