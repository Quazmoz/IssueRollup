# Webhooks and Reliability

## Core reliability principle

A webhook is a **signal to recalculate**, not the source of truth for the final number.

For every calculation, re-read current GitHub hierarchy and field values.

This makes IssueRollup resilient to:

- duplicate deliveries;
- out-of-order deliveries;
- intermediate state changes;
- retries.

## Relevant event families

### issues

Issue Field changes trigger the `issues` event.

Relevant actions:

- `field_added` when a field is set or updated;
- `field_removed` when a field is cleared.

The payload can help identify the changed field, but the engine should still fetch authoritative current state before writing.

### sub_issues

Sub-issue relationship changes trigger the `sub_issues` event.

Relationship events can require recalculating:

- new parent;
- old parent;
- potentially ancestors.

## Event routing

For every verified event:

1. Determine whether repository config exists.
2. Determine which configured rules may be affected.
3. Resolve candidate parent(s).
4. Recalculate from GitHub.
5. Write only if desired value differs.
6. Propagate upward if the parent's computed contribution changed.

## Duplicate delivery

GitHub includes `X-GitHub-Delivery`.

Log it.

V1 does not require a persistent deduplication database because calculation is idempotent. Duplicate events should become no-op writes after state converges.

If later analytics or side effects are added, persistent delivery dedupe may become necessary.

## Out-of-order delivery

Example:

~~~text
A changes 3 -> 5
B changes 4 -> 8

Webhook B arrives first.
Webhook A arrives second.
~~~

Both handlers fetch current state. Final state converges to current GitHub values rather than depending on payload order.

## Concurrent workers

Two workers may calculate the same parent.

Safe V1 requirements:

- deterministic calculation;
- compare before write;
- no unrelated-field replacement;
- eventual convergence.

Do not add distributed locking until evidence shows it is necessary.

## API failures

Classify failures.

### Retryable

Examples:

- transient 5xx;
- connection timeout;
- selected rate-limit scenarios where GitHub provides a safe retry window.

Use bounded exponential backoff with jitter and respect GitHub rate-limit guidance.

### Non-retryable until configuration/access changes

Examples:

- target field does not exist;
- target has wrong type;
- repository config invalid;
- inaccessible required child;
- installation removed;
- permission denied.

Do not hammer GitHub with blind retries.

## Secondary rate limiting

Avoid rapid repeated writes.

Mitigations:

- no-op detection;
- event coalescing where practical;
- bounded propagation;
- respect Retry-After/rate-limit signals;
- reconciliation runs at controlled concurrency.

## Missed webhooks

A webhook integration can miss events due to deployment/network problems.

Therefore V1 requires a reconciliation mechanism using the same calculation code as normal webhooks.

Reconciliation does not need a dashboard.

Acceptable initial interfaces include:

- protected operational endpoint;
- CLI/admin command;
- GitHub workflow/manual dispatch path.

## Reconciliation algorithm

At minimum support recalculating a known parent issue/rule.

Later repository-wide reconciliation may:

1. discover configured hierarchy roots;
2. traverse bottom-up;
3. calculate deepest parents first;
4. write only differences;
5. emit a summary.

## Propagation safety

Maintain for a single chain:

- visited issue identities;
- depth counter;
- rule identity.

Stop on:

- cycle detection;
- depth safety limit;
- hard access/config error;
- no parent.

## Last-child removal

Relationship changes that turn a parent into a leaf are important.

The system must remove/clear stale derived target values when safe to do so. This behavior needs an integration test before MVP release.

## Observability

Structured log event example:

~~~json
{
  "event": "rollup.calculated",
  "delivery_id": "...",
  "installation_id": 123,
  "repository": "org/repo",
  "issue_number": 42,
  "rule": "total-effort",
  "children": 4,
  "values_used": 3,
  "missing": 1,
  "inaccessible": 0,
  "old_value": 18,
  "new_value": 21,
  "decision": "write"
}
~~~

Do not include:

- authorization headers;
- private keys;
- installation tokens;
- webhook secrets.

## Health signals

Minimum operational metrics:

- webhook requests received;
- signature verification failures;
- calculations attempted;
- calculations succeeded;
- writes performed;
- no-op calculations;
- config errors;
- access/incomplete errors;
- GitHub API errors by status;
- reconciliation outcomes.

A full monitoring dashboard is not a product requirement.
