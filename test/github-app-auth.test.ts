import assert from "node:assert/strict";
import { generateKeyPairSync, verify, type KeyObject } from "node:crypto";
import test from "node:test";

import {
  createGitHubAppJwt,
  createInstallationToken,
  GitHubAppAuthError,
} from "../src/github-app-auth.js";
import type { FetchLike } from "../src/github-http.js";

function keyPair(): { privateKeyPem: string; publicKey: KeyObject } {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    privateKeyPem: pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKey: pair.publicKey,
  };
}

test("GitHub App JWT uses bounded RS256 claims and verifies with the public key", () => {
  const { privateKeyPem, publicKey } = keyPair();
  const now = 1_800_000_000;
  const jwt = createGitHubAppJwt("Iv1.client", privateKeyPem, now);
  const parts = jwt.split(".");
  assert.equal(parts.length, 3);

  const headerPart = parts[0];
  const payloadPart = parts[1];
  const signaturePart = parts[2];
  assert.ok(headerPart);
  assert.ok(payloadPart);
  assert.ok(signaturePart);

  const header = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8")) as {
    alg: string;
    typ: string;
  };
  const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as {
    iat: number;
    exp: number;
    iss: string;
  };
  assert.deepEqual(header, { alg: "RS256", typ: "JWT" });
  assert.equal(payload.iss, "Iv1.client");
  assert.equal(payload.iat, now - 60);
  assert.equal(payload.exp, now + 540);
  assert.equal(
    verify(
      "RSA-SHA256",
      Buffer.from(`${headerPart}.${payloadPart}`, "utf8"),
      publicKey,
      Buffer.from(signaturePart, "base64url"),
    ),
    true,
  );
});

test("installation token exchange is REST-version pinned and repository scoped", async () => {
  const { privateKeyPem } = keyPair();
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;
  const fetchImpl: FetchLike = async (input, init) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(
      JSON.stringify({
        token: "ghs_new_format_is_not_assumed",
        expires_at: "2027-01-16T00:00:00Z",
        repository_selection: "selected",
        repositories: [{ id: 456, full_name: "acme/widgets" }],
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    );
  };

  const token = await createInstallationToken(
    {
      clientId: "Iv1.client",
      privateKeyPem,
      installationId: 123,
      repositoryId: 456,
    },
    { fetchImpl, nowSeconds: 1_800_000_000 },
  );

  assert.equal(token.token, "ghs_new_format_is_not_assumed");
  assert.equal(token.repositoryId, 456);
  assert.equal(capturedUrl, "https://api.github.com/app/installations/123/access_tokens");
  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.get("x-github-api-version"), "2026-03-10");
  assert.match(headers.get("authorization") ?? "", /^Bearer [^.]+\.[^.]+\.[^.]+$/);
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), { repository_ids: [456] });
});

test("installation token exchange fails closed when GitHub confirms a different repository scope", async () => {
  const { privateKeyPem } = keyPair();
  const fetchImpl: FetchLike = async () =>
    new Response(
      JSON.stringify({
        token: "ghs_scoped_elsewhere",
        expires_at: "2027-01-16T00:00:00Z",
        repository_selection: "selected",
        repositories: [{ id: 999, full_name: "acme/other" }],
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    );

  await assert.rejects(
    () =>
      createInstallationToken(
        {
          clientId: "Iv1.client",
          privateKeyPem,
          installationId: 123,
          repositoryId: 456,
        },
        { fetchImpl, nowSeconds: 1_800_000_000 },
      ),
    (error: unknown) =>
      error instanceof GitHubAppAuthError &&
      error.classification === "PERMANENT" &&
      /different repository scope/.test(error.message),
  );
});

test("installation-token transport failures are classified without exposing credentials", async () => {
  const { privateKeyPem } = keyPair();
  const fetchImpl: FetchLike = async () => {
    const error = new Error("network");
    error.name = "TimeoutError";
    throw error;
  };

  await assert.rejects(
    () =>
      createInstallationToken(
        {
          clientId: "Iv1.client",
          privateKeyPem,
          installationId: 123,
          repositoryId: 456,
        },
        { fetchImpl, nowSeconds: 1_800_000_000 },
      ),
    (error: unknown) =>
      error instanceof GitHubAppAuthError &&
      error.classification === "RETRYABLE_READ" &&
      !error.message.includes(privateKeyPem),
  );
});
