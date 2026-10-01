# IssueRollup

IssueRollup is a small, deterministic GitHub App that keeps derived numeric totals on parent issues synchronized with their sub-issues.

GitHub provides sub-issue hierarchies and organization-level Issue Fields, but it does not currently provide a native rollup formula such as “sum the Effort field of these children into Total Effort on the parent.” IssueRollup fills that gap without replacing GitHub Projects or introducing a separate planning database.

## Example

~~~text
Epic: Billing migration                  Total Effort: 21
├── Android client        Effort: 5
├── Backend API           Effort: 8
├── Web checkout          Effort: 5
└── Documentation         Effort: 3
~~~

~~~yaml
# .github/issuerollup.yml
version: 1

rollups:
  - name: total-effort
    source_field: Effort
    target_field: Total Effort
    reducer: sum
~~~

When a relevant Issue Field value or sub-issue relationship changes, IssueRollup recalculates the parent from current GitHub state and writes only the configured derived field.

## V1 contract

V1 is intentionally narrow:

- organization-owned repositories using GitHub Issue Fields;
- same-repository parent/sub-issue hierarchies;
- numeric source and target fields;
- `sum` reducer;
- nested hierarchy propagation;
- repository-local YAML configuration;
- GitHub App installation authentication;
- webhook-driven updates plus deterministic reconciliation;
- no LLM;
- no product database for rollup state.

V1 deliberately rejects cross-repository hierarchies instead of publishing a total whose completeness cannot be guaranteed under a selected-repository GitHub App installation.

## GitHub permissions

The name-based V1 configuration requires:

**Repository permissions**
- Metadata: read
- Contents: read
- Issues: write

**Organization permissions**
- Issue Fields: read

The organization permission is required to resolve configured field names, including target fields that do not yet have values on an issue. Because the App requests an organization permission, installation in an organization requires organization-owner approval.

IssueRollup does **not** need Issue Fields write permission because it does not create, rename, or delete field definitions.

## API contract

REST requests are pinned to:

~~~text
X-GitHub-Api-Version: 2026-03-10
Accept: application/vnd.github+json
~~~

V1 uses REST for configuration, hierarchy, field-definition, and value reads. Derived field writes use GraphQL's single-field Issue Field mutations so IssueRollup never needs the REST endpoint that replaces the complete set of values on an issue.

See [API contract](docs/API_CONTRACT.md).

## Reliability model

GitHub webhooks are triggers, not calculation inputs.

Production flow:

~~~text
GitHub
  -> verify HMAC-SHA256
  -> validate event/action
  -> durable enqueue
  -> return 2XX within 10 seconds
  -> worker reloads authoritative GitHub state
  -> calculate
  -> write only if changed
~~~

GitHub does not automatically retry failed webhook deliveries, so reconciliation is part of the correctness model rather than an optional convenience.

## Product principles

- **GitHub is authoritative.** No duplicate planning database.
- **Deterministic.** The same GitHub state and config produce the same result.
- **Fail closed.** No plausible-looking partial totals.
- **Least privilege.** Only permissions justified by documented API calls.
- **Field-safe writes.** Never replace unrelated Issue Field values.
- **Idempotent.** Duplicate and out-of-order events converge.
- **Small scope.** Solve one missing GitHub primitive well.

## Documentation

- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API contract](docs/API_CONTRACT.md)
- [Event routing](docs/EVENT_ROUTING.md)
- [Rollup semantics](docs/ROLLUP_SEMANTICS.md)
- [Configuration contract](docs/CONFIGURATION.md)
- [GitHub App contract](docs/GITHUB_APP.md)
- [Webhooks and reliability](docs/WEBHOOKS_AND_RELIABILITY.md)
- [Security and privacy](docs/SECURITY_AND_PRIVACY.md)
- [Test strategy](docs/TEST_STRATEGY.md)
- [Roadmap](docs/ROADMAP.md)
- [Research and platform rationale](docs/RESEARCH.md)
- [Developer Program / launch checklist](docs/LAUNCH_CHECKLIST.md)
- [Live GitHub App contract test](docs/LIVE_CONTRACT_TEST.md)

## Development

Requires Node.js 24.21.0 (see `.nvmrc`). From a clean checkout:

~~~bash
npm ci
npm run typecheck
npm test
npm run build
npm run verify
~~~

`npm run verify` is the current CI quality gate and runs strict type checking plus the full build/test suite. The live GitHub integration harness is `npm run live:contract`; it is dry-run by default and requires an explicit apply sentinel before it can mutate GitHub.

## Status

**Phase 1 is complete. Phase 2 implementation is code-ready; live GitHub App proof is still pending.**

The repository now includes:

- strict configuration parsing and numeric rollup evaluation;
- real REST adapters for repository config, organization Issue Fields, issue identity, parent/sub-issue hierarchy, and Issue Field values;
- pinned GitHub REST API headers and bounded request timeouts;
- static GraphQL create/update/delete mutations for one derived Issue Field;
- GitHub App RS256 JWT generation and repository-scoped installation-token exchange with returned-scope verification;
- explicit fail-closed rejection of non-organization-owned repositories;
- a dry-run-by-default live contract harness that requires GitHub App credentials rather than an opaque token;
- post-write target verification;
- live-harness comparison proving non-target Issue Field values remain unchanged;
- fail-closed handling for cross-repository edges and nested hierarchies that Phase 3 has not implemented yet.

The local Phase 2 path can now exercise:

~~~text
child Effort 3 + child Effort 5
              ->
parent Total Effort 8
~~~

against real GitHub APIs once a test GitHub App is registered and installed.

IssueRollup is **not production-ready**. No GitHub App has been registered or installed by this repository work, no real mutation has been executed yet, and Phase 3 still owns durable ingestion, mutation-lane fencing, nested propagation, reconciliation, and production retry/rate-limit behavior. See [the live contract test guide](docs/LIVE_CONTRACT_TEST.md).

## Support

A valid public support email must be added before applying to the GitHub Developer Program.

## License

No license is implied until a LICENSE file is committed. MIT remains the recommended default for this small open-source developer utility.
