import type { AggregateResult, TargetState, WritePlan } from "./domain.js";

function semanticallyEqualNumber(left: number, right: number): boolean {
  return left === right || (Object.is(left, -0) && Object.is(right, 0)) || (Object.is(left, 0) && Object.is(right, -0));
}

export function planTargetWrite(current: TargetState, aggregate: AggregateResult): WritePlan {
  if (aggregate.kind === "fail") return { decision: "FAIL", reason: aggregate.reason };

  if (aggregate.kind === "empty") {
    return current.kind === "value" ? { decision: "CLEAR" } : { decision: "NOOP" };
  }

  if (!Number.isFinite(aggregate.value)) return { decision: "FAIL", reason: "NON_FINITE_AGGREGATE" };
  if (current.kind === "unset") return { decision: "WRITE", mode: "CREATE", value: aggregate.value };
  if (semanticallyEqualNumber(current.value, aggregate.value)) return { decision: "NOOP" };
  return { decision: "WRITE", mode: "UPDATE", value: aggregate.value };
}
