export interface MutationKeyInput {
  readonly installationId: number;
  readonly repositoryId: number;
  readonly parentIssueNumber: number;
  readonly ruleName: string;
}

export function mutationKey(input: MutationKeyInput): string {
  if (!Number.isSafeInteger(input.installationId) || input.installationId <= 0) throw new TypeError("installationId must be a positive safe integer");
  if (!Number.isSafeInteger(input.repositoryId) || input.repositoryId <= 0) throw new TypeError("repositoryId must be a positive safe integer");
  if (!Number.isSafeInteger(input.parentIssueNumber) || input.parentIssueNumber <= 0) throw new TypeError("parentIssueNumber must be a positive safe integer");
  if (input.ruleName.length === 0) throw new TypeError("ruleName must be non-empty");
  return `v1|${input.installationId}|${input.repositoryId}|${input.parentIssueNumber}|${input.ruleName}`;
}
