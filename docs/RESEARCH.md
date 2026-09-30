# Research and Platform Rationale

Last reviewed: 2026-09-30

## Problem evidence

A June 2026 GitHub Community discussion asks how to sum a numeric Estimate field from sub-issues into the parent. The response describes the absence of native custom-field aggregation and recommends custom API/Actions automation.

Reference:

- https://github.com/orgs/community/discussions/200259

This proves a real workflow gap, not a large-market claim.

## Issue Fields

GitHub documents organization-level Issue Fields as typed metadata shared across an organization's issues and projects.

Current constraints relevant to IssueRollup:

- unavailable for user-owned repositories;
- issues only, not pull requests;
- up to 25 fields per organization;
- number fields allow decimals;
- values can be read/set/cleared through REST and GraphQL.

References:

- https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/managing-issue-fields-in-your-organization
- https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-and-managing-issue-fields
- https://docs.github.com/en/rest/issues/issue-field-values
- https://docs.github.com/en/rest/orgs/issue-fields
- https://docs.github.com/en/graphql/reference/issues

## Sub-issues

GitHub currently documents:

- up to 100 sub-issues per parent;
- up to eight hierarchy levels;
- REST endpoints for parent lookup and child listing;
- GitHub App installation-token support with Issues read permission;
- when adding through the REST API, a sub-issue must belong to the same repository owner as the parent.

References:

- https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues
- https://docs.github.com/en/rest/issues/sub-issues
- https://docs.github.com/en/webhooks/webhook-events-and-payloads

## Why V1 is same-repository only

GitHub can represent cross-repository sub-issues, but IssueRollup must remain correct under GitHub App installations restricted to selected repositories.

The documentation establishes repository-scoped installation access, but it does not by itself prove every visibility/event-completeness property IssueRollup would need to publish a cross-repository aggregate safely.

Therefore V1:

- supports same-repository edges;
- rejects observed cross-repository edges;
- defers cross-repository support until a live matrix proves the contract.

This is scope reduction for correctness, not a claim that GitHub cannot represent cross-repository sub-issues.

## GitHub App permissions

Name-based configuration requires the organization field catalog.

Documented permissions:

- `GET /orgs/{org}/issue-fields` -> organization `Issue Fields: read`;
- hierarchy/value reads -> repository `Issues: read`;
- Issue Field value writes -> repository `Issues: write`;
- config -> repository `Contents: read`.

Because the App requests an organization permission, organization-owner approval/install is required.

References:

- https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps
- https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party

## Safe field mutation

GitHub's REST Issue Field-value API has a bulk `PUT` endpoint that replaces all existing values. The REST `POST` endpoint also documents that posting an empty array clears all existing field values.

IssueRollup therefore avoids bulk replacement in V1.

GitHub GraphQL exposes:

- `createIssueFieldValue`;
- `updateIssueFieldValue`;
- `deleteIssueFieldValue`.

Those mutations provide the narrow write model IssueRollup wants, subject to the live permission/preservation contract test.

References:

- https://docs.github.com/en/rest/issues/issue-field-values
- https://docs.github.com/en/graphql/reference/issues

## Webhook reliability

GitHub recommends responding to webhook deliveries with 2XX within 10 seconds.

GitHub does not automatically redeliver failed deliveries. Recent deliveries can currently be redelivered for the past three days.

References:

- https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks
- https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries
- https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/redelivering-webhooks
- https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries

This is why IssueRollup needs:

- fast durable intake;
- idempotent workers;
- reconciliation.

## REST versioning

GitHub's current supported REST API versions include `2026-03-10` and `2022-11-28`.

IssueRollup pins `2026-03-10`.

Reference:

- https://docs.github.com/en/rest/about-the-rest-api/api-versions

## Installation tokens

GitHub currently documents:

- REST and GraphQL support;
- repository/permission scope limited by installation;
- one-hour installation-token expiry;
- evolving token representation, so clients must not assume a fixed string length.

Reference:

- https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation

## Native-feature risk

GitHub may eventually add rollup formulas.

That risk is acceptable:

- the gap exists today;
- the implementation is intentionally small;
- the project remains a real GitHub integration and open-source contribution;
- expansion is optional rather than required to justify V1.

## Developer Program

GitHub currently states membership is open to individual developers and companies with:

- an integration in production **or development** using the GitHub API;
- an email address where GitHub users can contact them for support.

Reference:

- https://docs.github.com/en/integrations/concepts/github-developer-program

IssueRollup should apply only after a real end-to-end API-backed development path exists and support contact is published.
