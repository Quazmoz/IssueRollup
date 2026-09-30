export const CONFIG_PATH = ".github/issuerollup.yml" as const;
export const CONFIG_VERSION = 1 as const;
export const WORK_ENVELOPE_VERSION = 1 as const;
export const GITHUB_REST_API_VERSION = "2026-03-10" as const;
export const GITHUB_ACCEPT = "application/vnd.github+json" as const;
export const MAX_CONFIG_BYTES = 64 * 1024;
export const MAX_ROLLUP_RULES = 16;

export interface RollupRule {
  readonly name: string;
  readonly sourceField: string;
  readonly targetField: string;
  readonly reducer: "sum";
  readonly missingValue: "ignore";
}

export interface IssuerollupConfig {
  readonly version: typeof CONFIG_VERSION;
  readonly rollups: readonly RollupRule[];
}

export interface IssueFieldDefinition {
  readonly id: number;
  readonly nodeId: string;
  readonly name: string;
  readonly dataType: string;
}

export interface ResolvedField {
  readonly id: number;
  readonly nodeId: string;
  readonly name: string;
}

export interface ResolvedRollupRule extends RollupRule {
  readonly source: ResolvedField;
  readonly target: ResolvedField;
}

export type Contribution =
  | { readonly kind: "value"; readonly value: number }
  | { readonly kind: "missing" };

export interface AggregateStats {
  readonly childCount: number;
  readonly contributingCount: number;
  readonly missingCount: number;
}

export type AggregateResult =
  | { readonly kind: "value"; readonly value: number; readonly stats: AggregateStats }
  | { readonly kind: "empty"; readonly stats: AggregateStats }
  | { readonly kind: "fail"; readonly reason: "NON_FINITE_INPUT" | "NON_FINITE_AGGREGATE"; readonly stats: AggregateStats };

export type TargetState =
  | { readonly kind: "unset" }
  | { readonly kind: "value"; readonly value: number };

export type WritePlan =
  | { readonly decision: "WRITE"; readonly mode: "CREATE" | "UPDATE"; readonly value: number }
  | { readonly decision: "CLEAR" }
  | { readonly decision: "NOOP" }
  | { readonly decision: "FAIL"; readonly reason: string };

export interface RepositoryIdentity {
  readonly id: number;
  readonly fullName: string;
}

export interface IssueIdentity {
  readonly id: number;
  readonly number: number;
  readonly nodeId?: string;
}

export type SupportedWebhookEvent = "issues" | "sub_issues";
export type IssuesAction = "field_added" | "field_removed";
export type SubIssuesAction =
  | "parent_issue_added"
  | "parent_issue_removed"
  | "sub_issue_added"
  | "sub_issue_removed";
export type SupportedWebhookAction = IssuesAction | SubIssuesAction;

export interface RelationshipIssueIdentity {
  readonly id: number;
  readonly number: number;
}

export interface RelationshipRoutingIdentity {
  readonly parentIssue: RelationshipIssueIdentity;
  readonly subIssue: RelationshipIssueIdentity;
}

export interface WorkEnvelopeV1 {
  readonly schemaVersion: typeof WORK_ENVELOPE_VERSION;
  readonly deliveryId: string;
  readonly receivedAt: string;
  readonly installationId: number;
  readonly event: SupportedWebhookEvent;
  readonly action: SupportedWebhookAction;
  readonly repository: RepositoryIdentity;
  readonly issue?: IssueIdentity;
  readonly relationship?: RelationshipRoutingIdentity;
}

export type DiagnosticDecision = "CREATE" | "UPDATE" | "CLEAR" | "NOOP" | "FAIL";

export interface WebhookDiagnosticEvent {
  readonly type: "webhook.accepted" | "webhook.rejected_signature" | "webhook.unsupported_action" | "webhook.invalid";
  readonly deliveryId?: string;
  readonly event?: string;
  readonly action?: string;
  readonly reason?: string;
}

export interface RollupDiagnosticEvent {
  readonly type: "rollup.decision";
  readonly deliveryId?: string;
  readonly installationId: number;
  readonly organization: string;
  readonly repository: string;
  readonly parentIssueNumber: number;
  readonly ruleName: string;
  readonly sourceField: string;
  readonly targetField: string;
  readonly directChildCount: number;
  readonly contributingCount: number;
  readonly missingCount: number;
  readonly oldTarget: number | null;
  readonly computedTarget: number | null;
  readonly decision: DiagnosticDecision;
  readonly errorClass?: ErrorClass;
}

export type ErrorClass =
  | "VALIDATION"
  | "CONFIGURATION"
  | "AUTHENTICATION"
  | "AUTHORIZATION"
  | "NOT_FOUND"
  | "GONE"
  | "RATE_LIMITED"
  | "RETRYABLE_READ"
  | "AMBIGUOUS_MUTATION"
  | "UNSUPPORTED_HIERARCHY"
  | "PERMANENT";

export type MutationOutcome =
  | { readonly kind: "applied" }
  | { readonly kind: "ambiguous"; readonly reason: "timeout" | "transport" | "server" };

export type DiagnosticEvent = WebhookDiagnosticEvent | RollupDiagnosticEvent;
