# Architecture

## Goal

Keep rollup **calculation state** in GitHub while making webhook delivery handling production-safe.

V1 has no product database containing a second copy of issue hierarchy or field values. A production deployment may use infrastructure state such as a durable queue, short-lived deduplication keys, and logs.

## Current implementation stack

Phase 1/2 currently uses:

- TypeScript with strict type checking;
- Node.js 24.21.0 pinned in repository/runtime metadata;
- Node's built-in `fetch` behind narrow GitHub REST/GraphQL adapters;
- Node crypto for webhook HMAC verification and GitHub App RS256 JWT signing;
- explicit runtime validators at GitHub/config/webhook boundaries;
- `yaml` in strict/safe configuration parsing;
- Node's built-in test runner;
- no web framework or production queue yet.

A durable queue and HTTP ingress framework remain deployment decisions for Phase 3. Adding Octokit, Probot, Zod, Vitest, or another abstraction requires a concrete correctness/maintenance benefit rather than duplicating capabilities already present in the narrow implementation.

## Runtime topology

~~~text
GitHub
   |
   | webhook
   v
Ingress
  - raw-body HMAC verification
  - event/action allowlist
  - basic payload validation
  - enqueue
   |
   | durable work item
   v
Worker
  - installation token
  - find parent
  - load parent repo config
  - resolve fields
  - list children
  - validate same-repo boundary
  - read current values
  - calculate
  - create/update/delete target
  - propagate ancestor
~~~

Ingress should do no GitHub fan-out work before acknowledgement other than what is necessary to validate and durably accept the delivery.

## Core components

### Webhook ingress

Responsibilities:

- preserve raw request body;
- verify `X-Hub-Signature-256`;
- inspect `X-GitHub-Event`;
- validate supported action;
- capture `X-GitHub-Delivery`;
- validate installation/repository/issue identity;
- durably enqueue;
- respond 2XX within 10 seconds after successful acceptance.

If durable acceptance fails, do not claim success.

For production, "durably enqueue" means the queue/transport has acknowledged persistence outside the ingress process's volatile memory. An in-memory queue is acceptable only for local tests, never as the production acceptance boundary.

The normalized work envelope should contain only routing/correlation data needed after acknowledgement, such as:

- delivery ID;
- installation ID;
- event and action;
- repository ID/full name;
- primary issue ID/number when present;
- parent/sub-issue IDs supplied by relationship events when present;
- receive timestamp/schema version.

Field values from the webhook remain untrusted hints and are not persisted as authoritative calculation inputs.

### Event normalizer/router

Maps external event/action payloads into bounded recalculation candidates.

It may use payload data to identify candidates, but final calculation uses current API state.

### GitHub installation client

The Phase 2 live harness requires environment-provided GitHub App credentials, signs a short-lived RS256 App JWT, and exchanges it for an installation token requested for exactly the controlled test repository. The exchange fails closed unless GitHub's response confirms exactly that repository ID. The qualification harness intentionally does not accept an opaque pre-minted token, so a PAT or unverified token cannot stand in for GitHub App authentication evidence.

Production requirements remain:

- cache only within token lifetime;
- refresh on expiry/one justified 401 retry;
- never assume fixed token format/length;
- scope calls to the installation;
- never persist or log the App private key, JWT, or installation token.

### Config loader

Loads:

~~~text
.github/issuerollup.yml
~~~

from the parent repository's default branch.

Distinguishes:

- absent config -> disabled;
- invalid config -> configuration error;
- valid config -> normalized rules.

### Field catalog

Loads organization Issue Field definitions using `Issue Fields: read`.

Returns both:

- REST database ID;
- GraphQL node ID.

Validates V1 numeric types.

### Hierarchy adapter

Reads:

- current parent;
- direct sub-issues.

Checks:

- same repository for every V1 edge;
- pagination;
- cycle/depth safety even if GitHub normally enforces a valid hierarchy.

### Value adapter

Reads current Issue Field values.

Unset is represented explicitly, not as zero.

### Rollup evaluator

Pure code.

Input:

- normalized rule;
- normalized direct-child contributions;
- current target.

Output:

- `WRITE(number)`;
- `CLEAR`;
- `NOOP`;
- `FAIL(reason)`.

No network calls.

### Field writer

V1 uses single-field GraphQL mutations:

- create;
- update;
- delete.

The writer never changes Issue Field definitions and never replaces the issue's complete field set.

If the transport fails after a mutation may have reached GitHub, the writer treats the result as **unknown**, not as failed. It reloads current GitHub state, re-evaluates, and re-plans before deciding whether another mutation is necessary.

### Propagation coordinator

After a changed target:

- find ancestor;
- load ancestor parent-repo config;
- recalculate relevant rule;
- stop on no parent/no change/hard failure/safety limit.

### Reconciler

Uses the same evaluator/writer but traverses bottom-up.

Reconciliation exists because webhook delivery is not a durable event stream provided by GitHub.

## Derived values are caches, not authoritative inputs

Source values and hierarchy are authoritative user state.

Target values are materialized derived state.

Normal event propagation may use a just-repaired child target to efficiently update its ancestor. Full reconciliation must traverse bottom-up and repair child parents before using their targets.

A manually edited/stale derived target must never be treated as unquestionable truth.

## API split

REST:

- repository/default-branch/config reads;
- organization field definitions;
- issue field values;
- parent lookup;
- sub-issue listing.

GraphQL:

- single-field create/update/delete derived target value.

See `API_CONTRACT.md`.

## Concurrency

Two events can target the same parent/rule, and an older calculation can otherwise finish after a newer one.

Compare-before-write alone does **not** prevent stale-write inversion.

V1 therefore requires a single authoritative mutation lane per:

~~~text
installation + repository + parent issue + rule
~~~

The implementation may satisfy this with a queue message-group/concurrency key, a distributed lease with fencing, or another mechanism that is correct across all worker instances. The protected section begins before the final authoritative reload and covers reload -> evaluate -> write/clear decision.

Coalescing may reduce duplicate work but is not the correctness mechanism.

If the deployment cannot guarantee the mutation lane, it must requeue/fail rather than knowingly execute concurrent writers for the same key.

Reconciliation uses the same mutation key so recovery cannot race normal workers into a stale final value.

## Caching

Allowed optimization caches:

- installation tokens;
- field catalog;
- config by content SHA;
- short-lived per-job hierarchy reads;
- short-lived delivery dedupe keys.

No cache is authoritative.

## Same-repository V1 boundary

Cross-repository hierarchy support is deferred.

This removes an otherwise hard-to-prove completeness dependency on selected-repository installation scope and cross-repository webhook delivery.

## API evolution

REST version is centralized and pinned to `2026-03-10`.

Before changing API version:

1. read GitHub breaking-change notes;
2. run adapter contract tests;
3. run live integration tests;
4. update `API_CONTRACT.md`.

## Extension points

- additional numeric reducers;
- typed date/select reducers;
- cross-repository hierarchy adapter after explicit validation;
- Project V2 field adapter;
- CLI/MCP query surface.

None are allowed to weaken the V1 field-write and fail-closed contracts.
