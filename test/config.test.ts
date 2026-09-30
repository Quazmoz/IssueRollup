import assert from "node:assert/strict";
import test from "node:test";

import { ConfigValidationError, parseIssuerollupConfig, resolveConfigFields } from "../src/config.js";
import { MAX_CONFIG_BYTES, MAX_ROLLUP_RULES } from "../src/domain.js";

const minimal = `version: 1\nrollups:\n  - name: total-effort\n    source_field: Effort\n    target_field: Total Effort\n    reducer: sum\n`;

function assertConfigError(source: string, code: string): void {
  assert.throws(() => parseIssuerollupConfig(source), (error: unknown) => error instanceof ConfigValidationError && error.code === code);
}

test("parses and normalizes minimal and full V1 config", () => {
  assert.deepEqual(parseIssuerollupConfig(minimal), {
    version: 1,
    rollups: [{ name: "total-effort", sourceField: "Effort", targetField: "Total Effort", reducer: "sum", missingValue: "ignore" }],
  });
  assert.equal(parseIssuerollupConfig(minimal.replace("reducer: sum", "reducer: sum\n    missing_value: ignore")).rollups[0]?.missingValue, "ignore");
});

test("rejects schema violations", () => {
  assertConfigError(minimal.replace("version: 1", "version: 2"), "UNSUPPORTED_VERSION");
  assertConfigError(`${minimal}unknown: true\n`, "UNKNOWN_KEY");
  assertConfigError(minimal.replace("    reducer: sum\n", "    reducer: sum\n    typo: value\n"), "UNKNOWN_KEY");
  assertConfigError("version: 1\nrollups: []\n", "EMPTY_RULES");
  assertConfigError(minimal.replace("reducer: sum", "reducer: average"), "UNSUPPORTED_REDUCER");
  assertConfigError(minimal.replace("reducer: sum", "reducer: sum\n    missing_value: zero"), "UNSUPPORTED_MISSING_POLICY");
  assertConfigError(minimal.replace("target_field: Total Effort", "target_field: Effort"), "SOURCE_EQUALS_TARGET");
});

test("rejects duplicate names, target ownership, and hidden cross-rule dependencies", () => {
  const second = `  - name: second\n    source_field: Cost\n    target_field: Total Cost\n    reducer: sum\n`;
  assertConfigError(`${minimal}${minimal.slice(minimal.indexOf("  - name:"))}`, "DUPLICATE_RULE_NAME");
  assertConfigError(`${minimal}${second.replace("target_field: Total Cost", "target_field: Total Effort")}`, "DUPLICATE_TARGET");
  assertConfigError(`${minimal}${second.replace("source_field: Cost", "source_field: Total Effort")}`, "TARGET_USED_AS_SOURCE");
});

test("enforces rule and byte bounds", () => {
  const rules = Array.from({ length: MAX_ROLLUP_RULES + 1 }, (_, index) => `  - name: r${index}\n    source_field: S${index}\n    target_field: T${index}\n    reducer: sum\n`).join("");
  assertConfigError(`version: 1\nrollups:\n${rules}`, "TOO_MANY_RULES");
  assertConfigError(`${minimal}#${"x".repeat(MAX_CONFIG_BYTES)}\n`, "CONFIG_TOO_LARGE");
});

test("rejects unsafe or ambiguous YAML constructs", () => {
  assertConfigError(`${minimal}__proto__: { polluted: true }\n`, "UNKNOWN_KEY");
  assertConfigError("version: 1\nversion: 1\nrollups: []\n", "INVALID_YAML");
  assert.throws(
    () => parseIssuerollupConfig("version: 1\nrollups: &rules\n  - name: a\n    source_field: S\n    target_field: T\n    reducer: sum\ncopy: *rules\n"),
    (error: unknown) => error instanceof ConfigValidationError && ["UNSAFE_YAML", "UNKNOWN_KEY"].includes(error.code),
  );
  assertConfigError("version: 1\nrollups: !!js/function >\n  function() { return 1 }\n", "INVALID_YAML");
});

test("resolves exact unique numeric fields separately from config schema", () => {
  const config = parseIssuerollupConfig(minimal);
  const fields = [
    { id: 1, nodeId: "IFN_source", name: "Effort", dataType: "number" },
    { id: 2, nodeId: "IFN_target", name: "Total Effort", dataType: "number" },
  ] as const;
  const [rule] = resolveConfigFields(config, fields);
  assert.equal(rule?.source.id, 1);
  assert.equal(rule?.target.nodeId, "IFN_target");
  assert.throws(
    () => resolveConfigFields(config, [{ ...fields[0], dataType: "text" }, fields[1]]),
    (error: unknown) => error instanceof ConfigValidationError && error.code === "FIELD_NOT_NUMERIC",
  );
  assert.throws(
    () => resolveConfigFields(config, [fields[0]]),
    (error: unknown) => error instanceof ConfigValidationError && error.code === "FIELD_NOT_FOUND",
  );
});
