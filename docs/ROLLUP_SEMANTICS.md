# Rollup Semantics

This document defines what IssueRollup means by a rollup. Implementation must follow these rules unless the contract is intentionally revised.

## V1 value model

A V1 rule has:

- one numeric source field;
- one numeric target field;
- the `sum` reducer.

Example:

~~~yaml
- name: total-effort
  source_field: Effort
  target_field: Total Effort
  reducer: sum
~~~

## Direct children

A parent's target is computed from its current direct sub-issues.

The hierarchy itself comes from GitHub at calculation time.

## Effective child value

To support nested hierarchies without requiring the same source and target field, V1 defines an **effective child value**:

1. If the child itself has sub-issues and has a valid computed target value for the same rule, use that target value.
2. Otherwise use the child's source value.
3. If neither usable value exists, apply the missing-value policy.

Example:

~~~text
Program
├── Epic A                  Total Effort: 8
│   ├── Task A1 Effort: 3
│   └── Task A2 Effort: 5
└── Task B     Effort: 2

Program Total Effort = 8 + 2 = 10
~~~

This allows calculated parent totals to propagate upward.

## Leaf issues

A leaf contributes its source field value.

Its target field is irrelevant unless it later becomes a parent.

## Parent's own source value

V1 does **not** add the parent's own source value to its child aggregate.

Example:

~~~text
Epic Effort: 2            # planning overhead
├── A Effort: 3
└── B Effort: 5

Total Effort = 8, not 10
~~~

An `include_self` option can be considered later but is intentionally excluded from V1.

## Missing values

Default V1 policy:

~~~yaml
missing_value: ignore
~~~

A child with no usable numeric value contributes nothing and is counted in diagnostics.

For a parent with children but no usable values:

- default behavior is to clear/no-value the computed target if the API contract supports a safe single-field clear;
- until that operation is implemented safely, the engine must fail explicitly rather than inventing zero.

A future policy may allow:

~~~yaml
missing_value: zero
~~~

but it is not required for the first MVP.

## Inaccessible children

Default:

~~~yaml
inaccessible_child: fail
~~~

If GitHub reports a child relationship but IssueRollup cannot access data required for that child, the calculation is incomplete.

IssueRollup must:

- not publish a new aggregate;
- emit a structured warning/error;
- identify the affected parent and rule;
- state that installation scope/access should be checked.

Incorrect partial totals are prohibited as the default behavior.

A later opt-in `partial` policy may expose partial aggregates, but any such value must be explicitly distinguishable from a complete aggregate.

## Numeric precision

Use normal JSON/GitHub numeric semantics but define deterministic normalization:

- reject NaN and infinities;
- do not coerce arbitrary strings;
- preserve integer results as integers where possible;
- avoid unnecessary rounding;
- if decimal normalization becomes necessary, document it before release.

Financial currency arithmetic is not a special V1 guarantee.

## Empty hierarchy

If an issue has no sub-issues, IssueRollup does not treat it as a parent rollup target.

Removing the last child requires explicit handling so stale computed values are not left behind. The safe behavior is to clear the target field for that rule when a previously rolled-up parent becomes a leaf.

## Relationship changes

### Add child

Recalculate the new parent.

### Remove child

Recalculate the old parent.

### Re-parent

Recalculate both old and new parents when the event payload/state makes both discoverable. Where webhook data is insufficient, reconciliation must be able to repair state.

## Same-value writes

If:

~~~text
current target == computed target
~~~

do not write.

This is essential for rate-limit efficiency and loop prevention.

## External edits to target fields

Users can manually edit computed target fields.

IssueRollup treats configured target fields as derived data. On the next relevant recalculation, the target converges back to the computed value.

V1 does not attempt to lock fields or prevent manual editing.

## Cycles

GitHub hierarchy rules should prevent invalid parent/sub-issue cycles, but IssueRollup must still protect itself.

During a propagation chain maintain a visited set. Encountering a previously visited issue is a hard error and stops the chain.

## Depth

Propagation must be bounded. The safety limit should be at least as high as GitHub's supported issue hierarchy and configurable only within a safe range.

## Multiple rules

Rules are evaluated independently.

Example:

~~~yaml
rollups:
  - name: effort
    source_field: Effort
    target_field: Total Effort
    reducer: sum

  - name: cost
    source_field: Cost
    target_field: Total Cost
    reducer: sum
~~~

A failure in one rule should not corrupt another rule. Execution may continue per rule while reporting independent outcomes.

## Field ownership

A rule owns only its configured target field value on qualifying parent issues.

It does not own:

- labels;
- issue body;
- status;
- assignees;
- unrelated Issue Fields;
- child source values.

## Future reducers

Future reducer semantics must be documented before implementation. In particular:

- `average`: define missing values and weighting;
- `count`: define whether missing-valued children count;
- `min/max`: define empty-set behavior;
- dates: define timezone and earliest/latest rules;
- ordered selections: define ranking explicitly in config.
