import { createPrivateKey, createSign } from "node:crypto";

import {
  GITHUB_ACCEPT,
  GITHUB_REST_API_VERSION,
  type ErrorClass,
} from "./domain.js";
import { classifyGitHubFailure } from "./errors.js";
import type { FetchLike } from "./github-http.js";

const DEFAULT_TIMEOUT_MS = 10_000;

export interface GitHubAppAuthOptions {
  readonly fetchImpl?: FetchLike;
  readonly apiBaseUrl?: string;
  readonly timeoutMs?: number;
  readonly nowSeconds?: number;
}

export interface InstallationToken {
  readonly token: string;
  readonly expiresAt: string;
  /** Repository ID confirmed by GitHub in the repository-scoped token response. */
  readonly repositoryId: number;
}

interface GitHubAppAuthErrorDetails {
  classification: ErrorClass;
  status?: number;
  requestId?: string;
}

export class GitHubAppAuthError extends Error {
  readonly classification: ErrorClass;
  readonly status?: number;
  readonly requestId?: string;

  constructor(message: string, details: GitHubAppAuthErrorDetails) {
    super(message);
    this.name = "GitHubAppAuthError";
    this.classification = details.classification;
    if (details.status !== undefined) this.status = details.status;
    if (details.requestId !== undefined) this.requestId = details.requestId;
  }
}

function validatePositiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive safe integer`);
}

function validateTimeout(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 60_000) {
    throw new TypeError("timeoutMs must be an integer between 1 and 60000");
  }
}

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function validNowSeconds(nowSeconds: number): number {
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds <= 0) {
    throw new TypeError("nowSeconds must be a positive safe integer Unix timestamp");
  }
  return nowSeconds;
}

function isRateLimited(status: number, headers: Headers): boolean {
  return status === 429 || (status === 403 && headers.get("x-ratelimit-remaining") === "0");
}

function transportFailure(error: unknown): "timeout" | "connection" {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return "timeout";
  return "connection";
}

export function createGitHubAppJwt(
  clientId: string,
  privateKeyPem: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): string {
  if (clientId.length === 0) throw new TypeError("GitHub App client ID must be non-empty");
  if (privateKeyPem.length === 0) throw new TypeError("GitHub App private key must be non-empty");

  const now = validNowSeconds(nowSeconds);
  const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
  const payload = base64UrlJson({
    iat: now - 60,
    exp: now + 9 * 60,
    iss: clientId,
  });
  const signingInput = `${header}.${payload}`;

  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== "rsa") {
    throw new TypeError("GitHub App private key must be RSA");
  }

  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(key).toString("base64url");
  return `${signingInput}.${signature}`;
}

export async function createInstallationToken(
  input: {
    readonly clientId: string;
    readonly privateKeyPem: string;
    readonly installationId: number;
    readonly repositoryId: number;
  },
  options: GitHubAppAuthOptions = {},
): Promise<InstallationToken> {
  validatePositiveSafeInteger(input.installationId, "installationId");
  validatePositiveSafeInteger(input.repositoryId, "repositoryId");

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  validateTimeout(timeoutMs);
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const jwt = createGitHubAppJwt(input.clientId, input.privateKeyPem, now);
  const apiBaseUrl = (options.apiBaseUrl ?? "https://api.github.com").replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchImpl(
      `${apiBaseUrl}/app/installations/${input.installationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          Accept: GITHUB_ACCEPT,
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
          "User-Agent": "IssueRollup/0.2",
          "X-GitHub-Api-Version": GITHUB_REST_API_VERSION,
        },
        body: JSON.stringify({ repository_ids: [input.repositoryId] }),
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
  } catch (error) {
    throw new GitHubAppAuthError("GitHub installation-token request failed before a response was received", {
      classification: classifyGitHubFailure({
        operation: "read",
        transportFailure: transportFailure(error),
      }),
    });
  }

  if (!response.ok) {
    const details: GitHubAppAuthErrorDetails = {
      classification: classifyGitHubFailure({
        operation: "read",
        status: response.status,
        rateLimited: isRateLimited(response.status, response.headers),
      }),
      status: response.status,
    };
    const requestId = response.headers.get("x-github-request-id");
    if (requestId !== null && requestId.length > 0) details.requestId = requestId;
    throw new GitHubAppAuthError(
      `GitHub installation-token request failed with HTTP ${response.status}`,
      details,
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(await response.text()) as unknown;
  } catch {
    throw new GitHubAppAuthError("GitHub installation-token response was invalid JSON", {
      classification: "PERMANENT",
      status: response.status,
    });
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new GitHubAppAuthError("GitHub installation-token response must be an object", {
      classification: "PERMANENT",
      status: response.status,
    });
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.token !== "string" || record.token.length === 0) {
    throw new GitHubAppAuthError("GitHub installation-token response omitted token", {
      classification: "PERMANENT",
      status: response.status,
    });
  }
  if (typeof record.expires_at !== "string" || !Number.isFinite(Date.parse(record.expires_at))) {
    throw new GitHubAppAuthError("GitHub installation-token response omitted a valid expires_at", {
      classification: "PERMANENT",
      status: response.status,
    });
  }

  if (!Array.isArray(record.repositories) || record.repositories.length !== 1) {
    throw new GitHubAppAuthError(
      "GitHub installation-token response did not confirm the requested single-repository scope",
      {
        classification: "PERMANENT",
        status: response.status,
      },
    );
  }
  const scopedRepository = record.repositories[0];
  if (
    typeof scopedRepository !== "object" ||
    scopedRepository === null ||
    Array.isArray(scopedRepository) ||
    typeof (scopedRepository as Record<string, unknown>).id !== "number" ||
    !Number.isSafeInteger((scopedRepository as Record<string, unknown>).id) ||
    (scopedRepository as Record<string, unknown>).id !== input.repositoryId
  ) {
    throw new GitHubAppAuthError(
      "GitHub installation-token response confirmed a different repository scope",
      {
        classification: "PERMANENT",
        status: response.status,
      },
    );
  }

  return {
    token: record.token,
    expiresAt: record.expires_at,
    repositoryId: input.repositoryId,
  };
}
