# Event Routing Contract

Webhook events tell IssueRollup **what may need recalculation**. They do not provide the final arithmetic inputs.

## General algorithm

For every verified delivery:

1. identify `X-GitHub-Event`;
2. validate the payload `action`;
3. normalize installation, repository, issue, and delivery identifiers;
4. durably enqueue a bounded work item;
5. worker reloads current GitHub state;
6. worker determines affected parent/rule pairs;
7. worker recalculates and conditionally writes.

Unknown event actions are logged and ignored safely.

## `issues` events

GitHub's Issue Fields documentation states:

- `field_added` fires when a field value is set **or updated**;
- `field_removed` fires when a field value is cleared.

### Routing a field change

Given changed issue C:

1. obtain C's current parent P, if any;
2. if P exists, load **P's repository config**, not necessarily the event repository config;
3. for each P rule, compare the changed field identity with:
   - the rule's source field;
   - the rule's target field, because a nested child parent contributes its derived target upward;
4. enqueue P/rule when relevant.

Additionally, if the changed field is a configured target on C and C currently has sub-issues, recalculate C itself before/while propagating to its parent. This repairs a manual edit of derived data.

### Self-generated target events

Do not globally ignore events whose actor is IssueRollup.

A target write on an intermediate parent can be the signal that its own parent needs recalculation.

Optimization may coalesce duplicate work, but correctness must come from same-state no-op behavior rather than actor-based suppression.

## `sub_issues` events

GitHub exposes the `sub_issues` webhook family for hierarchy activity and requires at least Issues read permission.

Known action names include parent/sub-issue added/removed forms. GitHub can add actions over time, so implementation must use an allowlist plus unknown-action logging rather than an exhaustive schema assumption.

For every supported hierarchy event:

- identify old parent if supplied/discoverable;
- identify new parent if supplied/discoverable;
- recalculate each affected parent;
- propagate ancestors after a changed derived value.

Live webhook captures from the controlled test repository must become sanitized fixtures before MVP completion.

## Parent repository owns the rule

A rule is scoped to the parent being calculated.

Example:

~~~text
repo-a#10 parent
  |
  +-- repo-a#11 child
~~~

The applicable config is:

~~~text
repo-a/.github/issuerollup.yml
~~~

This remains true even when routing originated from the child.

## Cross-repository hierarchy

GitHub can model sub-issues across repositories under the same repository owner.

V1 does not promise correctness for those edges.

If child.repository != parent.repository:

~~~text
result = UNSUPPORTED_CROSS_REPOSITORY_HIERARCHY
write = false
~~~

Reason:

- GitHub App installations may be restricted to selected repositories;
- field-change webhooks occur in the repository containing the changed issue;
- documentation alone does not establish a sufficient completeness guarantee for every selected-repository topology.

Cross-repository support requires its own live authorization/event-delivery matrix before it can be enabled.

## Re-parenting

A relationship move can affect both:

- old parent;
- new parent.

If the event payload does not provide enough trustworthy information to identify both, do not invent state. Recalculate the discoverable side and rely on reconciliation to repair the other side.

## Event-order independence

Suppose:

~~~text
child A 3 -> 5
child B 4 -> 8
~~~

If B's event arrives before A's event, each worker still reloads current GitHub values. The final parent converges to the same aggregate.

## Event coalescing

Safe optional optimization:

~~~text
key = installation + repository + parent_issue + rule
~~~

A short debounce/coalescing window may collapse bursts of field changes.

It must not become part of correctness. Turning it off must not change results.

## Derived target manual edit

If a human changes:

~~~text
Parent Total Effort: 8 -> 99
~~~

and Parent has children, IssueRollup must restore the derived value on recalculation.

If Parent also has a parent, ancestor propagation must use the repaired value, not the manually corrupted value.

## Reconciliation routing

Reconciliation bypasses webhook routing but calls the same evaluator/write planner.

Hierarchy reconciliation is post-order:

1. deepest parents first;
2. then their parents;
3. roots last.

That guarantees intermediate derived targets are repaired before they contribute upward.
