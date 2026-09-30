# AGENTS.md

This repository is IssueRollup, a deliberately small GitHub App for deterministic aggregation of GitHub Issue Field values across sub-issue hierarchies.

## Source of truth

Before changing behavior, read:

1. `docs/PRD.md`
2. `docs/ROLLUP_SEMANTICS.md`
3. `docs/GITHUB_APP.md`
4. `docs/WEBHOOKS_AND_RELIABILITY.md`
5. `docs/SECURITY_AND_PRIVACY.md`

If code and documentation disagree, do not silently redefine the product. Update the contract intentionally in the same change or preserve the documented behavior.

## Non-negotiable V1 boundaries

- No LLM dependency.
- No database dependency for the core rollup path.
- No dashboard.
- No billing.
- No Project V2 field support unless the V1 Issue Fields path is complete and well tested.
- Numeric `sum` is the first reducer.
- Incorrect partial totals are worse than an explicit failure.
- Webhook deliveries must be authenticated before processing.
- Writes must be idempotent and must not create webhook loops.
- Never overwrite unrelated Issue Fields.
- Never use a whole-field-set replacement endpoint in a way that can erase fields IssueRollup does not own.
- Never log GitHub App private keys, installation tokens, webhook secrets, or full authorization headers.

## Engineering expectations

- Use TypeScript with strict type checking unless an ADR intentionally changes the stack.
- Separate GitHub API adapters from pure rollup calculation logic.
- Pure calculation functions should be exhaustively unit tested.
- Treat GitHub payloads and repository configuration as untrusted input.
- Every write path must support dry-run computation in tests.
- Retry only operations that are safe to retry.
- Preserve `X-GitHub-Delivery` in structured logs for debugging and idempotency analysis.
- Prefer field IDs internally after resolving configured field names.
- Produce actionable errors: repository, issue number, rule name, cause, and whether a retry is appropriate.

## Definition of done for the MVP

The MVP is not complete until an installed GitHub App can:

1. receive and verify relevant GitHub webhooks;
2. load and validate `.github/issuerollup.yml`;
3. resolve a configured numeric source and target Issue Field;
4. list a parent's sub-issues;
5. read each usable child value;
6. compute a deterministic sum;
7. update only the configured target field;
8. cascade correctly through a nested hierarchy;
9. refuse misleading partial totals when child access is incomplete;
10. survive duplicate/out-of-order webhook deliveries through idempotent recomputation;
11. expose enough logs to diagnose a failed rollup;
12. pass unit, contract, integration, and webhook fixture tests.

## Scope discipline

If a proposed feature does not improve rollup correctness, installation, configuration, observability, or recovery, it probably belongs after V1.
