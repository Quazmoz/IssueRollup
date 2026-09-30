import {
  CONFIG_PATH,
  type IssueFieldDefinition,
  type MutationOutcome,
  type RepositoryIdentity,
  type ResolvedField,
  type TargetState,
} from "./domain.js";
import type {
  ChildRef,
  ConfigBlob,
  ConfigSource,
  FieldCatalogSource,
  FieldValue,
  FieldValueSource,
  FieldWriter,
  GitHubAdapters,
  HierarchySource,
  IssueRef,
  IssueSource,
  ParentRef,
} from "./github.js";
import {
  GitHubHttpClient,
  GitHubRequestError,
  type GitHubHttpClientOptions,
} from "./github-http.js";

const PAGE_SIZE = 100;
const MAX_PAGES = 32;

export class GitHubBoundaryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GitHubBoundaryError";
    this.code = code;
  }
}

function boundary(code: string, message: string): never {
  throw new GitHubBoundaryError(code, message);
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    boundary("INVALID_RESPONSE", `${context} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) boundary("INVALID_RESPONSE", `${context} must be an array`);
  return value;
}

function stringField(record: Record<string, unknown>, key: string, context: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    boundary("INVALID_RESPONSE", `${context}.${key} must be a non-empty string`);
  }
  return value;
}

function positiveSafeInteger(record: Record<string, unknown>, key: string, context: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    boundary("INVALID_RESPONSE", `${context}.${key} must be a positive safe integer`);
  }
  return value;
}

function splitRepository(repository: RepositoryIdentity): { owner: string; name: string } {
  const parts = repository.fullName.split("/");
  const owner = parts[0];
  const name = parts[1];
  if (
    parts.length !== 2 ||
    owner === undefined ||
    name === undefined ||
    owner.length === 0 ||
    name.length === 0 ||
    owner.trim() !== owner ||
    name.trim() !== name ||
    /\s/.test(owner) ||
    /\s/.test(name)
  ) {
    throw new TypeError("repository.fullName must be exactly owner/name");
  }
  if (!Number.isSafeInteger(repository.id) || repository.id <= 0) {
    throw new TypeError("repository.id must be a positive safe integer");
  }
  return { owner, name };
}

function encodeSegment(value: string): string {
  return encodeURIComponent(value);
}

function repositoryFullNameFromApiUrl(value: unknown, context: string): string {
  if (typeof value !== "string") boundary("INVALID_RESPONSE", `${context}.repository_url must be a string`);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    boundary("INVALID_RESPONSE", `${context}.repository_url must be a valid URL`);
  }

  const parts = url.pathname.split("/").filter((part) => part.length > 0);
  if (parts.length !== 3 || parts[0] !== "repos" || parts[1] === undefined || parts[2] === undefined) {
    boundary("INVALID_RESPONSE", `${context}.repository_url must identify a repository`);
  }
  return `${decodeURIComponent(parts[1])}/${decodeURIComponent(parts[2])}`;
}

function parseIssueRef(value: unknown, context: string): IssueRef {
  const record = asRecord(value, context);
  return {
    repositoryFullName: repositoryFullNameFromApiUrl(record.repository_url, context),
    issueId: positiveSafeInteger(record, "id", context),
    issueNumber: positiveSafeInteger(record, "number", context),
    nodeId: stringField(record, "node_id", context),
  };
}

function parseIssueFieldDefinition(value: unknown, index: number): IssueFieldDefinition {
  const context = `issueFields[${index}]`;
  const record = asRecord(value, context);
  return {
    id: positiveSafeInteger(record, "id", context),
    nodeId: stringField(record, "node_id", context),
    name: stringField(record, "name", context),
    dataType: stringField(record, "data_type", context),
  };
}

function parseFieldValue(value: unknown, index: number): FieldValue {
  const context = `issueFieldValues[${index}]`;
  const record = asRecord(value, context);
  return {
    fieldId: positiveSafeInteger(record, "issue_field_id", context),
    fieldName: stringField(record, "issue_field_name", context),
    dataType: stringField(record, "data_type", context),
    value: record.value,
  };
}

function decodeBase64Config(value: unknown): string {
  if (typeof value !== "string") boundary("INVALID_RESPONSE", "config content must be base64 text");
  const compact = value.replace(/\s/g, "");
  if (compact.length === 0 || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    boundary("INVALID_RESPONSE", "config content is not valid base64");
  }
  return Buffer.from(compact, "base64").toString("utf8");
}

function targetFromValues(values: readonly FieldValue[], field: ResolvedField): TargetState {
  const matches = values.filter((value) => value.fieldId === field.id);
  if (matches.length === 0) return { kind: "unset" };
  if (matches.length > 1) boundary("AMBIGUOUS_FIELD_VALUE", `field ${field.name} has multiple values`);

  const match = matches[0];
  if (match === undefined) return { kind: "unset" };
  if (match.fieldName !== field.name || match.dataType !== "number") {
    boundary("FIELD_VALUE_MISMATCH", `field ${field.name} metadata does not match its resolved definition`);
  }
  if (typeof match.value !== "number" || !Number.isFinite(match.value)) {
    boundary("INVALID_NUMBER_VALUE", `field ${field.name} must contain a finite number`);
  }
  return { kind: "value", value: match.value };
}

export class GitHubRestAdapter
  implements ConfigSource, FieldCatalogSource, IssueSource, HierarchySource, FieldValueSource
{
  constructor(private readonly client: GitHubHttpClient) {}

  async fetchConfig(repository: RepositoryIdentity): Promise<ConfigBlob | null> {
    const { owner, name } = splitRepository(repository);
    const repoPath = `/repos/${encodeSegment(owner)}/${encodeSegment(name)}`;
    const metadata = asRecord(await this.client.restJson<unknown>(repoPath), "repository");
    const id = positiveSafeInteger(metadata, "id", "repository");
    const fullName = stringField(metadata, "full_name", "repository");
    const defaultBranch = stringField(metadata, "default_branch", "repository");
    if (id !== repository.id || fullName !== repository.fullName) {
      boundary("REPOSITORY_IDENTITY_MISMATCH", "repository identity returned by GitHub does not match the work item");
    }

    const path = `${repoPath}/contents/${CONFIG_PATH.split("/").map(encodeSegment).join("/")}?ref=${encodeSegment(defaultBranch)}`;
    let payload: unknown;
    try {
      payload = await this.client.restJson<unknown>(path);
    } catch (error) {
      if (error instanceof GitHubRequestError && error.status === 404) return null;
      throw error;
    }

    const record = asRecord(payload, "config");
    if (record.type !== "file" || record.encoding !== "base64") {
      boundary("INVALID_RESPONSE", "IssueRollup config must be a regular base64-encoded file");
    }

    return {
      content: decodeBase64Config(record.content),
      sha: stringField(record, "sha", "config"),
      defaultBranch,
    };
  }

  async listOrganizationFields(organization: string): Promise<readonly IssueFieldDefinition[]> {
    if (organization.length === 0 || organization.trim() !== organization || /[\s/]/.test(organization)) {
      throw new TypeError("organization must be a single non-empty GitHub owner name");
    }
    const payload = await this.client.restJson<unknown>(`/orgs/${encodeSegment(organization)}/issue-fields`);
    return asArray(payload, "issueFields").map(parseIssueFieldDefinition);
  }

  async getIssue(repository: RepositoryIdentity, issueNumber: number): Promise<IssueRef> {
    const { owner, name } = splitRepository(repository);
    if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) throw new TypeError("issueNumber must be positive");
    const payload = await this.client.restJson<unknown>(
      `/repos/${encodeSegment(owner)}/${encodeSegment(name)}/issues/${issueNumber}`,
    );
    const issue = parseIssueRef(payload, "issue");
    if (issue.repositoryFullName !== repository.fullName) {
      boundary("REPOSITORY_IDENTITY_MISMATCH", "issue response belongs to a different repository");
    }
    return issue;
  }

  async getParent(repository: RepositoryIdentity, issueNumber: number): Promise<ParentRef | null> {
    const { owner, name } = splitRepository(repository);
    if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) throw new TypeError("issueNumber must be positive");
    try {
      const payload = await this.client.restJson<unknown>(
        `/repos/${encodeSegment(owner)}/${encodeSegment(name)}/issues/${issueNumber}/parent`,
      );
      return parseIssueRef(payload, "parentIssue");
    } catch (error) {
      if (error instanceof GitHubRequestError && error.status === 404) return null;
      throw error;
    }
  }

  async listDirectChildren(repository: RepositoryIdentity, parentIssueNumber: number): Promise<readonly ChildRef[]> {
    const { owner, name } = splitRepository(repository);
    if (!Number.isSafeInteger(parentIssueNumber) || parentIssueNumber <= 0) {
      throw new TypeError("parentIssueNumber must be positive");
    }
    const values = await this.paginate(
      `/repos/${encodeSegment(owner)}/${encodeSegment(name)}/issues/${parentIssueNumber}/sub_issues`,
      "subIssues",
    );
    return values.map((value, index) => parseIssueRef(value, `subIssues[${index}]`));
  }

  async listFieldValues(repository: RepositoryIdentity, issueNumber: number): Promise<readonly FieldValue[]> {
    const { owner, name } = splitRepository(repository);
    if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) throw new TypeError("issueNumber must be positive");
    const values = await this.paginate(
      `/repos/${encodeSegment(owner)}/${encodeSegment(name)}/issues/${issueNumber}/issue-field-values`,
      "issueFieldValues",
    );
    return values.map(parseFieldValue);
  }

  async readTarget(
    repository: RepositoryIdentity,
    issueNumber: number,
    field: ResolvedField,
  ): Promise<TargetState> {
    return targetFromValues(await this.listFieldValues(repository, issueNumber), field);
  }

  private async paginate(path: string, context: string): Promise<unknown[]> {
    const collected: unknown[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const separator = path.includes("?") ? "&" : "?";
      const payload = await this.client.restJson<unknown>(
        `${path}${separator}per_page=${PAGE_SIZE}&page=${page}`,
      );
      const values = asArray(payload, context);
      collected.push(...values);
      if (values.length < PAGE_SIZE) return collected;
    }
    boundary("PAGINATION_LIMIT", `${context} exceeded the bounded pagination limit`);
  }
}

const CREATE_NUMBER_MUTATION = `
mutation CreateIssueRollupFieldValue($input: CreateIssueFieldValueInput!) {
  createIssueFieldValue(input: $input) {
    issue { id }
  }
}
`;

const UPDATE_NUMBER_MUTATION = `
mutation UpdateIssueRollupFieldValue($input: UpdateIssueFieldValueInput!) {
  updateIssueFieldValue(input: $input) {
    issue { id }
  }
}
`;

const DELETE_VALUE_MUTATION = `
mutation DeleteIssueRollupFieldValue($input: DeleteIssueFieldValueInput!) {
  deleteIssueFieldValue(input: $input) {
    issue { id }
    success
  }
}
`;

export class GitHubGraphqlFieldWriter implements FieldWriter {
  constructor(private readonly client: GitHubHttpClient) {}

  async createNumberValue(issueNodeId: string, field: ResolvedField, value: number): Promise<MutationOutcome> {
    return this.writeNumber("createIssueFieldValue", CREATE_NUMBER_MUTATION, issueNodeId, field, value);
  }

  async updateNumberValue(issueNodeId: string, field: ResolvedField, value: number): Promise<MutationOutcome> {
    return this.writeNumber("updateIssueFieldValue", UPDATE_NUMBER_MUTATION, issueNodeId, field, value);
  }

  async deleteValue(issueNodeId: string, field: ResolvedField): Promise<MutationOutcome> {
    this.validateMutationIdentity(issueNodeId, field);
    try {
      const data = await this.client.graphqlMutation<Record<string, unknown>>(DELETE_VALUE_MUTATION, {
        input: { issueId: issueNodeId, fieldId: field.nodeId },
      });
      const payload = asRecord(data.deleteIssueFieldValue, "deleteIssueFieldValue");
      const issue = asRecord(payload.issue, "deleteIssueFieldValue.issue");
      if (stringField(issue, "id", "deleteIssueFieldValue.issue") !== issueNodeId || payload.success !== true) {
        boundary("MUTATION_RESPONSE_MISMATCH", "deleteIssueFieldValue did not confirm the intended issue/value deletion");
      }
      return { kind: "applied" };
    } catch (error) {
      return this.mutationFailure(error);
    }
  }

  private async writeNumber(
    operation: "createIssueFieldValue" | "updateIssueFieldValue",
    query: string,
    issueNodeId: string,
    field: ResolvedField,
    value: number,
  ): Promise<MutationOutcome> {
    this.validateMutationIdentity(issueNodeId, field);
    if (!Number.isFinite(value)) throw new TypeError("number field mutations require a finite number");

    try {
      const data = await this.client.graphqlMutation<Record<string, unknown>>(query, {
        input: {
          issueId: issueNodeId,
          issueField: { fieldId: field.nodeId, numberValue: value },
        },
      });
      const payload = asRecord(data[operation], operation);
      const issue = asRecord(payload.issue, `${operation}.issue`);
      if (stringField(issue, "id", `${operation}.issue`) !== issueNodeId) {
        boundary("MUTATION_RESPONSE_MISMATCH", `${operation} returned a different issue`);
      }
      return { kind: "applied" };
    } catch (error) {
      return this.mutationFailure(error);
    }
  }

  private validateMutationIdentity(issueNodeId: string, field: ResolvedField): void {
    if (issueNodeId.length === 0) throw new TypeError("issueNodeId must be non-empty");
    if (field.nodeId.length === 0) throw new TypeError("field.nodeId must be non-empty");
  }

  private mutationFailure(error: unknown): MutationOutcome {
    if (error instanceof GitHubRequestError && error.classification === "AMBIGUOUS_MUTATION") {
      return {
        kind: "ambiguous",
        reason: error.ambiguousReason ?? "transport",
      };
    }
    throw error;
  }
}

export function createLiveGitHubAdapters(
  installationToken: string,
  options: GitHubHttpClientOptions = {},
): GitHubAdapters {
  const client = new GitHubHttpClient(installationToken, options);
  const rest = new GitHubRestAdapter(client);
  return {
    config: rest,
    fields: rest,
    issues: rest,
    hierarchy: rest,
    values: rest,
    writer: new GitHubGraphqlFieldWriter(client),
  };
}
