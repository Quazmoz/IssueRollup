import type { ErrorClass } from "./domain.js";

export interface HttpFailureContext {
  readonly operation: "read" | "mutation";
  readonly status?: number;
  readonly transportFailure?: "timeout" | "connection";
  readonly rateLimited?: boolean;
}

export function classifyGitHubFailure(context: HttpFailureContext): ErrorClass {
  if (context.operation === "mutation" && (context.transportFailure !== undefined || (context.status !== undefined && context.status >= 500))) {
    return "AMBIGUOUS_MUTATION";
  }
  if (context.rateLimited === true || context.status === 429) return "RATE_LIMITED";
  if (context.transportFailure !== undefined || (context.status !== undefined && context.status >= 500)) return "RETRYABLE_READ";
  if (context.status === 401) return "AUTHENTICATION";
  if (context.status === 403) return "AUTHORIZATION";
  if (context.status === 404) return "NOT_FOUND";
  if (context.status === 410) return "GONE";
  return "PERMANENT";
}
