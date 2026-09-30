# Architecture

## Architectural goal

Keep the V1 calculation path stateless and deterministic. GitHub is the source of truth for:

- hierarchy;
- source values;
- target values;
- repository configuration;
- installation scope.

A database must not be required to decide the correct rollup.

## Proposed stack

Recommended initial implementation:

- TypeScript
- current Node.js LTS
- Octokit for GitHub REST/GraphQL access
- a GitHub App framework such as Probot where it reduces authentication/webhook boilerplate
- JSON-schema or equivalent runtime validation for repository config
- Vitest or equivalent fast unit test runner

This is a recommended implementation, not a product requirement. Any stack change must preserve the contracts below.

## Logical components

~~~text
GitHub webhook
      |
      v
Webhook verifier
      |
      v
Event router
      |
      +----> affected issue/parent resolver
                       |
                       v
                Config loader
                       |
                       v
                Field resolver
                       |
                       v
                Hierarchy reader
                       |
                       v
                Rollup engine
                       |
                       v
                Write planner
                       |
                       v
                 GitHub API
                       |
                       +----> optional ancestor propagation
~~~

## Component contracts

### Webhook verifier

Responsibilities:

- verify GitHub webhook signature against the configured secret;
- reject malformed or unauthenticated requests;
- extract event name, action, installation, repository, and delivery ID;
- pass only normalized event metadata downstream.

It does not perform rollup math.

### Event router

Maps webhook event/action pairs into one or more recalculation candidates.

It must be conservative: redundant recalculation is acceptable; missing a necessary recalculation is not.

### Config loader

Loads `.github/issuerollup.yml` from the repository's default branch for V1.

Responsibilities:

- parse YAML;
- validate schema;
- reject unknown/unsafe combinations;
- return normalized rules;
- clearly distinguish no-config from invalid-config.

Potential later optimization: ETag/content-SHA cache. Correctness must not require the cache.

### Field resolver

Converts human-readable configured field names into GitHub field IDs and metadata.

Internally the engine should use IDs once resolution succeeds.

Validation:

- source exists;
- target exists;
- V1 source type is number;
- V1 target type is number;
- source and target do not form a prohibited self/cycle condition;
- names are unambiguous in their scope.

### GitHub adapter

A narrow interface around GitHub.

Expected operations:

- fetch repository configuration file;
- get parent issue;
- list direct sub-issues;
- list/read Issue Field values for an issue;
- resolve organization Issue Field metadata;
- update one target Issue Field without disturbing others.

GitHub response models must be translated into internal domain types at this boundary.

### Rollup engine

Pure business logic where possible.

Input:

- normalized rule;
- parent identity;
- normalized child contributions;
- current target value.

Output:

- computed value or explicit error;
- diagnostics;
- whether a write is necessary;
- whether ancestor propagation may be necessary.

The rollup engine must not perform HTTP calls.

### Write planner

Determines whether a GitHub write is necessary.

Rules:

- no write when computed value equals current value;
- no write on incomplete/failing calculation under fail-closed policy;
- write only the configured target field;
- prefer the API operation that mutates only intended field values.

### Propagation coordinator

After a successful changed write, checks whether an ancestor depends on this issue and recalculates upward.

Safety:

- bounded maximum depth;
- visited-issue guard;
- no unbounded recursion;
- same-state short circuit.

## Statelessness

Core V1 does not require persisted calculation state.

Webhook idempotency is achieved by recomputing current state and performing a write only if GitHub differs from the desired aggregate.

This means duplicate webhooks are naturally safe:

~~~text
delivery A -> calculate 21 -> write 21
delivery A again -> calculate 21 -> current is 21 -> no-op
~~~

## Caching

Allowed caches:

- GitHub App installation token cache;
- configuration by repository content SHA/ETag;
- Issue Field metadata by organization;
- short-lived parent/sub-issue reads within a single recalculation chain.

Caches are optimizations only. Stale cache data must not silently produce incorrect aggregates.

## Concurrency

Two child changes can arrive concurrently.

Example:

~~~text
Child A: 3 -> 5
Child B: 4 -> 8
~~~

Both handlers must re-read current GitHub values. A stale handler might calculate an intermediate value, but subsequent processing must converge to the current correct value.

For V1, convergence is more important than implementing a distributed lock. If real-world testing exposes write thrashing, introduce per-parent short-lived serialization without changing semantics.

## API versioning

Pin a supported GitHub API version in requests rather than relying on implicit defaults. Keep the version centralized.

## Extension points

### Reducers

Reducer interface should make these later additions straightforward:

- average
- min
- max
- count

### Field adapters

Keep field storage behind an adapter so a future Project V2 implementation can coexist:

~~~text
RollupEngine
   |
   +-- IssueFieldAdapter       V1
   |
   +-- ProjectV2FieldAdapter   later
~~~

### Reconciliation

The same `recalculate(parent, rule)` path used by webhooks must be callable by recovery/reconciliation tooling. Do not create separate math paths.
