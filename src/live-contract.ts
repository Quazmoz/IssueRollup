import { createInstallationToken } from "./github-app-auth.js";
import { createLiveGitHubAdapters } from "./github-live.js";
import type { FieldValue } from "./github.js";
import { executeParentRule } from "./rollup-engine.js";

const APPLY_SENTINEL = "YES_I_UNDERSTAND_THIS_WRITES_GITHUB";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function positiveIntegerEnv(name: string): number {
  const raw = requiredEnv(name);
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a positive integer`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive safe integer`);
  return value;
}

async function installationToken(repositoryId: number): Promise<string> {
  const directToken = process.env.ISSUEROLLUP_INSTALLATION_TOKEN;
  const hasAppCredentials =
    process.env.ISSUEROLLUP_APP_CLIENT_ID !== undefined ||
    process.env.ISSUEROLLUP_APP_PRIVATE_KEY !== undefined ||
    process.env.ISSUEROLLUP_INSTALLATION_ID !== undefined;

  if (directToken !== undefined && directToken.length > 0) {
    if (hasAppCredentials) {
      throw new Error("use either ISSUEROLLUP_INSTALLATION_TOKEN or GitHub App credentials, not both");
    }
    return directToken;
  }

  const token = await createInstallationToken({
    clientId: requiredEnv("ISSUEROLLUP_APP_CLIENT_ID"),
    privateKeyPem: requiredEnv("ISSUEROLLUP_APP_PRIVATE_KEY"),
    installationId: positiveIntegerEnv("ISSUEROLLUP_INSTALLATION_ID"),
    repositoryId,
  });
  return token.token;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;

  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    normalized[key] = canonicalize(record[key]);
  }
  return normalized;
}

function unrelatedFieldsFingerprint(values: readonly FieldValue[], targetFieldId: number): string {
  return JSON.stringify(
    values
      .filter((value) => value.fieldId !== targetFieldId)
      .map((value) => ({
        fieldId: value.fieldId,
        fieldName: value.fieldName,
        dataType: value.dataType,
        value: canonicalize(value.value),
      }))
      .sort((left, right) =>
        left.fieldId !== right.fieldId
          ? left.fieldId - right.fieldId
          : left.fieldName.localeCompare(right.fieldName),
      ),
  );
}

async function main(): Promise<void> {
  const applySetting = process.env.ISSUEROLLUP_APPLY;
  if (applySetting !== undefined && applySetting !== "" && applySetting !== APPLY_SENTINEL) {
    throw new Error(`ISSUEROLLUP_APPLY must be unset or exactly ${APPLY_SENTINEL}`);
  }
  const apply = applySetting === APPLY_SENTINEL;

  const repositoryId = positiveIntegerEnv("ISSUEROLLUP_REPOSITORY_ID");
  const repository = {
    id: repositoryId,
    fullName: requiredEnv("ISSUEROLLUP_REPOSITORY"),
  } as const;
  const parentIssueNumber = positiveIntegerEnv("ISSUEROLLUP_PARENT_ISSUE");
  const adapters = createLiveGitHubAdapters(await installationToken(repositoryId));

  const before = apply
    ? await adapters.values.listFieldValues(repository, parentIssueNumber)
    : null;

  const result = await executeParentRule(adapters, {
    repository,
    parentIssueNumber,
    ruleName: requiredEnv("ISSUEROLLUP_RULE"),
    apply,
  });

  let preservation: { readonly checked: boolean; readonly preserved?: boolean } = {
    checked: false,
  };
  if (apply && before !== null && result.kind === "completed") {
    const after = await adapters.values.listFieldValues(repository, parentIssueNumber);
    const targetFieldId = result.evaluation.rule.target.id;
    const preserved =
      unrelatedFieldsFingerprint(before, targetFieldId) ===
      unrelatedFieldsFingerprint(after, targetFieldId);
    preservation = { checked: true, preserved };
    if (!preserved) {
      process.stderr.write("IssueRollup live-contract detected a non-target field change.\n");
      process.exitCode = 3;
    }
  }

  process.stdout.write(
    `${JSON.stringify({ mode: apply ? "apply" : "dry-run", result, preservation }, null, 2)}\n`,
  );

  if (result.kind === "failed" || result.kind === "ambiguous") process.exitCode = 2;
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown live-contract failure";
  process.stderr.write(`IssueRollup live-contract failed: ${message}\n`);
  process.exitCode = 1;
});
