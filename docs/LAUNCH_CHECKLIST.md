# Launch and GitHub Developer Program Checklist

This checklist separates what is required to prove the integration works from what is optional polish.

## Before writing implementation code

- [x] Public repository created.
- [x] Product problem documented.
- [x] V1 scope bounded.
- [x] Rollup semantics documented.
- [x] GitHub App permission model drafted.
- [x] Webhook reliability strategy documented.
- [x] Test strategy documented.
- [ ] Decide initial implementation stack/ADR if different from TypeScript recommendation.
- [ ] Decide open-source license.

## GitHub App setup

- [ ] Register GitHub App.
- [ ] Set App homepage/repository URL.
- [ ] Configure webhook URL.
- [ ] Generate webhook secret.
- [ ] Generate/store App private key securely.
- [ ] Request Contents read.
- [ ] Request Issues write.
- [ ] Subscribe only to required `issues` and `sub_issues` events.
- [ ] Install on controlled organization-owned test repository.

## Minimum working integration

- [ ] Public HTTPS webhook receives GitHub event.
- [ ] Signature verification passes.
- [ ] Installation token is created.
- [ ] Repository config is read through GitHub API.
- [ ] Numeric source/target fields resolve.
- [ ] Sub-issues are listed.
- [ ] Child Issue Field values are read.
- [ ] Sum is calculated.
- [ ] Parent target Issue Field is updated.
- [ ] Duplicate processing produces a no-op.
- [ ] Relevant action is visible in logs without secrets.

At this point IssueRollup is a real integration in development.

## Reliability gate

- [ ] Handle field clear.
- [ ] Handle child add/remove.
- [ ] Handle last-child removal.
- [ ] Handle nested parent propagation.
- [ ] Handle inaccessible child safely.
- [ ] Handle pagination.
- [ ] Add retry/backoff for safe transient failures.
- [ ] Add manual reconciliation.
- [ ] Complete integration test matrix.

## Public project hygiene

- [ ] Add LICENSE.
- [ ] Add CONTRIBUTING.md if accepting contributions.
- [ ] Add SECURITY.md.
- [ ] Add privacy/data-handling statement.
- [ ] Add setup/install documentation.
- [ ] Add example config.
- [ ] Add architecture diagram if useful.
- [ ] Add CI.
- [ ] Enable dependency update/security tooling.
- [ ] Provide a valid public support email.

## GitHub Developer Program

GitHub currently permits an integration to be in **production or development**.

Before applying:

- [ ] At least one end-to-end GitHub API path genuinely works.
- [ ] GitHub App exists and is associated with IssueRollup.
- [ ] Repository accurately describes current development status.
- [ ] Support email is published and monitored.
- [ ] Application description is factual and does not imply production adoption that does not exist.

Current program reference:

https://docs.github.com/en/integrations/concepts/github-developer-program

## Later, not required for Developer Program application

- [ ] GitHub Marketplace listing.
- [ ] External users.
- [ ] Hosted dashboard.
- [ ] Paid plan.
- [ ] Project V2 adapter.
- [ ] Multiple reducers.
