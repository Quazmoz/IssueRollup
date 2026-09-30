# Research and Platform Rationale

## Why this project exists

IssueRollup targets a narrow missing capability between two GitHub primitives:

1. parent/sub-issue hierarchy;
2. structured Issue Fields / project planning fields.

GitHub provides hierarchy and field storage, but users still resort to custom automation when they want a parent value derived from children.

## User-demand signal

A GitHub Community discussion from June 2026 asks how to automatically sum Estimate values from sub-issues into the parent. The answer describes no native custom-field aggregation and points toward custom API/Actions automation. A follow-up user expresses interest in using such a solution.

Reference:

- https://github.com/orgs/community/discussions/200259

This is a small signal, not proof of a large commercial market. It is enough to establish that the problem is real and not purely hypothetical.

## GitHub platform support

### Issue Field values API

GitHub exposes REST endpoints to list and manage Issue Field values for issues.

Reference:

- https://docs.github.com/en/rest/issues/issue-field-values

The API supports GitHub App installation tokens. Reading requires Issue access; writing field values requires write-level issue/pull-request permission and appropriate repository access.

### Issue Field automation events

GitHub documents that Issue Field changes trigger `issues` webhook/workflow events:

- `field_added`
- `field_removed`

Payloads contain field information including previous/current value information.

Reference:

- https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-and-managing-issue-fields

### Sub-issue API

GitHub exposes REST endpoints for parent/sub-issue relationships including listing sub-issues.

Reference:

- https://docs.github.com/en/rest/issues/sub-issues

### Sub-issue webhooks

GitHub Apps can subscribe to the `sub_issues` webhook event for hierarchy changes.

Reference:

- https://docs.github.com/en/webhooks/webhook-events-and-payloads

## Important V1 constraint

Organization Issue Fields apply to organization-owned repositories where the feature is available.

This means V1 is not a universal solution for every personal repository.

A future Project V2 field adapter is a deliberate expansion path.

## Adjacent solutions

Existing tools demonstrate nearby needs:

- generic Issue/Project automation with GitHub Actions;
- project activity/metrics tools;
- custom `actions/github-script` recipes.

The differentiation for IssueRollup is intentionally narrow:

> A reusable, installable GitHub-native primitive for deterministic hierarchy rollups.

The product should not compete by becoming a full reporting dashboard.

## Native-feature risk

GitHub may eventually add native rollup formulas.

That risk is acceptable for this project because:

- the problem exists now;
- the integration remains a legitimate open-source GitHub API contribution;
- a focused implementation can be built without large sunk cost;
- the same architecture can adapt to additional reducers or field backends if demand exists.

Do not respond to native-feature risk by bloating V1.

## Developer Program relevance

GitHub currently states that Developer Program membership is open to individual developers and companies with:

- an integration in production **or development** using the GitHub API; and
- a support email for GitHub users.

Reference:

- https://docs.github.com/en/integrations/concepts/github-developer-program

IssueRollup is designed to be a genuine API integration rather than a badge-only placeholder.
