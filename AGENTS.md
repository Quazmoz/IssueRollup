# AGENTS.md

IssueRollup is a deliberately small GitHub App for deterministic aggregation of GitHub Issue Field values across sub-issue hierarchies.

## Read first

Before changing behavior, read:

1. `docs/PRD.md`
2. `docs/API_CONTRACT.md`
3. `docs/EVENT_ROUTING.md`
4. `docs/ROLLUP_SEMANTICS.md`
5. `docs/GITHUB_APP.md`
6. `docs/WEBHOOKS_AND_RELIABILITY.md`
7. `docs/SECURITY_AND_PRIVACY.md`

The documented contracts are intentional. If code and docs conflict, do not silently redefine the product.

## Non-negotiable V1 boundaries

- Organization-owned repositories only.
- Same-repository rollup hierarchies only.
- Numeric source and target Issue Fields only.
- `sum` is the only V1 reducer.
- No LLM dependency.
- No dashboard.
- No billing.
- No Project V2 custom-field adapter.
- No arbitrary formulas or executable repository configuration.
- No product database is required for calculation state.
- A production deployment may use a durable queue and short-lived deduplication storage.
- Incorrect partial totals are worse than an explicit failure.

## GitHub API invariants

- Pin REST requests to `2026-03-10`.
- Send `Accept: application/vnd.github+json`.
- Authenticate normal work as the GitHub App installation.
- Installation access tokens are short-lived; never assume token length or format.
- Resolve configured field names from the organization's Issue Fields API.
- Use REST reads for field definitions, current values, parent relationships, and sub-issues.
- Use single-field GraphQL mutations for create/update/delete of the derived target value.
- Never use REST `PUT /repos/{owner}/{repo}/issues/{issue_number}/issue-field-values`; it replaces all existing field values.
- Never send an empty array to REST `POST .../issue-field-values`; GitHub documents that this clears all existing field values.
- Never mutate Issue Field definitions.
- Never overwrite unrelated Issue Fields.

## Webhook invariants

- Validate `X-Hub-Signature-256` against the raw request body before processing.
- Inspect `X-GitHub-Event` and the payload `action`; ignore unknown actions safely.
- Preserve `X-GitHub-Delivery` in logs/jobs.
- Do not assume `sender` is always a human.
- Production ingress must return 2XX within GitHub's 10-second window.
- Do not acknowledge production work before it is durably accepted for processing.
- Treat every webhook as a signal to reload current state.
- Do not depend on webhook delivery order.
- Do not blindly discard IssueRollup's own target-field events; those can be relevant to ancestor propagation.

## Engineering expectations

- TypeScript with strict type checking unless an ADR intentionally changes the stack.
- GitHub transport/adapters separated from pure calculation logic.
- Runtime validation at every external boundary.
- Repository YAML is untrusted declarative input.
- Pure reducers and write planning are exhaustively unit tested.
- All external calls have explicit timeout/error classification.
- Retries are bounded and only used for retry-safe operations.
- Logs contain repository, issue, rule, delivery ID, and decision, but no credentials.
- Same-value calculations produce no write.
- Reconciliation and webhook workers call the same calculation primitives.

## Definition of done for MVP

The MVP is complete only when an installed GitHub App can:

1. verify a real GitHub webhook;
2. durably accept work and acknowledge within 10 seconds in the production path;
3. load and validate `.github/issuerollup.yml`;
4. resolve source/target numeric Issue Fields by exact name;
5. reject unsupported cross-repository hierarchy edges;
6. list all direct sub-issues with pagination;
7. read child Issue Field values;
8. calculate a deterministic sum;
9. create/update/delete only the configured derived field;
10. preserve every unrelated Issue Field;
11. propagate through a nested same-repository hierarchy;
12. survive duplicate and out-of-order events through recomputation;
13. repair state through reconciliation;
14. pass live GitHub contract tests and the test matrix in `docs/TEST_STRATEGY.md`.

## Scope discipline

A proposed V1 feature should improve correctness, installation, configuration, observability, or recovery. Everything else waits.
