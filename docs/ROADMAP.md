# Roadmap

The roadmap is deliberately ordered to prevent IssueRollup from becoming a generic project-management platform before the core primitive is reliable.

## Phase 0 — Product contract

Status: **current**

- public repository;
- PRD;
- rollup semantics;
- configuration schema;
- GitHub App permission model;
- webhook reliability contract;
- security/privacy contract;
- test plan;
- competitive/platform research.

Exit:

- no unresolved ambiguity blocks implementation of numeric sum.

## Phase 1 — Vertical slice

Goal: one real end-to-end rollup.

Build:

- TypeScript service skeleton;
- GitHub App auth;
- webhook verification;
- config loader;
- field resolver;
- sub-issue reader;
- numeric value reader;
- sum reducer;
- target updater;
- structured logs.

Demo:

~~~text
Child values 3 + 5
        |
        v
Parent Total Effort becomes 8
~~~

Exit:

- works against a real organization-owned test repository.

## Phase 2 — Reliability MVP

Build:

- `field_removed`;
- sub-issue relationship event handling;
- nested propagation;
- last-child cleanup;
- fail-closed inaccessible children;
- bounded retries;
- pagination;
- reconciliation command/endpoint;
- webhook fixtures;
- integration tests.

Exit:

- all MVP tests in TEST_STRATEGY pass.

## Phase 3 — Public developer release

- finalize App name/listing;
- setup guide;
- valid support email;
- privacy statement;
- SECURITY.md;
- license decision;
- sample repository/config;
- deployment documentation;
- public GitHub App install path if desired;
- apply to GitHub Developer Program once a genuine API-backed development integration is operating.

## Phase 4 — Reducer expansion

Only after V1 stability:

- average;
- min;
- max;
- count.

Each requires documented empty/missing semantics.

## Phase 5 — Typed expansion

Potential:

- date earliest/latest;
- ordered single-select highest/lowest.

Do not infer selection ordering from display order unless explicitly defined and stable.

## Phase 6 — Project V2 adapter

Add an adapter for GitHub Project V2 custom fields.

Goals:

- support teams whose planning metadata remains Project-scoped;
- retain the same RollupEngine;
- avoid duplicating reducer logic.

This phase may require different permissions/events and must get its own threat/reliability review.

## Phase 7 — Optional developer interfaces

Only if demand exists:

- CLI;
- MCP read/query tools;
- repository-wide dry-run report;
- lightweight status endpoint;
- metrics export.

## Explicitly not on the roadmap without demand

- standalone project-management dashboard;
- AI prioritization;
- agent orchestration;
- billing platform;
- Jira/Linear replacement;
- arbitrary formulas/code execution;
- general workflow automation engine.
