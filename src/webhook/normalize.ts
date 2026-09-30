import {
  WORK_ENVELOPE_VERSION,
  type IssueIdentity,
  type IssuesAction,
  type RelationshipIssueIdentity,
  type RepositoryIdentity,
  type SubIssuesAction,
  type WorkEnvelopeV1,
} from "../domain.js";

const ISSUES_ACTIONS = new Set<IssuesAction>(["field_added", "field_removed"]);
const SUB_ISSUES_ACTIONS = new Set<SubIssuesAction>([
  "parent_issue_added",
  "parent_issue_removed",
  "sub_issue_added",
  "sub_issue_removed",
]);

export type NormalizeWebhookResult =
  | { readonly kind: "work"; readonly envelope: WorkEnvelopeV1 }
  | { readonly kind: "unsupported"; readonly event: string; readonly action: string | null }
  | { readonly kind: "invalid"; readonly reason: string };

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function positiveSafeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function repositoryIdentity(payload: Record<string, unknown>): RepositoryIdentity | null {
  const repo = record(payload.repository);
  if (repo === null) return null;
  const id = positiveSafeInteger(repo.id);
  const fullName = nonEmptyString(repo.full_name);
  if (id === null || fullName === null) return null;
  const parts = fullName.split("/");
  if (parts.length !== 2 || parts.some((part) => part.length === 0 || part.trim() !== part || /\s/.test(part))) return null;
  return { id, fullName };
}

function issueIdentity(payload: Record<string, unknown>): IssueIdentity | null {
  const issue = record(payload.issue);
  if (issue === null) return null;
  const id = positiveSafeInteger(issue.id);
  const number = positiveSafeInteger(issue.number);
  if (id === null || number === null) return null;
  const nodeId = nonEmptyString(issue.node_id);
  return nodeId === null ? { id, number } : { id, number, nodeId };
}

function relationshipIssueIdentity(value: unknown): RelationshipIssueIdentity | null {
  const issue = record(value);
  if (issue === null) return null;
  const id = positiveSafeInteger(issue.id);
  const number = positiveSafeInteger(issue.number);
  return id === null || number === null ? null : { id, number };
}

export function normalizeWebhook(
  eventHeader: string | null | undefined,
  deliveryId: string | null | undefined,
  payload: unknown,
  receivedAt: Date,
): NormalizeWebhookResult {
  if (!Number.isFinite(receivedAt.getTime())) return { kind: "invalid", reason: "receivedAt must be a valid timestamp" };
  const event = eventHeader ?? "";
  if (event !== "issues" && event !== "sub_issues") {
    return { kind: "unsupported", event, action: null };
  }

  const body = record(payload);
  if (body === null) return { kind: "invalid", reason: "payload must be an object" };
  const action = nonEmptyString(body.action);
  if (action === null) return { kind: "invalid", reason: "payload action is required" };

  const supported = event === "issues" ? ISSUES_ACTIONS.has(action as IssuesAction) : SUB_ISSUES_ACTIONS.has(action as SubIssuesAction);
  if (!supported) return { kind: "unsupported", event, action };

  const delivery = nonEmptyString(deliveryId);
  if (delivery === null) return { kind: "invalid", reason: "X-GitHub-Delivery is required" };
  const installation = record(body.installation);
  const installationId = installation === null ? null : positiveSafeInteger(installation.id);
  if (installationId === null) return { kind: "invalid", reason: "installation.id is required" };
  const repository = repositoryIdentity(body);
  if (repository === null) return { kind: "invalid", reason: "repository.id and repository.full_name are required" };

  const common = {
    schemaVersion: WORK_ENVELOPE_VERSION,
    deliveryId: delivery,
    receivedAt: receivedAt.toISOString(),
    installationId,
    repository,
  } as const;

  if (event === "issues") {
    const issue = issueIdentity(body);
    if (issue === null) return { kind: "invalid", reason: "issue.id and issue.number are required for issues events" };
    return {
      kind: "work",
      envelope: { ...common, event: "issues", action: action as IssuesAction, issue },
    };
  }

  const parentIssueId = positiveSafeInteger(body.parent_issue_id);
  const subIssueId = positiveSafeInteger(body.sub_issue_id);
  const parentIssue = relationshipIssueIdentity(body.parent_issue);
  const subIssue = relationshipIssueIdentity(body.sub_issue);
  if (parentIssueId === null || subIssueId === null || parentIssue === null || subIssue === null) {
    return {
      kind: "invalid",
      reason: "parent_issue_id, sub_issue_id, parent_issue.id/number, and sub_issue.id/number are required for sub_issues events",
    };
  }
  if (parentIssue.id !== parentIssueId || subIssue.id !== subIssueId) {
    return { kind: "invalid", reason: "sub_issues relationship identifiers are inconsistent" };
  }

  return {
    kind: "work",
    envelope: {
      ...common,
      event: "sub_issues",
      action: action as SubIssuesAction,
      relationship: { parentIssue, subIssue },
    },
  };
}
