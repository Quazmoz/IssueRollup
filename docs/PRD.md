# Product Requirements Document

## Product

**IssueRollup**

## Problem

GitHub supports parent/sub-issue hierarchies and structured organization-level Issue Fields, but it does not currently provide native aggregation of custom numeric values from child issues into parent issues.

Teams that model Effort, Points, Cost, or Estimate therefore maintain totals manually or build repository-specific automation.

## Product promise

> Define a numeric rollup once. Keep the derived parent value synchronized with GitHub's current sub-issue state.

IssueRollup should behave like a missing GitHub primitive, not another project-management system.

## V1 target user

A GitHub organization that:

- owns the target repository;
- uses GitHub Issue Fields;
- uses sub-issues in the same repository;
- wants numeric parent totals;
- can have an organization owner approve/install a GitHub App.

## V1 support boundary

Supported:

- organization-owned repositories;
- same-repository hierarchy edges;
- up to GitHub's documented direct-child and nesting limits;
- numeric source field;
- numeric target field;
- `sum`;
- nested propagation.

Explicitly unsupported in V1:

- user-owned repositories, because Issue Fields are not available there;
- parent/child edges spanning repositories;
- parent/child edges spanning organizations;
- pull-request field rollups, because Issue Fields apply to issues only;
- Project V2 custom fields.

If an unsupported hierarchy edge is observed, IssueRollup must refuse to write that rule.

## Jobs to be done

### Keep totals current

When a child estimate changes, update the parent total without manual arithmetic.

### Track hierarchy edits

When a child is attached, detached, or re-parented, update affected parent totals.

### Recover

When a webhook is missed or processing fails, recompute from current GitHub state.

### Trust the value

Never publish a partial total as if it were complete.

## Functional requirements

### FR-1 Repository configuration

Load `.github/issuerollup.yml` from the parent repository's default branch.

The config is parent-scoped: for any parent being calculated, its repository defines the applicable rules.

### FR-2 Field resolution

Resolve configured field names through the organization Issue Fields API.

For every V1 rule:

- source exists;
- target exists;
- both are `number`;
- source and target are distinct;
- target is not claimed by another rule;
- no target field is used as the source field of another V1 rule.

### FR-3 GitHub App authentication

Normal GitHub API work uses an installation access token.

No user PAT is required.

### FR-4 Webhook ingestion

Relevant webhook families/actions:

- `issues.field_added` for Issue Field set/update;
- `issues.field_removed` for Issue Field clear;
- `sub_issues.parent_issue_added`;
- `sub_issues.parent_issue_removed`;
- `sub_issues.sub_issue_added`;
- `sub_issues.sub_issue_removed`.

Ingress verifies the webhook and durably hands a bounded normalized work item to the worker path. Relationship identifiers from the payload may be retained for routing—especially removal events whose old relationship no longer exists in current state—but payload field values are never final calculation inputs.

### FR-5 Authoritative reload

Webhook payload field values are hints for routing only.

Before calculation, reload:

- current parent relationship;
- current direct children;
- current Issue Field values;
- current repository configuration;
- current field definitions as needed.

### FR-6 Same-repository validation

Every direct child used by a V1 rollup must belong to the same repository as the parent.

If a child does not, fail the rule without writing.

### FR-7 Calculation

The first reducer is numeric sum.

For nested hierarchies, see `ROLLUP_SEMANTICS.md`.

### FR-8 Field-safe mutation

IssueRollup owns only the configured target value on qualifying parent issues.

It must never replace the complete Issue Field value set on an issue.

### FR-9 Clear stale derived values

When an issue ceases to qualify as a parent, or when a calculated hierarchy has no value under the rule semantics, remove the target value with a field-specific delete operation.

### FR-10 Nested propagation

After a derived value changes, recalculate ancestors as necessary.

Propagation is bounded by:

- GitHub's supported hierarchy;
- an internal safety depth;
- a visited-node set.

### FR-11 Reconciliation

Expose a deterministic recovery path.

At minimum:

- reconcile one parent;
- reconcile one hierarchy bottom-up.

Repository-wide discovery can follow after the core MVP.

### FR-12 Diagnostics

Every calculation result records:

- delivery ID if webhook-triggered;
- installation ID;
- organization;
- repository;
- parent issue number;
- rule name;
- source field ID/name;
- target field ID/name;
- direct-child count;
- contributing count;
- missing count;
- old target;
- computed target;
- decision;
- error classification if any.

Never log credentials.

## Non-functional requirements

### Correctness

Same GitHub state + same config => same result.

### Idempotency

Repeated processing converges and same-value calculations do not write.

### Event-order tolerance

Final correctness must not depend on delivery order.

### Concurrent-writer safety

Work that can mutate the same `(installation, repository, parent issue, rule)` key must be serialized or protected by an equivalent fencing mechanism across worker instances.

Compare-before-write alone is insufficient because an older worker can otherwise finish after a newer worker and restore stale derived data.

After an ambiguous mutation outcome (for example, timeout after the request may have succeeded), re-read authoritative GitHub state and re-plan before any replay.

### Least privilege

GitHub App permissions must match `GITHUB_APP.md`.

### API compatibility

REST requests explicitly pin GitHub API version `2026-03-10`.

### Webhook responsiveness

Production ingress acknowledges successfully accepted deliveries within 10 seconds.

### Recoverability

Because GitHub does not automatically retry failed webhook deliveries, reconciliation is a required correctness mechanism.

## User experience

Expected setup:

1. Organization owner installs IssueRollup.
2. App receives access to the target repository.
3. Existing organization numeric fields are selected by name in `.github/issuerollup.yml`.
4. User commits the config.
5. User edits child values normally in GitHub.
6. Parent derived values update automatically.

No dashboard is required.

### Configuration lifecycle

Configuration changes take effect on the next relevant recalculation or explicit reconciliation; V1 does not subscribe to repository `push` events solely to discover config changes.

Removing or invalidating `.github/issuerollup.yml` disables further IssueRollup mutations for that repository. Because V1 intentionally keeps no historical ownership database, removing a rule or changing its target field does **not** automatically discover and clear values previously written under the old rule. Operators must clear obsolete derived values explicitly after disabling/changing the rule, or use a future decommission/migration command if one is added.

## Out of scope

- creating or modifying Issue Field definitions;
- cross-repository rollups;
- Project V2 field rollups;
- nonnumeric reducers;
- historical analytics;
- AI inference;
- arbitrary expressions;
- billing;
- standalone planning UI.

## Success criteria

Technical:

- live end-to-end test on an organization-owned repository;
- source edit updates parent;
- field clear updates parent;
- child attach/detach updates parent;
- nested propagation works;
- last-child removal clears target;
- cross-repository edge is refused;
- duplicate/out-of-order events converge;
- unrelated field values survive every mutation;
- reconciliation repairs deliberately corrupted derived values.

Product:

- README explains the value in under one minute;
- one YAML rule is enough for the demo;
- integration is genuinely using the GitHub API and GitHub App model;
- docs accurately distinguish development status from production readiness.

## Open decisions

- hosting provider;
- durable queue implementation;
- support email;
- license;
- first public installation distribution path.
