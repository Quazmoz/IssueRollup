# GitHub API Contract

This document is the implementation-level contract for GitHub API use in V1.

## REST API version

Every REST request must include:

~~~text
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2026-03-10
Authorization: Bearer <installation-token>
~~~

Do not rely on GitHub's default REST API version.

GraphQL is not selected through the REST `X-GitHub-Api-Version` header.

## Authentication

Normal calls use a GitHub App installation access token.

Current GitHub documentation states that installation tokens:

- work with REST and GraphQL;
- expire after one hour;
- cannot exceed the repositories/permissions granted to the installation.

Do not:

- persist installation tokens as long-lived credentials;
- assume a fixed token length or legacy token format;
- fall back to a developer PAT in production.

## Field-definition discovery

### REST

~~~text
GET /orgs/{org}/issue-fields
~~~

Purpose:

- resolve exact configured names;
- obtain REST database IDs;
- obtain GraphQL node IDs;
- validate `data_type == number`.

Required permission:

~~~text
Organization: Issue Fields (read)
~~~

V1 never calls create/update/delete Issue Field-definition endpoints.

## Repository configuration

### REST

~~~text
GET /repos/{owner}/{repo}/contents/.github/issuerollup.yml?ref={default_branch}
~~~

Required permission:

~~~text
Repository: Contents (read)
~~~

The parent repository's default branch config is authoritative.

## Parent lookup

### REST

~~~text
GET /repos/{owner}/{repo}/issues/{issue_number}/parent
~~~

Required permission:

~~~text
Repository: Issues (read)
~~~

Expected statuses include:

- 200: parent exists;
- 404: no accessible parent / not found;
- 410: gone.

Do not treat every 404 as an access error without context.

## Direct-child discovery

### REST

~~~text
GET /repos/{owner}/{repo}/issues/{issue_number}/sub_issues?per_page=100
~~~

Required permission:

~~~text
Repository: Issues (read)
~~~

GitHub currently documents:

- up to 100 direct sub-issues per parent;
- up to eight nested levels.

Still implement generic pagination rather than encoding “one page forever.”

V1 validates that every returned child has the same `repository_url`/repository identity as the parent. A cross-repository edge makes the rule unsupported and prevents a write.

## Read current Issue Field values

### REST

~~~text
GET /repos/{owner}/{repo}/issues/{issue_number}/issue-field-values?per_page=100
~~~

Required permission:

~~~text
Repository: Issues (read)
~~~

For number fields the response includes:

- `issue_field_id`;
- `issue_field_name`;
- `data_type: number`;
- numeric `value`.

Missing field value means “unset,” not zero.

## Derived target writes

V1 must use a single-field mutation path.

Preferred GraphQL operations:

- `createIssueFieldValue` when the target has no value;
- `updateIssueFieldValue` when the target already has a value;
- `deleteIssueFieldValue` when the derived value must be cleared.

For numeric fields, `IssueFieldCreateOrUpdateInput` supplies:

- `fieldId` = GraphQL node ID of the Issue Field;
- `numberValue` = computed number.

The issue GraphQL node ID is obtained from the issue representation/API adapter.

Expected permission:

~~~text
Repository: Issues (write)
~~~

The live contract test must prove these mutations work with an installation token carrying the declared GitHub App permissions before MVP is marked complete.

## Prohibited write paths

### REST bulk replace

Never use:

~~~text
PUT /repos/{owner}/{repo}/issues/{issue_number}/issue-field-values
~~~

GitHub explicitly documents that this replaces **all existing field values** with the provided set.

### REST POST with empty array

Never send:

~~~json
{"issue_field_values":[]}
~~~

to:

~~~text
POST /repos/{owner}/{repo}/issues/{issue_number}/issue-field-values
~~~

GitHub documents that an empty array clears all existing field values.

### Field-definition mutation

Never call:

~~~text
POST   /orgs/{org}/issue-fields
PATCH  /orgs/{org}/issue-fields/{id}
DELETE /orgs/{org}/issue-fields/{id}
~~~

IssueRollup consumes field definitions; it does not own them.

## REST POST/PATCH field-value paths

GitHub also exposes REST operations capable of setting field values. Do not adopt them as the V1 derived-write path merely because they appear convenient.

Any alternate write strategy must first have contract tests proving:

- exactly one intended field changes;
- unrelated fields remain byte-for-byte equivalent semantically;
- clear semantics are field-specific;
- duplicate calls converge;
- authorization is identical or narrower than the approved permission contract.

## Status/error classification

At the adapter boundary classify at least:

- 401: expired/invalid installation token -> refresh once, then fail;
- 403: permission/rate-limit/access -> inspect headers and classify;
- 404: resource absent or not visible -> contextual classification;
- 410: resource gone/API version issue where applicable;
- 422: validation/semantic failure -> do not blind-retry;
- 429 or rate-limit headers: respect server guidance;
- 5xx/timeouts: bounded retry.

Do not retry a deterministic 4xx in a tight loop.

## Rate-limit discipline

- no-op before write;
- request `per_page=100` where appropriate;
- bounded concurrency;
- exponential backoff with jitter for retry-safe transient failures;
- honor `Retry-After` and GitHub rate-limit headers;
- cache organization field definitions by a short TTL or validation key only as an optimization.

## Current platform constraints

GitHub currently documents:

- Issue Fields are organization-level;
- Issue Fields are not available for user-owned repositories;
- Issue Fields apply to issues, not pull requests;
- up to 25 Issue Fields per organization;
- number fields accept decimals;
- sub-issue hierarchies support up to 100 children per parent and eight levels.

These are external platform constraints, not values to duplicate throughout implementation. Keep them centralized/configurable where practical.

## Required live-contract proof

Before release, a controlled organization repository must prove:

1. installation token can list org Issue Fields with `Issue Fields: read`;
2. installation token can list field values with `Issues: write` (which includes read);
3. installation token can get parent and list sub-issues;
4. GraphQL create of one numeric target preserves unrelated fields;
5. GraphQL update of that numeric target preserves unrelated fields;
6. GraphQL delete of that numeric target preserves unrelated fields;
7. emitted webhook actions match routing fixtures.
