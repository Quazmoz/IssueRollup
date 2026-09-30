# Test Strategy

## Testing goal

Most rollup behavior should be provable without calling GitHub.

The architecture must keep calculation logic pure enough to test exhaustively.

## Test pyramid

### Unit tests

Largest layer.

Cover:

- sum reducer;
- effective child value resolution;
- missing values;
- empty set;
- decimals;
- negative numbers if allowed by GitHub field;
- zero;
- large numeric values within supported semantics;
- unchanged target -> no-op;
- incomplete child -> fail;
- nested contribution selection;
- cycle guard;
- depth guard;
- multi-rule independence;
- invalid config.

### Configuration tests

Schema fixtures:

- minimal valid config;
- full valid V1 config;
- unsupported version;
- duplicate names;
- duplicate/conflicting targets;
- missing fields;
- wrong types;
- unsupported reducer;
- source == target;
- unknown policy.

### Webhook fixture tests

Store sanitized representative payload fixtures for:

- `issues.field_added`;
- `issues.field_removed`;
- sub-issue added;
- sub-issue removed;
- parent changed where applicable;
- irrelevant issue events;
- invalid signature;
- missing installation;
- duplicate delivery.

Test that routing produces the correct recalculation candidates.

### GitHub adapter contract tests

Mock HTTP at the API boundary and verify:

- explicit API version header;
- installation auth used;
- pagination;
- field name -> ID resolution;
- safe single-target-field update;
- 403/404/422 classification;
- rate-limit handling.

### Integration tests

Use a dedicated GitHub organization/repository or controlled test fixture environment.

Required scenarios before MVP:

1. Two leaf children sum into parent.
2. Child value edit updates parent.
3. Child field clear updates parent according to missing policy.
4. Add sub-issue updates parent.
5. Remove sub-issue updates parent.
6. Remove last child clears stale rollup safely.
7. Nested hierarchy propagates bottom-up.
8. Manual parent target edit is repaired on next recalculation.
9. Duplicate webhook produces no incorrect duplicate effect.
10. Out-of-order events converge.
11. Child outside installation scope fails closed.
12. Invalid config produces no mutation.
13. Unrelated Issue Fields survive every write.

## Golden hierarchy fixtures

Maintain human-readable fixtures.

Example:

~~~yaml
parent:
  target_before: 7
  children:
    - source: 3
    - source: 5

expected:
  target_after: 8
~~~

Nested:

~~~yaml
root:
  children:
    - parent:
        target: 8
        children:
          - source: 3
          - source: 5
    - source: 2

expected_root: 10
~~~

## Property-style tests

Useful invariants:

- sum result independent of child ordering;
- duplicate child values do not mutate source data;
- recomputation is idempotent;
- adding a numeric child of value X changes sum by X;
- removing that same child restores prior sum;
- no failure result emits a write plan under fail-closed policy.

## Security tests

- bad webhook signature rejected;
- modified body after signing rejected;
- secrets redacted from logs;
- malicious YAML tags/constructs rejected;
- huge config rejected by size/rule limits;
- unexpected event action ignored;
- arbitrary URL/string cannot cause outbound request.

## Failure injection

Simulate:

- GitHub 500;
- timeout;
- 403 inaccessible child;
- 404 deleted child;
- 422 field validation;
- rate limiting;
- config fetch failure.

Verify classification and retry behavior.

## Release gate

Do not label the integration MVP-ready until:

- unit suite passes;
- webhook fixtures pass;
- adapter contract tests pass;
- real GitHub App end-to-end test passes;
- unrelated-field preservation is proven;
- nested propagation is proven;
- last-child removal behavior is proven;
- incomplete access produces no misleading total.
