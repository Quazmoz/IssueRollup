import assert from "node:assert/strict";
import test from "node:test";

import type { ResolvedField } from "../src/domain.js";
import {
  GitHubGraphqlFieldWriter,
  GitHubRestAdapter,
} from "../src/github-live.js";
import {
  GitHubHttpClient,
  GitHubRequestError,
  type FetchLike,
} from "../src/github-http.js";

interface CapturedRequest {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

function jsonResponse(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...Object.fromEntries(new Headers(headers)) },
  });
}

test("REST client pins GitHub headers and rejects arbitrary URLs", async () => {
  const captured: CapturedRequest[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    captured.push({ url: String(input), init });
    return jsonResponse({ ok: true });
  };
  const client = new GitHubHttpClient("installation-token", { fetchImpl });

  await client.restJson("/repos/acme/widgets");
  const request = captured[0];
  assert.ok(request);
  const headers = new Headers(request.init?.headers);
  assert.equal(request.url, "https://api.github.com/repos/acme/widgets");
  assert.equal(headers.get("accept"), "application/vnd.github+json");
  assert.equal(headers.get("x-github-api-version"), "2026-03-10");
  assert.equal(headers.get("authorization"), "Bearer installation-token");
  await assert.rejects(() => client.restJson("https://example.invalid/steal"), TypeError);
});

test("transport and mutation failures receive explicit classifications", async () => {
  const timeoutFetch: FetchLike = async () => {
    const error = new Error("deadline");
    error.name = "TimeoutError";
    throw error;
  };
  const readClient = new GitHubHttpClient("token", { fetchImpl: timeoutFetch });
  await assert.rejects(
    () => readClient.restJson("/repos/acme/widgets"),
    (error: unknown) =>
      error instanceof GitHubRequestError &&
      error.classification === "RETRYABLE_READ" &&
      error.ambiguousReason === undefined,
  );

  const serverFetch: FetchLike = async () => jsonResponse({ message: "server" }, 503);
  const writer = new GitHubGraphqlFieldWriter(new GitHubHttpClient("token", { fetchImpl: serverFetch }));
  const field: ResolvedField = { id: 2, nodeId: "IFN_total", name: "Total Effort" };
  assert.deepEqual(await writer.updateNumberValue("I_parent", field, 8), {
    kind: "ambiguous",
    reason: "server",
  });
});

test("REST adapter loads config, fields, hierarchy, issue identity, and numeric values", async () => {
  const config = "version: 1\nrollups:\n  - name: total-effort\n    source_field: Effort\n    target_field: Total Effort\n    reducer: sum\n";
  const fetchImpl: FetchLike = async (input) => {
    const url = new URL(String(input));
    const route = `${url.pathname}${url.search}`;
    if (route === "/repos/acme/widgets") {
      return jsonResponse({ id: 456, full_name: "acme/widgets", default_branch: "main" });
    }
    if (
      route ===
      "/repos/acme/widgets/contents/.github/issuerollup.yml?ref=main"
    ) {
      return jsonResponse({
        type: "file",
        encoding: "base64",
        content: Buffer.from(config, "utf8").toString("base64"),
        sha: "config-sha",
      });
    }
    if (route === "/orgs/acme/issue-fields") {
      return jsonResponse([
        { id: 1, node_id: "IFN_effort", name: "Effort", data_type: "number" },
        { id: 2, node_id: "IFN_total", name: "Total Effort", data_type: "number" },
      ]);
    }
    if (route === "/repos/acme/widgets/issues/10") {
      return jsonResponse({
        id: 1000,
        node_id: "I_parent",
        number: 10,
        repository_url: "https://api.github.com/repos/acme/widgets",
      });
    }
    if (route === "/repos/acme/widgets/issues/10/sub_issues?per_page=100&page=1") {
      return jsonResponse([
        {
          id: 1001,
          node_id: "I_child",
          number: 11,
          repository_url: "https://api.github.com/repos/acme/widgets",
        },
      ]);
    }
    if (route === "/repos/acme/widgets/issues/11/issue-field-values?per_page=100&page=1") {
      return jsonResponse([
        { issue_field_id: 1, issue_field_name: "Effort", data_type: "number", value: 3 },
      ]);
    }
    if (route === "/repos/acme/widgets/issues/10/issue-field-values?per_page=100&page=1") {
      return jsonResponse([
        { issue_field_id: 2, issue_field_name: "Total Effort", data_type: "number", value: 7 },
      ]);
    }
    throw new Error(`unexpected route ${route}`);
  };

  const adapter = new GitHubRestAdapter(new GitHubHttpClient("token", { fetchImpl }));
  const repository = { id: 456, fullName: "acme/widgets" } as const;

  assert.equal((await adapter.fetchConfig(repository))?.content, config);
  assert.deepEqual(await adapter.listOrganizationFields("acme"), [
    { id: 1, nodeId: "IFN_effort", name: "Effort", dataType: "number" },
    { id: 2, nodeId: "IFN_total", name: "Total Effort", dataType: "number" },
  ]);
  assert.deepEqual(await adapter.getIssue(repository, 10), {
    repositoryFullName: "acme/widgets",
    issueId: 1000,
    issueNumber: 10,
    nodeId: "I_parent",
  });
  assert.equal((await adapter.listDirectChildren(repository, 10))[0]?.issueNumber, 11);
  assert.deepEqual(await adapter.listFieldValues(repository, 11), [
    { fieldId: 1, fieldName: "Effort", dataType: "number", value: 3 },
  ]);
  assert.deepEqual(
    await adapter.readTarget(repository, 10, {
      id: 2,
      nodeId: "IFN_total",
      name: "Total Effort",
    }),
    { kind: "value", value: 7 },
  );
});

test("GraphQL writer uses static single-field mutations with variable-bound values", async () => {
  const captured: CapturedRequest[] = [];
  const fetchImpl: FetchLike = async (input, init) => {
    captured.push({ url: String(input), init });
    return jsonResponse({
      data: { createIssueFieldValue: { issue: { id: "I_parent" } } },
    });
  };
  const writer = new GitHubGraphqlFieldWriter(new GitHubHttpClient("token", { fetchImpl }));
  const field: ResolvedField = { id: 2, nodeId: "IFN_total", name: "Total Effort" };

  assert.deepEqual(await writer.createNumberValue("I_parent", field, 8), { kind: "applied" });
  const request = captured[0];
  assert.ok(request);
  assert.equal(request.url, "https://api.github.com/graphql");
  const body = JSON.parse(String(request.init?.body)) as {
    query: string;
    variables: { input: { issueId: string; issueField: { fieldId: string; numberValue: number } } };
  };
  assert.match(body.query, /createIssueFieldValue/);
  assert.equal(body.variables.input.issueId, "I_parent");
  assert.deepEqual(body.variables.input.issueField, {
    fieldId: "IFN_total",
    numberValue: 8,
  });
  assert.doesNotMatch(body.query, /issue-field-values/);
});
