# Roadmap

## Phase 0 — Contract hardening

Status: **complete**

Complete:

- PRD;
- architecture;
- API contract;
- event-routing contract;
- rollup semantics;
- config contract;
- permission model;
- webhook reliability;
- security/privacy;
- test strategy;
- research;
- Developer Program checklist.

Exit:

- implementation can begin without guessing API semantics.

## Phase 1 — Local vertical slice

Status: **next**

Build:

- TypeScript skeleton;
- config schema/parser;
- pure sum evaluator;
- GitHub adapter interfaces;
- webhook signature verification;
- normalized work item;
- structured logging.

No production hosting assumptions beyond interfaces.

## Phase 2 — Live GitHub App vertical slice

Register/install App with:

- Metadata read;
- Contents read;
- Issues write;
- organization Issue Fields read.

Prove:

~~~text
3 + 5 -> 8
~~~

using real Issue Fields and sub-issues in one organization repository.

Also prove GraphQL create/update/delete preserve unrelated fields.

This is the earliest point at which IssueRollup is unquestionably a working GitHub API integration in development.

## Phase 3 — Reliability MVP

Add:

- production queue;
- field_removed;
- hierarchy events;
- nested propagation;
- last-child clear;
- retries/rate limits;
- keyed per-parent/rule serialization or equivalent fencing across workers;
- ambiguous mutation outcome reload/re-plan;
- reconciliation;
- live webhook fixtures;
- failure injection;
- selected-repository installation test.

## Phase 4 — Public developer release

- setup guide;
- privacy statement;
- SECURITY.md;
- LICENSE;
- support email;
- public install path if desired;
- sample/test repository;
- deployment docs;
- CI/security automation;
- Developer Program application.

## Phase 5 — Numeric reducer expansion

After V1 stability:

- average;
- min;
- max;
- count.

Each gets explicit semantics/tests.

## Phase 6 — Cross-repository hierarchy

Only after a dedicated live matrix proves:

- event delivery for child repository changes;
- selected vs all-repository installation behavior;
- visibility behavior;
- completeness detection;
- re-parenting behavior;
- reconciliation across repositories.

Do not enable merely because the REST response contains another repository.

## Phase 7 — Typed reducers

Potential:

- date earliest/latest;
- ordered single-select highest/lowest.

## Phase 8 — Project V2 adapter

Separate field backend.

Requires its own:

- permissions;
- webhook contract;
- API stability review;
- preservation tests.

## Phase 9 — Optional interfaces

Only with demand:

- CLI;
- MCP read/query tools;
- dry-run report;
- metrics export.

## Explicitly not planned without evidence

- project-management dashboard;
- AI prioritization;
- agent orchestration;
- arbitrary formulas/code;
- billing platform;
- Jira/Linear replacement.
