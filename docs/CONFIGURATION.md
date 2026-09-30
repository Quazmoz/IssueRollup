# Configuration Contract

## Location

~~~text
.github/issuerollup.yml
~~~

The version on the parent repository's default branch is authoritative.

## Minimal V1 config

~~~yaml
version: 1

rollups:
  - name: total-effort
    source_field: Effort
    target_field: Total Effort
    reducer: sum
~~~

## Full V1 config

~~~yaml
version: 1

rollups:
  - name: total-effort
    source_field: Effort
    target_field: Total Effort
    reducer: sum
    missing_value: ignore
~~~

## Root schema

### version

Required integer.

Only:

~~~yaml
version: 1
~~~

is accepted by V1.

### rollups

Required non-empty array.

Set a conservative implementation maximum (recommended: 16 rules per repository) and reject larger configs rather than allowing unbounded webhook fan-out.

## Rule schema

### name

Stable unique identifier.

Recommended:

~~~text
[a-z0-9][a-z0-9-_]{0,63}
~~~

### source_field

Exact organization Issue Field name.

V1 requires `data_type: number`.

### target_field

Exact organization Issue Field name.

V1 requires `data_type: number`.

### reducer

Only:

~~~yaml
reducer: sum
~~~

### missing_value

V1 default/allowed value:

~~~yaml
missing_value: ignore
~~~

## Name resolution

At runtime:

~~~text
configured exact name
   -> GET organization Issue Fields
   -> validate unique match and type
   -> REST numeric ID + GraphQL node ID
~~~

Do not discover field IDs only from values currently present on an issue; the target can legitimately be unset.

If exact-name resolution is absent or ambiguous, fail configuration.

## Invalid V1 config

Reject:

- unsupported schema version;
- empty rules;
- too many rules;
- duplicate rule names;
- missing source/target;
- source field absent;
- target field absent;
- source not numeric;
- target not numeric;
- source == target;
- unsupported reducer;
- unsupported missing policy;
- multiple rules claiming the same target field;
- unknown top-level/rule keys unless schema explicitly permits them.

Strict unknown-key rejection prevents misspellings from silently changing semantics.

## Missing config

No config means IssueRollup is disabled for that parent repository.

Not an error.

## Invalid config

Invalid config means no mutations for that repository until fixed.

Log actionable validation details without publishing secrets.

## Repository trust model

The configuration file is untrusted repository content.

It is declarative and may not contain:

- executable code;
- shell commands;
- arbitrary URLs;
- file paths outside the fixed config path;
- arbitrary GraphQL/REST fragments;
- secret references.

## Renamed Issue Fields

Because V1 config is name-based, renaming a field in GitHub invalidates a rule until config is updated.

IssueRollup must fail visibly rather than guessing by stale cached ID.

A future schema can optionally support explicit IDs.

## Future schema

Potential versioned additions:

- alternate reducers;
- date/select fields;
- explicit field IDs;
- cross-repository opt-in after support is proven;
- Project V2 adapter selection.

Do not silently broaden version 1 with incompatible semantics.
