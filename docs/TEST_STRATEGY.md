# Test Strategy

## Goal

Prove the dangerous parts—GitHub authorization, event routing, and field mutation—rather than only testing arithmetic.

## 1. Pure unit tests

### Reducer

- integers;
- decimals;
- zero;
- negative finite numbers;
- empty contribution set;
- missing values;
- NaN/infinity rejected;
- order independence.

### Write planner

- target absent -> CREATE;
- target differs -> UPDATE;
- same -> NOOP;
- no contributions/leaf cleanup -> CLEAR;
- calculation error -> no write.

### Nested semantics

- leaf contribution;
- child-parent uses repaired derived target;
- post-order reconciliation;
- cycle guard;
- depth guard.

## 2. Config/schema tests

- minimal valid;
- full valid;
- wrong version;
- unknown keys;
- duplicate names;
- duplicate target ownership;
- source == target;
- target reused as another rule's source;
- missing fields;
- non-number fields;
- unsupported reducer/policy;
- rule count limit;
- malicious YAML constructs;
- oversized config.

## 3. Webhook tests

Use exact raw-byte signature fixtures.

Cover:

- valid SHA-256 signature;
- invalid signature;
- body tampering;
- missing signature;
- supported `issues` field actions;
- irrelevant `issues` action;
- `sub_issues.parent_issue_added`;
- `sub_issues.parent_issue_removed`;
- `sub_issues.sub_issue_added`;
- `sub_issues.sub_issue_removed`;
- unknown future action;
- duplicate delivery ID;
- malformed installation/repository identity.

Verify ingress can enqueue and respond inside the 10-second requirement.

## 4. Event-routing tests

- child source change -> parent rule;
- nested child target change -> ancestor rule;
- manual derived target edit -> self repair;
- self-generated target event not globally discarded;
- relation add -> parent;
- relation remove -> old parent;
- re-parent -> both sides when known;
- rule loaded from parent repository;
- cross-repository edge -> fail/no write.

## 5. REST adapter tests

Pin request headers:

~~~text
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2026-03-10
~~~

Verify:

- org field listing;
- config fetch on default branch;
- parent lookup;
- sub-issue pagination;
- field-value pagination;
- 401 refresh classification;
- 403 classification;
- 404 contextual handling;
- 410 handling;
- 422 nonretry;
- 5xx read retry;
- ambiguous mutation outcome triggers reload/re-plan rather than blind replay;
- rate-limit headers honored.

## 6. GraphQL writer tests

Mock/contract test:

- create one number field value;
- update one number field value;
- delete one number field value;
- unrelated fields preserved;
- no bulk-set mutation/path introduced accidentally;
- GraphQL error array parsed and classified.

## 7. Live GitHub App contract suite

Use a controlled organization-owned repository.

Required permissions must match production App settings.

Before field/hierarchy assertions, qualification must also prove:

- the harness authenticated by App JWT -> installation-token exchange, not by PAT/opaque token;
- GitHub's token response confirms exactly the requested test repository ID;
- repository metadata identifies an organization owner; user-owned repositories fail closed.

### Field catalog

- `Issue Fields: read` lists target/source definitions;
- numeric types and node IDs resolve.

### Basic rollup

- child A = 3;
- child B = 5;
- parent becomes 8.

### Mutation safety

Give parent unrelated fields:

- Priority;
- Owner text;
- Target Date.

After create/update/delete of Total Effort, assert all unrelated values remain unchanged.

### Field edit

3 + 5 -> change 5 to 7 -> parent becomes 10.

### Clear

Clear one source -> parent follows missing-value semantics.

### Relationship

Add/remove sub-issue -> parent changes.

### Last child

Remove final child -> derived target removed.

### Nested

Root -> parent -> leaves; change leaf and verify intermediate then root.

### Manual corruption

Set intermediate target to 999 manually; reconciliation restores correct intermediate and root.

### Cross-repository

Create a child in another repository under the same owner if GitHub permits it. Verify V1 detects/rejects the edge and performs no derived write.

### Installation scope

The Phase 2 harness always requests a token for exactly one repository and fails closed unless GitHub confirms that repository in the token response.

If practical, also test a selected-repository installation to confirm the documented V1 same-repo guarantee.

## 8. Reliability/failure injection

Simulate:

- queue unavailable before durable acceptance;
- worker crash before write;
- worker crash after write;
- duplicate job;
- failed job followed by redelivery with the same delivery ID;
- out-of-order jobs;
- two worker instances targeting the same parent/rule;
- stale-worker inversion attempt where the older calculation would otherwise finish last;
- timeout after GitHub applied a mutation but before the response reached the client;
- GitHub read timeout;
- 5xx;
- secondary rate limit;
- installation token expiry.

Assert keyed serialization/fencing prevents a stale final write. Assert ambiguous mutation recovery reloads/re-plans and does not blindly duplicate the write. Reconciliation must converge final state.

## Release gate

MVP is not complete until:

- all pure tests pass;
- signature/event fixtures pass;
- REST adapter tests pass;
- GraphQL single-field preservation is proven live;
- declared App permissions are sufficient live;
- same-repository nested rollup passes;
- cross-repository rejection passes;
- last-child cleanup passes;
- reconciliation repairs corruption;
- same-key concurrent workers cannot leave a stale final value;
- timeout-after-success mutation recovery is proven;
- no unrelated metadata is mutated.

## Phase 2 live harness

The controlled live matrix and credential-handling procedure are documented in [LIVE_CONTRACT_TEST.md](LIVE_CONTRACT_TEST.md). A live run is required before Phase 2 can be marked complete; mock adapter tests do not substitute for GitHub authorization and mutation-preservation evidence.
