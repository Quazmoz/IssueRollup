import assert from "node:assert/strict";
import test from "node:test";

import type { RepositoryIdentity, TargetState } from "../src/domain.js";
import type { GitHubAdapters } from "../src/github.js";
import { executeParentRule } from "../src/rollup-engine.js";

const CONFIG =
  "version: 1\nrollups:\n  - name: total-effort\n    source_field: Effort\n    target_field: Total Effort\n    reducer: sum\n";

interface HarnessOptions {
  readonly initialTarget?: TargetState;
  readonly children?: readonly {
    readonly repositoryFullName: string;
    readonly issueId: number;
    readonly issueNumber: number;
    readonly nodeId: string;
  }[];
  readonly nestedChild?: number;
  readonly ambiguousWrite?: boolean;
}

function createHarness(options: HarnessOptions = {}): {
  readonly adapters: GitHubAdapters;
  readonly repository: RepositoryIdentity;
  readonly writes: string[];
} {
  const repository = { id: 456, fullName: "acme/widgets" } as const;
  const children =
    options.children ??
    [
      { repositoryFullName: "acme/widgets", issueId: 1001, issueNumber: 11, nodeId: "I_11" },
      { repositoryFullName: "acme/widgets", issueId: 1002, issueNumber: 12, nodeId: "I_12" },
    ];
  let target: TargetState = options.initialTarget ?? { kind: "value", value: 7 };
  const writes: string[] = [];

  const adapters: GitHubAdapters = {
    config: {
      async fetchConfig() {
        return { content: CONFIG, sha: "config-sha", defaultBranch: "main" };
      },
    },
    fields: {
      async listOrganizationFields() {
        return [
          { id: 1, nodeId: "IFN_effort", name: "Effort", dataType: "number" },
          { id: 2, nodeId: "IFN_total", name: "Total Effort", dataType: "number" },
        ];
      },
    },
    issues: {
      async getIssue() {
        return {
          repositoryFullName: "acme/widgets",
          issueId: 1000,
          issueNumber: 10,
          nodeId: "I_parent",
        };
      },
    },
    hierarchy: {
      async getParent() {
        return null;
      },
      async listDirectChildren(_repository, issueNumber) {
        if (issueNumber === 10) return children;
        if (options.nestedChild === issueNumber) {
          return [
            {
              repositoryFullName: "acme/widgets",
              issueId: 2000,
              issueNumber: 20,
              nodeId: "I_20",
            },
          ];
        }
        return [];
      },
    },
    values: {
      async listFieldValues(_repository, issueNumber) {
        if (issueNumber === 11) {
          return [{ fieldId: 1, fieldName: "Effort", dataType: "number", value: 3 }];
        }
        if (issueNumber === 12) {
          return [{ fieldId: 1, fieldName: "Effort", dataType: "number", value: 5 }];
        }
        return [];
      },
      async readTarget() {
        return target;
      },
    },
    writer: {
      async createNumberValue(_issueNodeId, _field, value) {
        writes.push(`create:${value}`);
        if (options.ambiguousWrite === true) return { kind: "ambiguous", reason: "timeout" };
        target = { kind: "value", value };
        return { kind: "applied" };
      },
      async updateNumberValue(_issueNodeId, _field, value) {
        writes.push(`update:${value}`);
        if (options.ambiguousWrite === true) return { kind: "ambiguous", reason: "timeout" };
        target = { kind: "value", value };
        return { kind: "applied" };
      },
      async deleteValue() {
        writes.push("delete");
        if (options.ambiguousWrite === true) return { kind: "ambiguous", reason: "timeout" };
        target = { kind: "unset" };
        return { kind: "applied" };
      },
    },
  };

  return { adapters, repository, writes };
}

test("Phase 2 dry-run proves the local 3 + 5 -> 8 vertical slice without writing", async () => {
  const { adapters, repository, writes } = createHarness();
  const result = await executeParentRule(adapters, {
    repository,
    parentIssueNumber: 10,
    ruleName: "total-effort",
  });

  assert.equal(result.kind, "evaluated");
  if (result.kind === "evaluated") {
    assert.deepEqual(result.evaluation.plan, {
      decision: "WRITE",
      mode: "UPDATE",
      value: 8,
    });
  }
  assert.deepEqual(writes, []);
});

test("apply mode updates only the derived target and verifies authoritative state", async () => {
  const { adapters, repository, writes } = createHarness();
  const result = await executeParentRule(adapters, {
    repository,
    parentIssueNumber: 10,
    ruleName: "total-effort",
    apply: true,
  });

  assert.equal(result.kind, "completed");
  if (result.kind === "completed") assert.equal(result.changed, true);
  assert.deepEqual(writes, ["update:8"]);
});

test("same-value recalculation is a NOOP", async () => {
  const { adapters, repository, writes } = createHarness({
    initialTarget: { kind: "value", value: 8 },
  });
  const result = await executeParentRule(adapters, {
    repository,
    parentIssueNumber: 10,
    ruleName: "total-effort",
    apply: true,
  });

  assert.equal(result.kind, "completed");
  if (result.kind === "completed") assert.equal(result.changed, false);
  assert.deepEqual(writes, []);
});

test("leaf cleanup clears a stale derived target", async () => {
  const { adapters, repository, writes } = createHarness({ children: [] });
  const result = await executeParentRule(adapters, {
    repository,
    parentIssueNumber: 10,
    ruleName: "total-effort",
    apply: true,
  });

  assert.equal(result.kind, "completed");
  assert.deepEqual(writes, ["delete"]);
});

test("cross-repository children fail closed before calculation", async () => {
  const { adapters, repository, writes } = createHarness({
    children: [
      {
        repositoryFullName: "acme/other",
        issueId: 1001,
        issueNumber: 11,
        nodeId: "I_11",
      },
    ],
  });
  const result = await executeParentRule(adapters, {
    repository,
    parentIssueNumber: 10,
    ruleName: "total-effort",
    apply: true,
  });

  assert.deepEqual(result.kind === "failed" ? result.reason : null, "UNSUPPORTED_CROSS_REPOSITORY_HIERARCHY");
  assert.deepEqual(writes, []);
});

test("nested children fail closed until Phase 3 propagation is implemented", async () => {
  const { adapters, repository, writes } = createHarness({ nestedChild: 11 });
  const result = await executeParentRule(adapters, {
    repository,
    parentIssueNumber: 10,
    ruleName: "total-effort",
    apply: true,
  });

  assert.deepEqual(result.kind === "failed" ? result.reason : null, "NESTED_HIERARCHY_DEFERRED");
  assert.deepEqual(writes, []);
});

test("ambiguous mutation outcomes stop without replay", async () => {
  const { adapters, repository, writes } = createHarness({ ambiguousWrite: true });
  const result = await executeParentRule(adapters, {
    repository,
    parentIssueNumber: 10,
    ruleName: "total-effort",
    apply: true,
  });

  assert.equal(result.kind, "ambiguous");
  assert.deepEqual(writes, ["update:8"]);
});
