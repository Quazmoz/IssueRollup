# GitHub App Contract

## App model

IssueRollup is a GitHub App.

Normal operation uses installation access tokens and GitHub-delivered webhooks. User OAuth authorization is not required for the V1 service path.

## Required permissions

### Repository

| Permission | Level | Why |
|---|---:|---|
| Metadata | Read | Repository identity/basic App access |
| Contents | Read | Read `.github/issuerollup.yml` from default branch |
| Issues | Write | Read issue hierarchy/values and mutate derived Issue Field values |

`Issues: write` subsumes the read access needed by parent/sub-issue and Issue Field-value endpoints.

### Organization

| Permission | Level | Why |
|---|---:|---|
| Issue Fields | Read | Resolve configured names and numeric field metadata, including unset targets |

Do **not** request `Issue Fields: write`.

## Installation consequence

GitHub documents that repository admins can install an App themselves only when the App requests no organization permissions (and no repository administration permission).

Because IssueRollup requests organization-level `Issue Fields: read`, an organization owner must approve/install it.

Document this clearly in setup UX.

## Repository selection

Users may install on:

- all repositories; or
- selected repositories.

V1's supported rollup hierarchy must remain within one repository, so selected-repository installation is compatible with the correctness contract.

## Webhook subscription

Subscribe only to:

- `issues`;
- `sub_issues`.

The App has sufficient event access through the declared Issues permission.

IssueRollup handles only its allowlisted actions and ignores/logs unrelated `issues` actions.

## Field-definition ownership

IssueRollup reads organization Issue Field definitions but never modifies them.

Users create and manage:

- Effort;
- Total Effort;
- or equivalent source/target fields.

## Authentication

1. Receive verified GitHub App webhook with installation ID.
2. Create/reuse an installation access token scoped to the intended repository.
3. Use installation token with REST/GraphQL.
4. Refresh at/near expiry.
5. Never expose installation token to client code.

For Phase 2 qualification, the harness mints the token itself from GitHub App credentials and fails closed unless GitHub's response confirms exactly the requested repository ID. An opaque pre-minted token is intentionally not accepted as qualification evidence.

GitHub currently documents installation-token lifetime as one hour.

Do not assume a fixed token length or prefix.

## REST version

Pin:

~~~text
X-GitHub-Api-Version: 2026-03-10
~~~

for all REST calls.

## App secrets

### Private key

- secret manager/environment only;
- never in repository;
- never logged;
- rotation supported.

### Webhook secret

- independent secret;
- validate raw bytes with `X-Hub-Signature-256`;
- constant-time comparison via vetted crypto/library.

## Same-repository V1 guarantee

GitHub's sub-issue APIs can represent cross-repository relationships under the same repository owner.

IssueRollup V1 refuses cross-repository edges.

This is intentional: selected-repository installations and child-repository webhook delivery make a general cross-repo completeness guarantee a separate integration problem.

## App listing/setup information

Before public install:

- accurate development/production status;
- source repository;
- setup instructions;
- permissions explanation;
- privacy/data handling;
- support email;
- security-reporting route.

## Developer Program

GitHub's current Developer Program documentation states that membership is open to developers/companies with:

- an integration in production **or development** using the GitHub API;
- a support email for GitHub users.

IssueRollup should apply after the first real end-to-end API path works and the support contact exists. Marketplace publication is not a documented prerequisite.
