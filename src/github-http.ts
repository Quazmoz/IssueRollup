import {
  GITHUB_ACCEPT,
  GITHUB_REST_API_VERSION,
  type ErrorClass,
} from "./domain.js";
import { classifyGitHubFailure } from "./errors.js";

export type GitHubOperation = "read" | "mutation";
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface GitHubHttpClientOptions {
  readonly fetchImpl?: FetchLike;
  readonly apiBaseUrl?: string;
  readonly graphqlUrl?: string;
  readonly timeoutMs?: number;
}

interface GitHubRequestErrorDetails {
  classification: ErrorClass;
  status?: number;
  requestId?: string;
  retryAfterSeconds?: number;
  ambiguousReason?: "timeout" | "transport" | "server";
}

export class GitHubRequestError extends Error {
  readonly classification: ErrorClass;
  readonly status?: number;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;
  readonly ambiguousReason?: "timeout" | "transport" | "server";

  constructor(message: string, details: GitHubRequestErrorDetails) {
    super(message);
    this.name = "GitHubRequestError";
    this.classification = details.classification;
    if (details.status !== undefined) this.status = details.status;
    if (details.requestId !== undefined) this.requestId = details.requestId;
    if (details.retryAfterSeconds !== undefined) this.retryAfterSeconds = details.retryAfterSeconds;
    if (details.ambiguousReason !== undefined) this.ambiguousReason = details.ambiguousReason;
  }
}

function nonEmpty(value: string | null): string | undefined {
  return value !== null && value.length > 0 ? value : undefined;
}

function retryAfterSeconds(headers: Headers): number | undefined {
  const raw = headers.get("retry-after");
  if (raw === null) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function isRateLimited(status: number, headers: Headers): boolean {
  return status === 429 || (status === 403 && headers.get("x-ratelimit-remaining") === "0");
}

function transportFailureKind(error: unknown): "timeout" | "connection" {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return "timeout";
  return "connection";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export class GitHubHttpClient {
  readonly restBaseUrl: string;
  readonly graphqlUrl: string;

  private readonly token: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(token: string, options: GitHubHttpClientOptions = {}) {
    if (token.length === 0) throw new TypeError("GitHub installation token must be non-empty");
    const timeoutMs = options.timeoutMs ?? 10_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
      throw new TypeError("timeoutMs must be an integer between 1 and 60000");
    }

    this.token = token;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.restBaseUrl = (options.apiBaseUrl ?? "https://api.github.com").replace(/\/+$/, "");
    this.graphqlUrl = options.graphqlUrl ?? "https://api.github.com/graphql";
    this.timeoutMs = timeoutMs;
  }

  async restJson<T>(path: string): Promise<T> {
    if (!path.startsWith("/") || path.startsWith("//")) {
      throw new TypeError("REST path must be an absolute API path, not an arbitrary URL");
    }
    return this.requestJson<T>(`${this.restBaseUrl}${path}`, {
      method: "GET",
      operation: "read",
      rest: true,
    });
  }

  async graphqlMutation<T>(query: string, variables: Readonly<Record<string, unknown>>): Promise<T> {
    const payload = await this.requestJson<unknown>(this.graphqlUrl, {
      method: "POST",
      operation: "mutation",
      rest: false,
      body: JSON.stringify({ query, variables }),
    });

    const record = asRecord(payload);
    if (record === null) {
      throw new GitHubRequestError("GitHub GraphQL returned a non-object response", {
        classification: "PERMANENT",
      });
    }

    const errors = Array.isArray(record.errors) ? record.errors : [];
    if (errors.length > 0) {
      throw new GitHubRequestError("GitHub GraphQL returned an application error", {
        classification: "PERMANENT",
      });
    }
    if (!("data" in record)) {
      throw new GitHubRequestError("GitHub GraphQL response omitted data", {
        classification: "PERMANENT",
      });
    }

    return record.data as T;
  }

  private async requestJson<T>(
    url: string,
    input: {
      readonly method: "GET" | "POST";
      readonly operation: GitHubOperation;
      readonly rest: boolean;
      readonly body?: string;
    },
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: GITHUB_ACCEPT,
      Authorization: `Bearer ${this.token}`,
      "User-Agent": "IssueRollup/0.2",
    };
    if (input.rest) headers["X-GitHub-Api-Version"] = GITHUB_REST_API_VERSION;
    if (input.body !== undefined) headers["Content-Type"] = "application/json";

    let response: Response;
    try {
      const request: RequestInit = {
        method: input.method,
        headers,
        signal: AbortSignal.timeout(this.timeoutMs),
      };
      if (input.body !== undefined) request.body = input.body;
      response = await this.fetchImpl(url, request);
    } catch (error) {
      const transportFailure = transportFailureKind(error);
      const classification = classifyGitHubFailure({
        operation: input.operation,
        transportFailure,
      });
      const details: GitHubRequestErrorDetails = { classification };
      if (input.operation === "mutation") {
        details.ambiguousReason = transportFailure === "timeout" ? "timeout" : "transport";
      }
      throw new GitHubRequestError("GitHub request failed before a response was received", details);
    }

    if (!response.ok) {
      const classification = classifyGitHubFailure({
        operation: input.operation,
        status: response.status,
        rateLimited: isRateLimited(response.status, response.headers),
      });
      const details: GitHubRequestErrorDetails = {
        classification,
        status: response.status,
      };
      const requestId = nonEmpty(response.headers.get("x-github-request-id"));
      if (requestId !== undefined) details.requestId = requestId;
      const retryAfter = retryAfterSeconds(response.headers);
      if (retryAfter !== undefined) details.retryAfterSeconds = retryAfter;
      if (input.operation === "mutation" && response.status >= 500) details.ambiguousReason = "server";
      throw new GitHubRequestError(`GitHub returned HTTP ${response.status}`, details);
    }

    const body = await response.text();
    if (body.length === 0) return undefined as T;

    try {
      return JSON.parse(body) as T;
    } catch {
      const details: GitHubRequestErrorDetails = {
        classification: "PERMANENT",
        status: response.status,
      };
      const requestId = nonEmpty(response.headers.get("x-github-request-id"));
      if (requestId !== undefined) details.requestId = requestId;
      throw new GitHubRequestError("GitHub returned invalid JSON", details);
    }
  }
}
