import assert from "node:assert/strict";
import test from "node:test";

import { mutationKey } from "../src/mutation-key.js";
import { normalizeWebhook } from "../src/webhook/normalize.js";
import { verifyWebhookSignature } from "../src/webhook/signature.js";

const basePayload = {
  action: "field_added",
  installation: { id: 123 },
  repository: { id: 456, full_name: "acme/widgets" },
  issue: { id: 789, number: 42, node_id: "I_kwDOexample" },
};

test("verifies GitHub HMAC-SHA256 against exact raw bytes", () => {
  const secret = "It's a Secret to Everybody";
  const body = Buffer.from("Hello, World!", "utf8");
  const signature = "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17";
  assert.equal(verifyWebhookSignature(secret, body, signature), true);
  assert.equal(verifyWebhookSignature(secret, Buffer.from("Hello, World?", "utf8"), signature), false);
  assert.equal(verifyWebhookSignature(secret, body, `sha256=${"0".repeat(64)}`), false);
  assert.equal(verifyWebhookSignature(secret, body, undefined), false);
  assert.equal(verifyWebhookSignature(secret, body, "sha1=deadbeef"), false);
});

test("normalizes exact supported issues actions and safely classifies unknown actions", () => {
  for (const action of ["field_added", "field_removed"] as const) {
    const result = normalizeWebhook("issues", "delivery-1", { ...basePayload, action }, new Date("2026-09-30T20:00:00.000Z"));
    assert.equal(result.kind, "work");
    if (result.kind === "work") assert.equal(result.envelope.action, action);
  }
  assert.deepEqual(normalizeWebhook("issues", "delivery-1", { ...basePayload, action: "closed" }, new Date()), {
    kind: "unsupported",
    event: "issues",
    action: "closed",
  });
  assert.equal(normalizeWebhook("ping", "delivery-1", {}, new Date()).kind, "unsupported");
});

test("normalizes all supported sub_issues actions and retains relationship IDs after removal", () => {
  for (const action of ["parent_issue_added", "parent_issue_removed", "sub_issue_added", "sub_issue_removed"] as const) {
    const result = normalizeWebhook(
      "sub_issues",
      "delivery-2",
      {
        action,
        installation: { id: 123 },
        repository: { id: 456, full_name: "acme/widgets" },
        parent_issue_id: 1001,
        sub_issue_id: 1002,
      },
      new Date("2026-09-30T20:00:00.000Z"),
    );
    assert.equal(result.kind, "work");
    if (result.kind === "work") assert.deepEqual(result.envelope.relationship, { parentIssueId: 1001, subIssueId: 1002 });
  }
});

test("malformed external identities are rejected by runtime validation", () => {
  assert.equal(normalizeWebhook("issues", "delivery-1", { ...basePayload, installation: {} }, new Date()).kind, "invalid");
  assert.equal(normalizeWebhook("issues", "delivery-1", { ...basePayload, repository: { id: 456 } }, new Date()).kind, "invalid");
  assert.equal(normalizeWebhook("issues", "delivery-1", { ...basePayload, issue: { id: 789 } }, new Date()).kind, "invalid");
  assert.equal(normalizeWebhook("sub_issues", "delivery-2", { action: "sub_issue_removed", installation: { id: 123 }, repository: { id: 456, full_name: "acme/widgets" } }, new Date()).kind, "invalid");
});

test("mutation key is deterministic and scopes installation/repository/parent/rule", () => {
  const input = { installationId: 123, repositoryId: 456, parentIssueNumber: 42, ruleName: "total-effort" } as const;
  assert.equal(mutationKey(input), mutationKey({ ...input }));
  assert.notEqual(mutationKey(input), mutationKey({ ...input, parentIssueNumber: 43 }));
  assert.notEqual(mutationKey(input), mutationKey({ ...input, ruleName: "total-cost" }));
});
