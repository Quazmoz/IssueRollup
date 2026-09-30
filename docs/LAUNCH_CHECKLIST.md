# Launch and GitHub Developer Program Checklist

## Contract complete

- [x] Problem documented.
- [x] V1 same-repository boundary documented.
- [x] API version pinned to 2026-03-10.
- [x] REST/GraphQL responsibilities documented.
- [x] Dangerous bulk field write paths prohibited.
- [x] Organization Issue Fields read permission documented.
- [x] Organization-owner installation consequence documented.
- [x] 10-second webhook requirement documented.
- [x] No-automatic-redelivery behavior documented.
- [x] Reconciliation contract documented.
- [x] Same-key concurrent writer safety documented.
- [x] Ambiguous mutation outcome recovery documented.
- [x] Config lifecycle/decommission limitation documented.
- [x] Exact V1 webhook action allowlist documented.
- [x] Test/release gates documented.

## GitHub App registration

- [ ] Register GitHub App.
- [ ] Set accurate homepage/source URL.
- [ ] Configure HTTPS webhook URL.
- [ ] Generate strong webhook secret.
- [ ] Generate/store App private key.
- [ ] Repository Metadata: read.
- [ ] Repository Contents: read.
- [ ] Repository Issues: write.
- [ ] Organization Issue Fields: read.
- [ ] No Issue Fields write permission.
- [ ] Subscribe to `issues`.
- [ ] Subscribe to `sub_issues`.
- [ ] Install through organization owner on controlled org repo.

## Controlled GitHub fixtures

Create:

- [ ] numeric `Effort` field;
- [ ] numeric `Total Effort` field;
- [ ] unrelated fields for preservation tests;
- [ ] parent issue;
- [ ] two children;
- [ ] nested parent/children;
- [ ] optional second repository for cross-repo rejection test.

## First real API path

- [ ] Installation token works.
- [ ] Org Issue Fields list works.
- [ ] Config fetch works.
- [ ] Parent lookup works.
- [ ] Sub-issue listing works.
- [ ] Child values read.
- [ ] GraphQL create target works.
- [ ] GraphQL update target works.
- [ ] GraphQL delete target works.
- [ ] Unrelated fields preserved.
- [ ] 3 + 5 -> 8 demo works.

At this point IssueRollup is a genuine integration in development.

## Webhook/reliability MVP

- [ ] HMAC-SHA256 verification.
- [ ] Durable production enqueue.
- [ ] 2XX inside 10 seconds.
- [ ] `X-GitHub-Delivery` captured.
- [ ] Live `issues.field_added` fixture.
- [ ] Live `issues.field_removed` fixture.
- [ ] Live relevant `sub_issues` fixtures.
- [ ] Unknown action ignored safely.
- [ ] Duplicate job converges.
- [ ] Out-of-order jobs converge.
- [ ] Same-key concurrent workers cannot leave a stale final write.
- [ ] Timeout-after-success mutation recovery re-reads/re-plans.
- [ ] Failed delivery can be redelivered without dedupe suppression.
- [ ] Retry/rate-limit classification.
- [ ] Reconciliation path.
- [ ] Last-child clear.
- [ ] Nested propagation.
- [ ] Cross-repository edge rejected.

## Public project hygiene

- [ ] LICENSE.
- [ ] SECURITY.md.
- [ ] CONTRIBUTING.md if contributions are accepted.
- [ ] Setup/install guide.
- [ ] Privacy/data-handling statement.
- [ ] Deployment guide.
- [ ] Example config.
- [ ] CI.
- [ ] Dependency/security automation.
- [ ] Valid monitored support email.

## GitHub Developer Program

GitHub currently documents two relevant membership requirements:

- an integration in production **or development** using the GitHub API;
- a support email for GitHub users.

Before applying:

- [ ] End-to-end API-backed path works.
- [ ] GitHub App exists.
- [ ] Repo accurately says development status.
- [ ] Support email is public and monitored.
- [ ] Application description makes no unverified adoption/production claims.

Reference:

https://docs.github.com/en/integrations/concepts/github-developer-program

## Not required before applying

- GitHub Marketplace listing.
- External users.
- Revenue.
- Dashboard.
- Multiple reducers.
- Cross-repository support.
- Project V2 adapter.
