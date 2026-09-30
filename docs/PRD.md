# Product Requirements Document

## Product

**IssueRollup**

## Problem

GitHub supports parent/sub-issue hierarchies and structured Issue Fields, but teams cannot natively calculate parent field values from their children. Common planning values such as effort, cost, points, or estimates therefore have to be recalculated manually or maintained with repository-specific Actions.

This produces stale totals and duplicate automation logic.

## Product promise

> Define a rollup once. Keep parent values synchronized automatically as child issue values and hierarchy relationships change.

IssueRollup should feel like a missing GitHub primitive, not a replacement project-management system.

## Primary user

A GitHub organization that:

- uses sub-issues to decompose work;
- uses numeric GitHub Issue Fields such as Effort, Points, Cost, or Estimate;
- wants parent issues to expose a computed total;
- prefers GitHub-native metadata over a separate planning database.

## Jobs to be done

### Core

When I change a child estimate, automatically update the parent total so I do not manually recalculate hierarchy totals.

### Hierarchy

When I add, remove, or re-parent a sub-issue, recalculate affected parents so the rollup reflects the current tree.

### Recovery

When a webhook is delayed, duplicated, or missed, let me recompute from GitHub's current state rather than repairing values by hand.

### Trust

When IssueRollup cannot see every child required for a correct aggregate, tell me the calculation is incomplete instead of publishing a plausible but wrong number.

## V1 functional requirements

### FR-1 Configuration

IssueRollup reads repository configuration from `.github/issuerollup.yml`.

A V1 rule identifies:

- stable rule name;
- source Issue Field by name;
- target Issue Field by name;
- reducer (`sum` only in V1);
- missing-value policy;
- inaccessible-child policy.

### FR-2 GitHub App authentication

IssueRollup operates using GitHub App installation tokens. No user's personal access token is required for normal operation.

### FR-3 Event handling

Relevant changes trigger recalculation:

- source Issue Field set or updated;
- source Issue Field cleared;
- target values changed externally when ancestor totals can be affected;
- sub-issue attached;
- sub-issue detached;
- parent relationship changed.

The event is a trigger, not the authoritative calculation input. The engine re-reads current GitHub state before writing.

### FR-4 Child discovery

For an affected parent, IssueRollup lists current direct sub-issues from GitHub.

### FR-5 Value resolution

For each direct child, the engine resolves the child's effective numeric contribution according to the semantics contract.

### FR-6 Calculation

V1 supports deterministic numeric summation.

### FR-7 Write safety

IssueRollup updates only the target field it owns for the specific rule. It must not replace or clear unrelated issue field values.

### FR-8 Nested propagation

After a parent's computed target changes, IssueRollup determines whether the parent's parent is affected and continues upward until:

- there is no parent;
- the calculated value does not change;
- the configured maximum safety depth is reached; or
- a hard calculation error occurs.

### FR-9 Partial access

If a required child is inaccessible to the GitHub App, V1 fails closed by default and does not publish a new aggregate.

### FR-10 Reconciliation

A manual or scheduled reconciliation path can recompute an issue or configured repository hierarchy from current GitHub state.

The first implementation may expose this as an internal endpoint, CLI command, or GitHub-supported dispatch mechanism. The core requirement is deterministic recomputation, not a specific UI.

### FR-11 Observability

Each calculation produces structured diagnostics containing at minimum:

- installation ID;
- repository;
- parent issue number;
- rule name;
- child count;
- usable value count;
- ignored missing count;
- inaccessible count;
- old target;
- computed target;
- write/no-write decision;
- triggering delivery ID when applicable.

Secrets and tokens are excluded.

## V1 non-functional requirements

### Correctness

For the same GitHub state and configuration, IssueRollup must produce the same result.

### Idempotency

Processing the same webhook multiple times must converge on the same GitHub state.

### Event-order tolerance

Correctness must not depend on webhook delivery order. Re-read authoritative state before calculating.

### Least privilege

Request only permissions required for webhook receipt, issue/sub-issue reads, configuration reads, and target field writes.

### Performance

A normal direct-child recalculation should require no database and should complete with bounded GitHub API calls. Pagination must support GitHub's allowed sub-issue count.

### Availability

Transient failures should not corrupt values. A later retry or reconciliation must safely converge state.

## UX requirements

The product should not require a dashboard for normal use.

The expected user workflow is:

1. Install GitHub App.
2. Grant access to selected repositories.
3. Create/configure source and target Issue Fields in the organization.
4. Commit `.github/issuerollup.yml`.
5. Change child values normally in GitHub.
6. See parent values update.

Configuration errors should be explicit and actionable.

## Out of scope for V1

- creating arbitrary Issue Fields automatically;
- Project V2 custom field adapter;
- non-numeric reducers;
- cross-organization rollups;
- historical analytics;
- forecasting;
- LLM inference;
- user-defined JavaScript expressions;
- billing or commercial plans;
- standalone project-management UI.

## Success criteria

Technical success:

- end-to-end rollup works on a real organization-owned test repository;
- nested hierarchy works;
- duplicate webhook tests converge;
- inaccessible child test fails safely;
- config validation prevents dangerous rules;
- no unrelated Issue Fields are modified.

Product success:

- a new user can understand the README example without reading implementation code;
- installation plus one YAML rule is sufficient to demonstrate value;
- the integration is substantive enough to be used as the project's GitHub Developer Program integration.

## Open product decisions

- final hosting target;
- public support email;
- open-source license;
- whether reconciliation is exposed first as CLI, endpoint, or workflow dispatch;
- whether V1.1 adds `average/min/max/count` before the Project V2 adapter.
