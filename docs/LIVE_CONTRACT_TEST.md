# Live GitHub App Contract Test

This guide is for the controlled Phase 2 integration test. It is **not** a production deployment procedure.

## Purpose

Prove the documented GitHub contract with a real GitHub App installation:

1. installation authentication works;
2. organization Issue Fields can be listed;
3. repository config can be loaded;
4. parent/sub-issue and Issue Field-value reads work;
5. `3 + 5 -> 8` evaluates from current GitHub state;
6. GraphQL create/update/delete touches only the configured derived field;
7. the target is re-read after mutation;
8. every non-target Issue Field is unchanged.

The harness is dry-run by default.

## GitHub App prerequisites

Register a test GitHub App with exactly the V1 permissions documented in `docs/GITHUB_APP.md`:

Repository:

- Metadata: read
- Contents: read
- Issues: write

Organization:

- Issue Fields: read

Subscribe only to:

- `issues`
- `sub_issues`

Install it on a controlled organization-owned test repository. Personal-account repositories are outside the V1 contract and the live adapter rejects them explicitly.

Do not commit the App private key, webhook secret, JWT, or installation token.

## Test repository prerequisites

Create two organization number fields, for example:

- `Effort`
- `Total Effort`

Commit:

~~~yaml
# .github/issuerollup.yml
version: 1

rollups:
  - name: total-effort
    source_field: Effort
    target_field: Total Effort
    reducer: sum
~~~

Create one parent issue with two direct leaf sub-issues and set:

~~~text
child A Effort = 3
child B Effort = 5
~~~

Keep the Phase 2 test hierarchy in one repository and make both children leaves. Nested propagation is intentionally deferred to Phase 3.

## Environment

Preferred: let IssueRollup mint a short-lived installation token from the App credentials.

~~~bash
export ISSUEROLLUP_APP_CLIENT_ID='...'
export ISSUEROLLUP_APP_PRIVATE_KEY="$(cat /secure/path/issuerollup.private-key.pem)"
export ISSUEROLLUP_INSTALLATION_ID='...'
export ISSUEROLLUP_REPOSITORY_ID='...'
export ISSUEROLLUP_REPOSITORY='ORG/REPO'
export ISSUEROLLUP_PARENT_ISSUE='123'
export ISSUEROLLUP_RULE='total-effort'
~~~

The installation-token exchange requests access only to `ISSUEROLLUP_REPOSITORY_ID`, and the harness now fails closed unless GitHub's token response confirms exactly that repository scope.

The Phase 2 harness intentionally does **not** accept an opaque pre-minted token. This prevents a maintainer PAT or an unverified installation token from being substituted for the required GitHub App JWT -> installation-token proof.

## Dry run

~~~bash
npm ci
npm run live:contract
~~~

Expected characteristics:

- `mode` is `dry-run`;
- `authentication.method` is `github-app-jwt`;
- `authentication.repositoryScopeVerified` is `true`;
- `authentication.repositoryId` matches `ISSUEROLLUP_REPOSITORY_ID`;
- no GraphQL mutation is sent;
- the repository preflight confirms an organization-owned repository;
- the plan should converge on the current authoritative state;
- with children 3 and 5 and a different current target, the plan should be a write to 8.

## Apply

Mutation requires the exact sentinel:

~~~bash
ISSUEROLLUP_APPLY=YES_I_UNDERSTAND_THIS_WRITES_GITHUB npm run live:contract
~~~

After a successful mutation the harness:

1. re-reads the target from GitHub;
2. verifies the target matches the write plan;
3. re-reads all parent Issue Field values;
4. compares every non-target field with the pre-mutation snapshot;
5. exits non-zero if a non-target field changed.

The field snapshots themselves are not printed.

## Required live mutation matrix

Run the controlled test through all three target states.

### Create

Start with `Total Effort` unset and child Effort values 3 and 5.

Expected:

~~~text
CREATE 8
~~~

### Update

Start with a target value different from the current child sum.

Expected:

~~~text
UPDATE <current sum>
~~~

### Delete

Start with the derived target set and make the qualifying contribution set empty, for example by clearing both leaf source values.

Expected:

~~~text
CLEAR
~~~

For all three operations, the non-target field preservation check must report success.

## Evidence to retain

For Phase 2 completion, retain sanitized evidence only:

- GitHub App permission settings;
- installation/repository identity;
- successful dry-run output;
- successful create/update/delete results;
- preservation-check result;
- sanitized real webhook payload fixtures;
- GitHub request IDs when useful for diagnosis.

Never commit credentials or Authorization headers.

## Not proved by Phase 2

Phase 2 does not make the service production-ready. Phase 3 still owns:

- durable webhook intake;
- cross-worker mutation serialization/fencing;
- retry/backoff and rate-limit policy;
- ambiguous-mutation reload/re-plan recovery;
- nested propagation;
- reconciliation;
- duplicate/out-of-order production delivery handling.
