import type {
  IssueFieldDefinition,
  MutationOutcome,
  RepositoryIdentity,
  ResolvedField,
  TargetState,
} from "./domain.js";

export interface ConfigBlob {
  readonly content: string;
  readonly sha: string;
  readonly defaultBranch: string;
}

export interface ParentRef {
  readonly repository: RepositoryIdentity;
  readonly issueId: number;
  readonly issueNumber: number;
  readonly nodeId: string;
}

export interface ChildRef extends ParentRef {
  readonly hasSubIssues: boolean;
}

export interface FieldValue {
  readonly fieldId: number;
  readonly fieldName: string;
  readonly dataType: string;
  readonly value: number;
}

export interface ConfigSource {
  fetchConfig(repository: RepositoryIdentity): Promise<ConfigBlob | null>;
}

export interface FieldCatalogSource {
  listOrganizationFields(organization: string): Promise<readonly IssueFieldDefinition[]>;
}

export interface HierarchySource {
  getParent(repository: RepositoryIdentity, issueNumber: number): Promise<ParentRef | null>;
  listDirectChildren(repository: RepositoryIdentity, parentIssueNumber: number): Promise<readonly ChildRef[]>;
}

export interface FieldValueSource {
  listFieldValues(repository: RepositoryIdentity, issueNumber: number): Promise<readonly FieldValue[]>;
  readTarget(repository: RepositoryIdentity, issueNumber: number, field: ResolvedField): Promise<TargetState>;
}

/** Mutation `ambiguous` means callers must reload authoritative GitHub state and re-plan before any replay. */
export interface FieldWriter {
  createNumberValue(issueNodeId: string, field: ResolvedField, value: number): Promise<MutationOutcome>;
  updateNumberValue(issueNodeId: string, field: ResolvedField, value: number): Promise<MutationOutcome>;
  deleteValue(issueNodeId: string, field: ResolvedField): Promise<MutationOutcome>;
}

export interface GitHubAdapters {
  readonly config: ConfigSource;
  readonly fields: FieldCatalogSource;
  readonly hierarchy: HierarchySource;
  readonly values: FieldValueSource;
  readonly writer: FieldWriter;
}
