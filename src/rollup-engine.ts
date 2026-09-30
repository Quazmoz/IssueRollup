import {
  CONFIG_VERSION,
  type AggregateResult,
  type Contribution,
  type RepositoryIdentity,
  type ResolvedRollupRule,
  type TargetState,
  type WritePlan,
} from "./domain.js";
import { parseIssuerollupConfig, resolveConfigFields } from "./config.js";
import type { FieldValue, GitHubAdapters, IssueRef } from "./github.js";
import { planTargetWrite } from "./planner.js";
import { sumContributions } from "./reducer.js";

export type RollupEvaluationFailureReason =
  | "RULE_NOT_FOUND"
  | "UNSUPPORTED_CROSS_REPOSITORY_HIERARCHY"
  | "NESTED_HIERARCHY_DEFERRED"
  | "INVALID_SOURCE_VALUE"
  | "CALCULATION_FAILED";

export interface ParentRuleEvaluationInput {
  readonly repository: RepositoryIdentity;
  readonly parentIssueNumber: number;
  readonly ruleName: string;
}

export interface ReadyParentRuleEvaluation {
  readonly kind: "ready";
  readonly configSha: string;
  readonly parent: IssueRef;
  readonly rule: ResolvedRollupRule;
  readonly aggregate: Exclude<AggregateResult, { readonly kind: "fail" }>;
  readonly currentTarget: TargetState;
  readonly plan: WritePlan;
}

export type ParentRuleEvaluation =
  | { readonly kind: "disabled" }
  | { readonly kind: "failed"; readonly reason: RollupEvaluationFailureReason; readonly detail?: string }
  | ReadyParentRuleEvaluation;

export type ParentRuleExecution =
  | ParentRuleEvaluation
  | { readonly kind: "evaluated"; readonly evaluation: ReadyParentRuleEvaluation }
  | { readonly kind: "completed"; readonly changed: boolean; readonly evaluation: ReadyParentRuleEvaluation }
  | {
      readonly kind: "ambiguous";
      readonly reason: "timeout" | "transport" | "server";
      readonly evaluation: ReadyParentRuleEvaluation;
    }
  | {
      readonly kind: "failed";
      readonly reason: RollupEvaluationFailureReason | "POST_WRITE_VERIFICATION_FAILED";
      readonly detail?: string;
      readonly evaluation?: ReadyParentRuleEvaluation;
    };

function organizationFromRepository(repository: RepositoryIdentity): string {
  const parts = repository.fullName.split("/");
  const organization = parts[0];
  if (parts.length !== 2 || organization === undefined || organization.length === 0) {
    throw new TypeError("repository.fullName must be exactly owner/name");
  }
  return organization;
}

function contributionForField(values: readonly FieldValue[], rule: ResolvedRollupRule): Contribution | null {
  const matches = values.filter((value) => value.fieldId === rule.source.id);
  if (matches.length === 0) return { kind: "missing" };
  if (matches.length !== 1) return null;

  const match = matches[0];
  if (
    match === undefined ||
    match.fieldName !== rule.source.name ||
    match.dataType !== "number" ||
    typeof match.value !== "number" ||
    !Number.isFinite(match.value)
  ) {
    return null;
  }

  return { kind: "value", value: match.value };
}

function semanticallyEqualNumber(left: number, right: number): boolean {
  return (
    left === right ||
    (Object.is(left, -0) && Object.is(right, 0)) ||
    (Object.is(left, 0) && Object.is(right, -0))
  );
}

function targetMatchesPlan(target: TargetState, plan: WritePlan): boolean {
  if (plan.decision === "CLEAR") return target.kind === "unset";
  if (plan.decision !== "WRITE") return true;
  return target.kind === "value" && semanticallyEqualNumber(target.value, plan.value);
}

function failure(
  reason: RollupEvaluationFailureReason,
  detail?: string,
): ParentRuleEvaluation {
  return detail === undefined ? { kind: "failed", reason } : { kind: "failed", reason, detail };
}

export async function evaluateParentRule(
  adapters: GitHubAdapters,
  input: ParentRuleEvaluationInput,
): Promise<ParentRuleEvaluation> {
  if (!Number.isSafeInteger(input.parentIssueNumber) || input.parentIssueNumber <= 0) {
    throw new TypeError("parentIssueNumber must be a positive safe integer");
  }
  if (input.ruleName.length === 0) throw new TypeError("ruleName must be non-empty");

  const configBlob = await adapters.config.fetchConfig(input.repository);
  if (configBlob === null) return { kind: "disabled" };

  const config = parseIssuerollupConfig(configBlob.content);
  const configuredRule = config.rollups.find((rule) => rule.name === input.ruleName);
  if (configuredRule === undefined) return failure("RULE_NOT_FOUND");

  const organization = organizationFromRepository(input.repository);
  const fields = await adapters.fields.listOrganizationFields(organization);
  const resolved = resolveConfigFields(
    { version: CONFIG_VERSION, rollups: [configuredRule] },
    fields,
  )[0];
  if (resolved === undefined) return failure("RULE_NOT_FOUND");

  const parent = await adapters.issues.getIssue(input.repository, input.parentIssueNumber);
  const children = await adapters.hierarchy.listDirectChildren(input.repository, input.parentIssueNumber);

  for (const child of children) {
    if (child.repositoryFullName !== input.repository.fullName) {
      return failure(
        "UNSUPPORTED_CROSS_REPOSITORY_HIERARCHY",
        `child #${child.issueNumber} belongs to ${child.repositoryFullName}`,
      );
    }
  }

  const contributions: Contribution[] = [];
  for (const child of children) {
    const grandchildren = await adapters.hierarchy.listDirectChildren(input.repository, child.issueNumber);
    if (grandchildren.length > 0) {
      return failure(
        "NESTED_HIERARCHY_DEFERRED",
        `child #${child.issueNumber} has sub-issues; nested repair/propagation belongs to Phase 3`,
      );
    }

    const values = await adapters.values.listFieldValues(input.repository, child.issueNumber);
    const contribution = contributionForField(values, resolved);
    if (contribution === null) {
      return failure(
        "INVALID_SOURCE_VALUE",
        `child #${child.issueNumber} has an invalid or ambiguous value for ${resolved.source.name}`,
      );
    }
    contributions.push(contribution);
  }

  const aggregate = sumContributions(contributions);
  if (aggregate.kind === "fail") {
    return failure("CALCULATION_FAILED", aggregate.reason);
  }

  const currentTarget = await adapters.values.readTarget(
    input.repository,
    input.parentIssueNumber,
    resolved.target,
  );
  const plan = planTargetWrite(currentTarget, aggregate);

  if (plan.decision === "FAIL") {
    return failure("CALCULATION_FAILED", plan.reason);
  }

  return {
    kind: "ready",
    configSha: configBlob.sha,
    parent,
    rule: resolved,
    aggregate,
    currentTarget,
    plan,
  };
}

export async function executeParentRule(
  adapters: GitHubAdapters,
  input: ParentRuleEvaluationInput & { readonly apply?: boolean },
): Promise<ParentRuleExecution> {
  const evaluation = await evaluateParentRule(adapters, input);
  if (evaluation.kind !== "ready") return evaluation;
  if (input.apply !== true) return { kind: "evaluated", evaluation };

  const plan = evaluation.plan;
  if (plan.decision === "NOOP") {
    return { kind: "completed", changed: false, evaluation };
  }
  if (plan.decision === "FAIL") {
    return {
      kind: "failed",
      reason: "CALCULATION_FAILED",
      detail: plan.reason,
      evaluation,
    };
  }

  const outcome =
    plan.decision === "CLEAR"
      ? await adapters.writer.deleteValue(evaluation.parent.nodeId, evaluation.rule.target)
      : plan.mode === "CREATE"
        ? await adapters.writer.createNumberValue(
            evaluation.parent.nodeId,
            evaluation.rule.target,
            plan.value,
          )
        : await adapters.writer.updateNumberValue(
            evaluation.parent.nodeId,
            evaluation.rule.target,
            plan.value,
          );

  if (outcome.kind === "ambiguous") {
    return { kind: "ambiguous", reason: outcome.reason, evaluation };
  }

  const verifiedTarget = await adapters.values.readTarget(
    input.repository,
    input.parentIssueNumber,
    evaluation.rule.target,
  );
  if (!targetMatchesPlan(verifiedTarget, plan)) {
    return {
      kind: "failed",
      reason: "POST_WRITE_VERIFICATION_FAILED",
      detail: "GitHub state did not match the applied write plan after mutation",
      evaluation,
    };
  }

  return { kind: "completed", changed: true, evaluation };
}
