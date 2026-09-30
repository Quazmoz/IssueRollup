# Webhooks and Reliability

## Reliability premise

GitHub webhook delivery is not a durable message bus.

GitHub currently documents:

- successful receivers should return 2XX within 10 seconds;
- a slower response is considered a failed delivery;
- failed deliveries are **not automatically redelivered**;
- recent deliveries can be manually/API-redelivered for the past 3 days;
- `X-GitHub-Delivery` is a globally unique delivery identifier and remains the same on redelivery.

IssueRollup therefore combines fast durable intake with reconciliation.

## Production ingestion

~~~text
request
  -> capture raw body
  -> validate HMAC-SHA256
  -> validate event/action
  -> validate basic IDs
  -> durable enqueue
  -> 2XX
~~~

Do not perform the full hierarchy/field fan-out on the request thread in production.

If enqueue fails, do not return a false success.

A production enqueue is "durable" only after the queue/transport confirms persistence outside the ingress process's volatile memory. In-memory handoff is not a production acknowledgement boundary.

## Signature validation

Use:

~~~text
X-Hub-Signature-256
~~~

Validation requirements:

- HMAC SHA-256;
- webhook secret;
- exact raw payload bytes;
- constant-time comparison;
- reject before business processing.

Do not rely on legacy SHA-1 `X-Hub-Signature`.

## Delivery identity

Capture:

~~~text
X-GitHub-Delivery
~~~

Use it for:

- structured logs;
- worker correlation;
- short-lived replay/dedupe protection where available;
- operator redelivery diagnosis.

Correctness still relies on idempotent recomputation because the same delivery can legitimately be redelivered.

Dedupe must distinguish successful/in-flight work from failed work. A delivery ID must not become a permanent tombstone that prevents an operator redelivery or recovery retry after the prior attempt failed.

## Events

### issues

Relevant Issue Field actions from GitHub Issue Fields documentation:

- `field_added`: field is set or updated;
- `field_removed`: field is cleared.

### sub_issues

Relevant hierarchy activity is delivered through the `sub_issues` event family.

V1 allowlists:

- `parent_issue_added`;
- `parent_issue_removed`;
- `sub_issue_added`;
- `sub_issue_removed`.

Because GitHub can add webhook actions, the router must log and safely ignore unknown action names until their semantics are explicitly supported and fixture-tested.

See `EVENT_ROUTING.md`.

## Worker model

For every job:

1. acquire installation token;
2. locate affected parent;
3. load parent-repo config;
4. resolve fields;
5. reload hierarchy;
6. reject unsupported cross-repo edge;
7. reload current values;
8. evaluate;
9. compare current/desired target;
10. single-field mutate if needed;
11. propagate ancestor if changed.

## Duplicate deliveries

Duplicate events are safe because:

- arithmetic is deterministic;
- state is re-read;
- unchanged target => no mutation.

Persistent dedupe is an optimization, not the only safety mechanism.

## Out-of-order deliveries

Webhook ordering is not trusted.

Workers always derive desired state from current GitHub state.

## Concurrency

Two workers can target the same parent/rule.

Reload + compare-before-write is not sufficient by itself: worker A can calculate an older state, worker B can write a newer result, and worker A can then finish last and overwrite B.

V1 therefore requires serialization or equivalent fencing across worker instances for:

~~~text
installation + repository + parent issue + rule
~~~

Acquire that mutation lane before the final authoritative reload; hold it through evaluation and the write/clear decision. Reconciliation uses the same key.

Coalescing remains an optimization. The serialization/fencing mechanism is part of correctness.

## Retry classification

Retryable read examples:

- timeout;
- connection reset;
- selected 5xx;
- explicit rate-limit retry condition.

For a mutation, timeout/connection failure/selected 5xx can mean GitHub committed the write but the client missed the response. Treat that outcome as unknown: reload current target and current inputs, recalculate, and create a fresh write plan before any further mutation. Never blindly replay the previous mutation.

Potentially recoverable once:

- 401 from expired installation token -> refresh and retry once.

Do not blind-retry:

- invalid config;
- unsupported hierarchy;
- deterministic 422;
- persistent 403 permission failure;
- field removed/renamed.

## Rate limits

Writes can trigger notifications and secondary-rate-limit protections.

Use:

- no-op checks;
- bounded worker concurrency;
- coalescing;
- exponential backoff with jitter;
- `Retry-After`/rate-limit headers;
- controlled reconciliation concurrency.

## Missed deliveries

GitHub does not automatically retry failed deliveries.

V1 therefore needs at least one operational reconciliation entry point.

Production maturity should also consider:

- alerting on webhook failures;
- automated inspection/redelivery of recent failed GitHub App deliveries;
- periodic reconciliation.

A redelivery checker is not a substitute for reconciliation because GitHub only exposes a finite recent-delivery window.

## Reconciliation

Single-parent:

~~~text
reconcile(parent, rule)
~~~

Hierarchy:

- discover supported subtree;
- process post-order;
- repair derived children first;
- root last.

No alternate arithmetic implementation.

## Last-child removal

When a parent becomes a leaf:

- clear the rule's target via single-field delete if it is set;
- propagate the change to the ancestor if applicable.

## Observability

Minimum structured events:

- webhook.accepted;
- webhook.rejected_signature;
- webhook.unsupported_action;
- job.started;
- rollup.noop;
- rollup.written;
- rollup.cleared;
- rollup.failed;
- reconcile.started/completed;
- github.retry;
- github.rate_limited.

Include:

- delivery ID;
- installation ID;
- org/repo;
- issue;
- rule;
- classified reason.

Exclude credentials and sensitive headers.
