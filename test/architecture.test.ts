import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const PURE_MODULES = ["src/reducer.ts", "src/planner.ts"] as const;

test("pure calculation modules do not depend on GitHub/network transport", async () => {
  for (const path of PURE_MODULES) {
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(source, /(?:node:https?|fetch\(|octokit|\.\/github)/i, `${path} must remain transport-free`);
  }
});
