# Security and Privacy

## Security posture

IssueRollup mutates GitHub issue metadata, so correctness and least privilege matter more than feature breadth.

## Data minimization

V1 needs only data required to calculate rollups:

- repository identity;
- issue identity;
- sub-issue relationships;
- configured Issue Field names/IDs/types/values;
- repository configuration;
- installation metadata required for authentication.

V1 does not need issue-body content for rollup calculation.

Avoid storing issue titles/bodies unless required for diagnostics, and prefer IDs/numbers in logs.

## Persistent storage

Core V1 should not persist customer GitHub content.

Expected persistent secrets/configuration are deployment-level:

- GitHub App ID/client metadata;
- GitHub App private key;
- webhook secret.

Installation tokens are short-lived and should be cached only as needed.

## Webhook authenticity

Never process an unverified webhook.

Requirements:

- preserve raw body needed for signature validation;
- validate GitHub signature using a maintained library;
- reject invalid signatures;
- do not trust installation/repository IDs before verification.

## Authorization

Every API call should use the installation associated with the verified event or an explicitly authorized reconciliation request.

Do not let caller-supplied repository names bypass installation scope.

## Repository configuration is untrusted input

A repository contributor may be able to edit `.github/issuerollup.yml`.

Therefore configuration must never:

- execute arbitrary code;
- interpolate shell commands;
- reference local filesystem paths;
- provide arbitrary outbound URLs;
- select arbitrary HTTP methods/endpoints.

Configuration is declarative only.

## Webhook payloads are untrusted input

Validate:

- required event fields;
- numeric IDs;
- repository identity;
- action allowlist;
- installation presence where required.

Ignore unsupported actions safely.

## Field write safety

The highest-risk product bug is deleting or overwriting unrelated GitHub metadata.

Requirements:

- mutate only the configured target Issue Field;
- test API semantics with integration fixtures;
- never use broad replacement semantics without preserving unrelated fields;
- compare desired/current target before writing.

## Secret handling

Never log:

- private key;
- webhook secret;
- installation token;
- OAuth secrets if added later;
- raw Authorization header.

Deployment must support secret rotation without source changes.

## Cross-repository hierarchies

A parent may reference a child outside installation scope.

Do not attempt privilege escalation or alternate credentials.

Default behavior: fail the rollup as incomplete.

## Denial-of-service and amplification

A single field update can propagate through ancestors.

Mitigations:

- maximum hierarchy depth;
- visited-node guard;
- per-event calculation budget;
- pagination bounds;
- API timeout;
- retry bounds.

Configuration can contain multiple rules, so impose a reasonable maximum rule count in the schema before public release.

## SSRF

V1 configuration contains no outbound URL hooks. Do not add arbitrary callbacks/webhooks to V1.

## Supply chain

Before release:

- lock dependencies;
- enable Dependabot/Renovate equivalent;
- run dependency/security scanning;
- pin GitHub Actions by immutable commit SHA where practical;
- minimize production dependencies.

## Privacy statement

Public App documentation should clearly state:

- what repository metadata is read;
- what fields are written;
- whether any content is stored;
- retention for operational logs;
- support/security contact.

## Security reporting

Before broad public promotion add `SECURITY.md` with a private reporting channel.

Do not ask users to disclose GitHub tokens or private keys in public issues.
