# Configuration Contract

## Location

V1 repository configuration:

~~~text
.github/issuerollup.yml
~~~

The default branch version is authoritative.

## Minimal V1 example

~~~yaml
version: 1

rollups:
  - name: total-effort
    source_field: Effort
    target_field: Total Effort
    reducer: sum
~~~

## Full V1 shape

~~~yaml
version: 1

rollups:
  - name: total-effort
    source_field: Effort
    target_field: Total Effort
    reducer: sum
    missing_value: ignore
    inaccessible_child: fail
~~~

## Schema

### version

Required integer.

V1 accepts only:

~~~yaml
version: 1
~~~

Reject unsupported versions with an actionable error.

### rollups

Required non-empty array.

Each rule must have a unique `name`.

### name

Required string.

Requirements:

- stable identifier;
- repository-unique;
- safe for structured logging.

Recommended pattern:

~~~text
[a-z0-9][a-z0-9-_]{0,63}
~~~

### source_field

Required Issue Field name.

V1 requires a numeric Issue Field.

### target_field

Required Issue Field name.

V1 requires a numeric Issue Field.

The implementation should resolve the name to an ID before calculation.

### reducer

V1:

~~~yaml
reducer: sum
~~~

Unknown reducers are configuration errors.

### missing_value

V1 default:

~~~yaml
missing_value: ignore
~~~

### inaccessible_child

V1 default and initially only supported safe mode:

~~~yaml
inaccessible_child: fail
~~~

## Invalid configurations

Reject at least:

- missing `version`;
- unsupported version;
- no rollup rules;
- duplicate rule names;
- source field not found;
- target field not found;
- non-number source in V1;
- non-number target in V1;
- unsupported reducer;
- unsupported policy value;
- duplicate/ambiguous configuration that would cause conflicting writes to the same target field.

## Conflicting target rules

Two rules writing the same target field are prohibited in V1.

Bad:

~~~yaml
rollups:
  - name: a
    source_field: Estimate
    target_field: Total
    reducer: sum

  - name: b
    source_field: Cost
    target_field: Total
    reducer: sum
~~~

This must fail validation rather than depend on execution order.

## Source equals target

V1 should reject `source_field == target_field` until same-field recursive semantics are explicitly designed and tested.

Using separate source and target fields makes ownership clear and avoids overwriting leaf estimates.

## Field names versus IDs

Users configure human-readable field names for portability.

At runtime:

~~~text
config name -> resolve GitHub field -> internal field ID
~~~

Logs should include both name and ID when safe/useful.

## Missing config

No config means IssueRollup is disabled for that repository.

This is not an error.

## Invalid config

Invalid config disables calculation for that repository until fixed and should produce a clearly discoverable diagnostic.

Do not guess intended field names.

## Future schema evolution

Potential V2 additions:

~~~yaml
rollups:
  - name: total-effort
    source_field: Effort
    target_field: Total Effort
    reducer: sum
    include_self: false

  - name: max-severity
    source_field: Severity
    target_field: Rollup Severity
    reducer: highest
    order: [Low, Medium, High, Critical]

  - name: latest-date
    source_field: Target Date
    target_field: Rollup Target Date
    reducer: latest
~~~

Do not implement these by silently extending version 1 in incompatible ways.
