# IssueRollup

IssueRollup is a GitHub App that computes rollup values across GitHub sub-issue hierarchies.

GitHub can model parent issues and sub-issues, and GitHub Issue Fields can store structured values such as effort, cost, dates, and selections. What GitHub does not currently provide is a native way to aggregate those values from children into their parent. IssueRollup fills that gap.

## Example

~~~text
Epic: Billing migration                  Total Effort: 21
├── Android client        Effort: 5
├── Backend API           Effort: 8
├── Web checkout          Effort: 5
└── Documentation         Effort: 3
~~~

A repository can opt in with:

~~~yaml
# .github/issuerollup.yml
version: 1

rollups:
  - name: total-effort
    source_field: Effort
    target_field: Total Effort
    reducer: sum
~~~

When a source value or sub-issue relationship changes, IssueRollup recalculates the affected parent and, when necessary, its ancestors.

## Product principles

- GitHub-native: GitHub remains the source of truth.
- Deterministic: no LLM is required to calculate or apply rollups.
- Least privilege: request only the GitHub App permissions required for the enabled features.
- Safe over clever: an incomplete aggregate must not silently look authoritative.
- Stateless core: V1 should not require a product database for rollup calculation.
- Small surface area: solve rollups well before adding dashboards or unrelated project-management features.

## V1 scope

V1 targets organization-level GitHub Issue Fields and sub-issues.

Supported in the first release:

- GitHub App installation authentication
- webhook-driven recalculation
- numeric source fields
- numeric target fields
- the `sum` reducer
- direct-child aggregation
- nested hierarchy propagation
- safe handling of missing and inaccessible children
- manual/reconciliation recalculation endpoint or command for recovery
- repository-level YAML configuration
- idempotent writes and loop prevention

Not in V1:

- Project V2 custom fields
- averages/min/max/count
- date reducers
- single-select ranking
- dashboards
- billing
- AI-generated values
- persistent analytics
- organization-wide historical reporting

## Important platform constraint

GitHub Issue Fields are organization-level fields. The Issue Fields REST API applies to organization-owned repositories where Issue Fields are available. A later Project V2 adapter can broaden IssueRollup to project custom fields and other repository ownership models.

## Documentation

- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Rollup semantics](docs/ROLLUP_SEMANTICS.md)
- [Configuration contract](docs/CONFIGURATION.md)
- [GitHub App contract](docs/GITHUB_APP.md)
- [Webhooks and reliability](docs/WEBHOOKS_AND_RELIABILITY.md)
- [Security and privacy](docs/SECURITY_AND_PRIVACY.md)
- [Test strategy](docs/TEST_STRATEGY.md)
- [Roadmap](docs/ROADMAP.md)
- [Research and platform rationale](docs/RESEARCH.md)
- [Developer Program / launch checklist](docs/LAUNCH_CHECKLIST.md)

## Status

**Design / early development.**

The repository intentionally starts with the product and reliability contracts before implementation so that the first code path is narrow, testable, and safe.

## Support

A public support email must be added before the GitHub Developer Program application is submitted.

## License

License selection is still an explicit project decision. MIT is a reasonable default for a small developer utility, but no license is implied until a LICENSE file is committed.
