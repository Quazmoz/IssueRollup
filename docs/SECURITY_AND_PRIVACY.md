# Security and Privacy

## Security posture

IssueRollup has permission to mutate issue metadata. The primary risks are:

- unauthorized webhook processing;
- accidental broad field replacement;
- overbroad GitHub App permissions;
- credential leakage;
- replay/resource amplification;
- stale-write races between concurrent workers;
- ambiguous mutation outcomes after network failure;
- untrusted repository configuration.

## Data minimization

Required GitHub data:

- installation/account identity;
- repository identity;
- issue IDs/numbers/node IDs;
- parent/sub-issue relationships;
- Issue Field definitions;
- numeric Issue Field values;
- fixed-path repository config.

Issue body/title content is not required for rollup calculation and should not be persisted for convenience.

## Storage

No product database is required for source-of-truth rollup state.

Infrastructure may persist:

- queued work envelopes;
- short-lived delivery dedupe keys;
- bounded operational logs.

Document retention before public use.

## Webhook authenticity

Requirements:

- secret configured;
- raw body retained until validation;
- `X-Hub-Signature-256` validated;
- constant-time comparison;
- invalid/missing signature rejected before enqueue.

## Replay handling

Use `X-GitHub-Delivery` as the delivery identity.

A replay should at worst cause an idempotent recomputation, but production should also use bounded deduplication to avoid unnecessary API amplification.

Legitimate GitHub redelivery reuses the same delivery ID, so dedupe logic must support controlled operator redelivery/reprocessing semantics.

## Authorization

Every worker starts from a verified installation identity.

Do not allow an arbitrary request body to select:

- a different installation;
- a repository outside installation scope;
- arbitrary GraphQL operations.

Reconciliation endpoints must be authenticated separately and map requested repositories back to an authorized installation.

## GitHub App permissions

V1:

- Metadata read;
- Contents read;
- Issues write;
- organization Issue Fields read.

No Issue Fields write.

No repository administration.

No Actions/Checks/Secrets/Deployments permissions.

## Repository config is untrusted

YAML must be parsed in safe mode and schema-validated.

Reject:

- executable YAML tags;
- unknown keys;
- excessive size;
- excessive rule count;
- arbitrary URLs;
- code/expression injection;
- path overrides.

## Field write safety

The most dangerous data-integrity failure is replacing unrelated Issue Field values.

V1:

- uses single-field GraphQL create/update/delete mutations;
- prohibits REST bulk replacement;
- contract-tests preservation of unrelated fields;
- compares desired/current before write.

## Concurrency and mutation integrity

A stale calculation must not be allowed to overwrite a newer derived value merely because it finishes later. Production workers must serialize or equivalently fence mutations for the same installation/repository/parent/rule key.

After a mutation transport failure where GitHub may have accepted the request, remote state is unknown. Re-read and re-plan before any retry; do not replay the old mutation blindly.

## Cross-repository safety

V1 rejects cross-repository hierarchy edges.

Do not compensate for a missing child by:

- switching credentials;
- using a maintainer PAT;
- treating missing data as zero;
- publishing a partial total.

## Credentials

Never log:

- App private key;
- webhook secret;
- installation token;
- Authorization headers.

Installation tokens expire and are refreshed rather than stored as durable credentials.

Do not assume token string length/format.

## Denial-of-service / amplification controls

Bound:

- request body size;
- config size;
- rules per repo;
- queue retries;
- worker concurrency;
- hierarchy depth;
- child pagination;
- per-job API call budget;
- reconciliation concurrency.

## SSRF

V1 config has no outbound URLs and no generic HTTP action.

Keep it that way.

## Supply chain

Before public release:

- lock dependencies;
- dependency update automation;
- secret scanning;
- code scanning where practical;
- minimal production dependencies;
- pin third-party Actions by immutable SHA where practical.

## Privacy statement

Before public install, document:

- data categories read;
- data categories written;
- infrastructure logs;
- queue/log retention;
- no sale/use for advertising;
- support contact;
- security contact.

## Security reporting

Add `SECURITY.md` before public promotion.

Never request tokens/private keys in public issues.
