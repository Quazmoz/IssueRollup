# GitHub App Contract

## Why a GitHub App

IssueRollup should be installed as a GitHub App rather than requiring users to create personal access tokens.

Benefits:

- scoped repository installation;
- installation tokens;
- explicit permissions;
- native webhooks;
- revocable access;
- clear identity for writes;
- strong fit with GitHub's developer ecosystem.

## Required V1 capabilities

The App needs to:

- receive issue and sub-issue events;
- read repository metadata;
- read `.github/issuerollup.yml`;
- read issue hierarchy;
- read Issue Field values;
- write configured target Issue Field values.

## Permission design

Start from least privilege and validate exact GitHub App settings against the APIs used by implementation.

Expected repository permissions:

- **Metadata: read** — implicit/basic repository metadata.
- **Contents: read** — load `.github/issuerollup.yml`.
- **Issues: write** — read issues/sub-issues and update Issue Field values.

Do not request:

- administration;
- actions;
- checks;
- deployments;
- secrets;
- members;
- pull requests;
- workflows

unless a later feature has a documented reason.

## Webhook subscriptions

V1 expects:

- `issues`
  - `field_added`
  - `field_removed`
- `sub_issues`
  - relevant parent/sub-issue relationship actions

Do not subscribe to unrelated high-volume events.

## Installation scope

Users should be able to install IssueRollup on selected repositories instead of requiring all repositories.

Because cross-repository sub-issues are possible, a hierarchy may reference a child outside the App's installation scope.

V1 behavior in that case is fail-closed for the affected rollup.

## Issue Fields constraint

Organization-level Issue Fields are available for organization-owned repositories with the feature enabled. V1 therefore targets those repositories.

The IssueRollup code repository itself may live under a personal account; that does not change the target repositories on which the installed App operates.

## Authentication

Server-side flow:

1. Verify webhook with App webhook secret.
2. Read installation ID from verified payload.
3. Create/obtain installation access token.
4. Call GitHub API only within installation scope.
5. Never expose the installation token to client-side code.

## Private key handling

GitHub App private key requirements:

- store only in a secret manager/environment secret;
- never commit;
- never log;
- support rotation;
- fail startup if malformed/missing in environments that require GitHub access.

## Webhook secret handling

- separate from private key;
- verify raw request bytes exactly as required by GitHub;
- constant-time signature comparison through a vetted library;
- reject before JSON business processing when verification fails.

## API endpoints central to V1

Conceptually:

- list parent/sub-issue relationships;
- list sub-issues;
- list Issue Field values for each issue;
- resolve organization Issue Field metadata;
- update/add the configured Issue Field value;
- read repository content for configuration.

Pin an explicit supported GitHub REST API version in the client.

## Write strategy

Avoid any operation that replaces the entire set of Issue Field values unless the implementation can prove it preserves unrelated values.

Prefer the narrowest operation that adds/updates the configured target field only.

## User-facing App identity

Before public installation:

- App name finalized;
- description clearly says what data is changed;
- homepage points to repository or project site;
- privacy statement explains processing;
- support contact is valid;
- setup URL/documentation is available.

## Developer Program alignment

GitHub's current Developer Program requirement allows an integration to be in production **or development** as long as it uses the GitHub API and provides a support email.

IssueRollup should apply only after at least one genuine API-backed end-to-end path exists, even though a production release is not required.
