import type { AggregateResult, Contribution } from "./domain.js";

export function sumContributions(contributions: readonly Contribution[]): AggregateResult {
  const values: number[] = [];
  let missingCount = 0;

  for (const contribution of contributions) {
    if (contribution.kind === "missing") {
      missingCount += 1;
      continue;
    }

    if (!Number.isFinite(contribution.value)) {
      return {
        kind: "fail",
        reason: "NON_FINITE_INPUT",
        stats: { childCount: contributions.length, contributingCount: values.length, missingCount },
      };
    }
    values.push(contribution.value);
  }

  if (values.length === 0) {
    return {
      kind: "empty",
      stats: { childCount: contributions.length, contributingCount: 0, missingCount },
    };
  }

  // Canonical numeric ordering makes the result depend on the contribution multiset,
  // not on GitHub/API delivery order. This is deterministic IEEE-754 arithmetic, not
  // arbitrary-precision decimal arithmetic.
  values.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

  let total = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === undefined) continue;
    total += value;
    if (!Number.isFinite(total)) {
      return {
        kind: "fail",
        reason: "NON_FINITE_AGGREGATE",
        stats: { childCount: contributions.length, contributingCount: index + 1, missingCount },
      };
    }
  }

  return {
    kind: "value",
    value: total,
    stats: { childCount: contributions.length, contributingCount: values.length, missingCount },
  };
}
