import assert from "node:assert/strict";
import test from "node:test";

import { classifyGitHubFailure } from "../src/errors.js";

test("classifies read failures separately from ambiguous mutation outcomes", () => {
  assert.equal(classifyGitHubFailure({ operation: "read", status: 503 }), "RETRYABLE_READ");
  assert.equal(classifyGitHubFailure({ operation: "mutation", status: 503 }), "AMBIGUOUS_MUTATION");
  assert.equal(classifyGitHubFailure({ operation: "mutation", transportFailure: "timeout" }), "AMBIGUOUS_MUTATION");
  assert.equal(classifyGitHubFailure({ operation: "read", status: 401 }), "AUTHENTICATION");
  assert.equal(classifyGitHubFailure({ operation: "read", status: 403 }), "AUTHORIZATION");
  assert.equal(classifyGitHubFailure({ operation: "read", status: 404 }), "NOT_FOUND");
  assert.equal(classifyGitHubFailure({ operation: "read", status: 410 }), "GONE");
  assert.equal(classifyGitHubFailure({ operation: "read", status: 429 }), "RATE_LIMITED");
  assert.equal(classifyGitHubFailure({ operation: "read", status: 422 }), "PERMANENT");
});
