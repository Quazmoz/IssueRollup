import { parseDocument } from "yaml";

import {
  CONFIG_VERSION,
  MAX_CONFIG_BYTES,
  MAX_ROLLUP_RULES,
  type IssuerollupConfig,
  type IssueFieldDefinition,
  type ResolvedField,
  type ResolvedRollupRule,
  type RollupRule,
} from "./domain.js";

const ROOT_KEYS = new Set(["version", "rollups"]);
const RULE_KEYS = new Set(["name", "source_field", "target_field", "reducer", "missing_value"]);

export class ConfigValidationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ConfigValidationError";
    this.code = code;
  }
}

function fail(code: string, message: string): never {
  throw new ConfigValidationError(code, message);
}

function asMap(value: unknown, context: string): Map<unknown, unknown> {
  if (!(value instanceof Map)) fail("INVALID_SHAPE", `${context} must be a mapping`);
  return value;
}

function asArray(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) fail("INVALID_SHAPE", `${context} must be an array`);
  return value;
}

function validateKnownKeys(map: Map<unknown, unknown>, allowed: ReadonlySet<string>, context: string): void {
  for (const key of map.keys()) {
    if (typeof key !== "string") fail("INVALID_KEY", `${context} keys must be strings`);
    if (!allowed.has(key)) fail("UNKNOWN_KEY", `${context} contains unknown key ${JSON.stringify(key)}`);
  }
}

function required(map: Map<unknown, unknown>, key: string, context: string): unknown {
  if (!map.has(key)) fail("MISSING_KEY", `${context} is missing required key ${JSON.stringify(key)}`);
  return map.get(key);
}

function stringValue(value: unknown, context: string): string {
  if (typeof value !== "string" || value.trim().length === 0) fail("INVALID_STRING", `${context} must be a non-empty string`);
  return value;
}

function parseRule(value: unknown, index: number): RollupRule {
  const context = `rollups[${index}]`;
  const map = asMap(value, context);
  validateKnownKeys(map, RULE_KEYS, context);

  const name = stringValue(required(map, "name", context), `${context}.name`);
  const sourceField = stringValue(required(map, "source_field", context), `${context}.source_field`);
  const targetField = stringValue(required(map, "target_field", context), `${context}.target_field`);
  const reducer = required(map, "reducer", context);
  if (reducer !== "sum") fail("UNSUPPORTED_REDUCER", `${context}.reducer must be "sum"`);

  const missingValue = map.has("missing_value") ? map.get("missing_value") : "ignore";
  if (missingValue !== "ignore") fail("UNSUPPORTED_MISSING_POLICY", `${context}.missing_value must be "ignore"`);
  if (sourceField === targetField) fail("SOURCE_EQUALS_TARGET", `${context} source_field and target_field must differ`);

  return { name, sourceField, targetField, reducer: "sum", missingValue: "ignore" };
}

function validateCrossRuleInvariants(rules: readonly RollupRule[]): void {
  const names = new Set<string>();
  const targetOwners = new Map<string, string>();
  const sourceFields = new Set(rules.map((rule) => rule.sourceField));

  for (const rule of rules) {
    if (names.has(rule.name)) fail("DUPLICATE_RULE_NAME", `duplicate rule name ${JSON.stringify(rule.name)}`);
    names.add(rule.name);

    const owner = targetOwners.get(rule.targetField);
    if (owner !== undefined) {
      fail("DUPLICATE_TARGET", `target field ${JSON.stringify(rule.targetField)} is owned by both ${JSON.stringify(owner)} and ${JSON.stringify(rule.name)}`);
    }
    targetOwners.set(rule.targetField, rule.name);
  }

  for (const rule of rules) {
    if (sourceFields.has(rule.targetField)) {
      fail("TARGET_USED_AS_SOURCE", `target field ${JSON.stringify(rule.targetField)} is also used as a source field`);
    }
  }
}

export function parseIssuerollupConfig(source: string): IssuerollupConfig {
  if (Buffer.byteLength(source, "utf8") > MAX_CONFIG_BYTES) {
    fail("CONFIG_TOO_LARGE", `configuration exceeds ${MAX_CONFIG_BYTES} bytes`);
  }

  const doc = parseDocument(source, {
    prettyErrors: false,
    strict: true,
    uniqueKeys: true,
    version: "1.2",
  });

  if (doc.errors.length > 0 || doc.warnings.length > 0) {
    fail("INVALID_YAML", "configuration must be valid, warning-free YAML 1.2");
  }

  let parsed: unknown;
  try {
    parsed = doc.toJS({ mapAsMap: true, maxAliasCount: 0 });
  } catch {
    fail("UNSAFE_YAML", "configuration may not use aliases or unsupported YAML constructs");
  }

  const root = asMap(parsed, "configuration");
  validateKnownKeys(root, ROOT_KEYS, "configuration");

  const version = required(root, "version", "configuration");
  if (version !== CONFIG_VERSION) fail("UNSUPPORTED_VERSION", `version must be ${CONFIG_VERSION}`);

  const rawRules = asArray(required(root, "rollups", "configuration"), "configuration.rollups");
  if (rawRules.length === 0) fail("EMPTY_RULES", "rollups must contain at least one rule");
  if (rawRules.length > MAX_ROLLUP_RULES) fail("TOO_MANY_RULES", `rollups may contain at most ${MAX_ROLLUP_RULES} rules`);

  const rules = rawRules.map(parseRule);
  validateCrossRuleInvariants(rules);
  return { version: CONFIG_VERSION, rollups: rules };
}

function resolveUniqueNumberField(name: string, fields: readonly IssueFieldDefinition[]): ResolvedField {
  const matches = fields.filter((field) => field.name === name);
  if (matches.length === 0) fail("FIELD_NOT_FOUND", `Issue Field ${JSON.stringify(name)} was not found`);
  if (matches.length > 1) fail("AMBIGUOUS_FIELD", `Issue Field ${JSON.stringify(name)} is not uniquely resolvable`);

  const match = matches[0];
  if (match === undefined) fail("FIELD_NOT_FOUND", `Issue Field ${JSON.stringify(name)} was not found`);
  if (match.dataType !== "number") fail("FIELD_NOT_NUMERIC", `Issue Field ${JSON.stringify(name)} must have data_type "number"`);
  if (!Number.isSafeInteger(match.id) || match.id <= 0) fail("INVALID_FIELD_ID", `Issue Field ${JSON.stringify(name)} has an invalid REST id`);
  if (match.nodeId.length === 0) fail("INVALID_FIELD_NODE_ID", `Issue Field ${JSON.stringify(name)} has an invalid GraphQL node id`);

  return { id: match.id, nodeId: match.nodeId, name: match.name };
}

export function resolveConfigFields(
  config: IssuerollupConfig,
  fields: readonly IssueFieldDefinition[],
): readonly ResolvedRollupRule[] {
  return config.rollups.map((rule) => ({
    ...rule,
    source: resolveUniqueNumberField(rule.sourceField, fields),
    target: resolveUniqueNumberField(rule.targetField, fields),
  }));
}
