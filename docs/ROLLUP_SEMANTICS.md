# Rollup Semantics

This document defines the mathematical and state semantics of V1.

## Rule shape

~~~yaml
- name: total-effort
  source_field: Effort
  target_field: Total Effort
  reducer: sum
  missing_value: ignore
~~~

Both fields are organization-level numeric Issue Fields.

## V1 hierarchy boundary

A qualifying parent and all of its direct children for a rule must be in the same repository.

If a cross-repository child is observed:

~~~text
FAIL(UNSUPPORTED_CROSS_REPOSITORY_HIERARCHY)
~~~

No derived value is written.

## Direct-child definition

A parent's target is the sum of the **effective values of its current direct children**.

The relationship list is reloaded from GitHub at calculation time.

## Leaf effective value

For a leaf child:

~~~text
effective value = child.source_field
~~~

If source is unset, apply the missing-value policy.

## Nested child effective value

For a direct child that itself has sub-issues:

~~~text
effective value = child's derived target for the same rule
~~~

But that target is derived cache.

Correctness requirements:

- normal propagation repairs the child before using the changed target upward;
- full reconciliation is post-order and repairs nested parents before ancestors;
- a manual target edit on a child-parent causes that child-parent to be recalculated.

Do not use an arbitrary stale target as authoritative during reconciliation.

## Parent's own source value

V1 excludes the parent's own source value.

~~~text
Epic Effort: 2
├── A Effort: 3
└── B Effort: 5

Epic Total Effort = 8
~~~

Not 10.

## Missing values

V1 default:

~~~yaml
missing_value: ignore
~~~

An unset leaf source contributes no numeric value and increments a diagnostic count.

Zero is a real numeric value and is not “missing.”

## Empty contribution set

If a qualifying parent has children but no child contributes a numeric value, clear the target.

If an issue no longer has children, clear the stale derived target for each applicable rule.

Clearing must use a target-specific delete mutation.

## Numbers

GitHub number fields support decimals.

V1:

- accepts finite numeric values;
- rejects NaN/infinity at internal boundaries;
- performs JavaScript/GraphQL Float-compatible arithmetic;
- avoids arbitrary string coercion;
- does not promise exact decimal/currency arithmetic.

IssueRollup is not a financial ledger.

## Same-value behavior

If current target and computed target are semantically equal:

~~~text
NOOP
~~~

No mutation.

## Manual target edits

Target fields are derived.

A manual edit is allowed by GitHub but is not authoritative. On the next recalculation/reconciliation, IssueRollup restores the computed value.

## Relationship changes

### Add child

Recalculate parent.

### Remove child

Recalculate old parent.

### Re-parent

Recalculate old and new parents when both can be identified. Reconciliation repairs any side that cannot be determined from a delivery.

## Nested propagation

After parent target changes, that parent can contribute to its own parent.

Propagation stops on:

- no ancestor;
- no changed target;
- unsupported edge;
- configuration error;
- API/access hard failure;
- cycle;
- depth safety limit.

## Cycles

GitHub's hierarchy is expected to prevent cycles, but IssueRollup maintains a visited set anyway.

A repeated issue identity is a hard failure.

## Depth

GitHub currently documents up to eight hierarchy levels.

Implementation must enforce a safety bound at least sufficient for the documented limit without assuming that a future API can never change.

## Multiple rules

Rules are independent.

Failure of one rule must not alter another rule's target.

## Field ownership

A rule owns only:

~~~text
(parent issue, configured target field)
~~~

It never owns:

- source fields;
- labels;
- issue body;
- title;
- state;
- assignees;
- issue type;
- unrelated Issue Fields.

## Reconciliation semantics

Hierarchy reconciliation is post-order.

For each rule:

1. discover subtree;
2. reject unsupported edges;
3. evaluate deepest parents;
4. materialize their targets;
5. continue upward;
6. root last.

This is the canonical repair operation after missed webhooks or deliberate target corruption.

## Future reducers

Any future reducer must define:

- supported field type;
- missing-value semantics;
- empty-set semantics;
- deterministic ordering/tie rules;
- nested propagation semantics.

Do not add reducers only at the code level.
