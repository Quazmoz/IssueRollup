import assert from "node:assert/strict";
import test from "node:test";

import type { Contribution } from "../src/domain.js";
import { planTargetWrite } from "../src/planner.js";
import { sumContributions } from "../src/reducer.js";

const v = (value: number): Contribution => ({ kind: "value", value });
const missing: Contribution = { kind: "missing" };

test("sum reducer handles integers, decimals, zero, negatives, missing values, and empty sets", () => {
  assert.deepEqual(sumContributions([v(3), v(5)]), { kind: "value", value: 8, stats: { childCount: 2, contributingCount: 2, missingCount: 0 } });
  assert.equal(sumContributions([v(1.25), v(2.5)]).kind, "value");
  assert.deepEqual(sumContributions([v(0), missing]), { kind: "value", value: 0, stats: { childCount: 2, contributingCount: 1, missingCount: 1 } });
  assert.deepEqual(sumContributions([v(-3), v(5)]), { kind: "value", value: 2, stats: { childCount: 2, contributingCount: 2, missingCount: 0 } });
  assert.equal(sumContributions([]).kind, "empty");
  assert.equal(sumContributions([missing, missing]).kind, "empty");
});

test("sum reducer rejects non-finite inputs and aggregate overflow", () => {
  assert.equal(sumContributions([v(Number.NaN)]).kind, "fail");
  assert.equal(sumContributions([v(Number.POSITIVE_INFINITY)]).kind, "fail");
  const overflow = sumContributions([v(Number.MAX_VALUE), v(Number.MAX_VALUE)]);
  assert.deepEqual(overflow.kind === "fail" ? overflow.reason : null, "NON_FINITE_AGGREGATE");
});

test("sum is order independent for the supported deterministic fixtures", () => {
  const a = sumContributions([v(3), v(-1), v(2.5), missing]);
  const b = sumContributions([missing, v(2.5), v(-1), v(3)]);
  assert.deepEqual(a, b);
});

test("write planner emits create, update, noop, clear, and fail", () => {
  const eight = sumContributions([v(3), v(5)]);
  assert.deepEqual(planTargetWrite({ kind: "unset" }, eight), { decision: "WRITE", mode: "CREATE", value: 8 });
  assert.deepEqual(planTargetWrite({ kind: "value", value: 7 }, eight), { decision: "WRITE", mode: "UPDATE", value: 8 });
  assert.deepEqual(planTargetWrite({ kind: "value", value: 8 }, eight), { decision: "NOOP" });
  assert.deepEqual(planTargetWrite({ kind: "value", value: 9 }, sumContributions([missing])), { decision: "CLEAR" });
  assert.deepEqual(planTargetWrite({ kind: "unset" }, sumContributions([missing])), { decision: "NOOP" });
  assert.equal(planTargetWrite({ kind: "unset" }, sumContributions([v(Number.NaN)])).decision, "FAIL");
});

test("write planner treats -0 and 0 as semantically equal", () => {
  assert.deepEqual(planTargetWrite({ kind: "value", value: -0 }, { kind: "value", value: 0, stats: { childCount: 1, contributingCount: 1, missingCount: 0 } }), { decision: "NOOP" });
});
