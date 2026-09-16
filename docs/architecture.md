# Driftlock — Architecture

## System overview

Driftlock is a GitHub App + background worker. It watches repos where it's installed, extracts API usage from static analysis and sandbox test runs, diffs inferred specs over time, and opens PRs when drift is detected.

## Components

### 1. GitHub App
- OAuth/webhook handler for installation events.
- App-level permissions: read repo contents, read PRs, write PRs (create branches, open PRs).
- Same permission model as CodeRabbit, Dependabot, Renovate.
- Two identities: the App installation token (machine, per account, scoped to installed repos) and the human OAuth token (`read:user` + `read:org`, only lists accounts). No `repo` scope on the human token.

### 2. Dashboard (apps/fe)
- React + Vite + TanStack Router app. Client usage only.
- Account-first model: list the user's account and orgs where DriftLock is installed, then drill into repos.
- Calls only the webhook JSON API. Owns no webhook or OAuth handling itself.
- Control plane: watched repos, read/write permissions per repo or org, API keys and probe credentials, preferences and schedules. PRs always land in GitHub; the dashboard never merges or applies code.

### 3. Usage extractor (static analysis)
- Parses codebase to find call sites for tracked third-party APIs.
- Extracts: endpoint paths, HTTP methods, request params/body fields, response fields accessed.
- Outputs a normalized "inferred spec" per call site.

### 4. Test classifier
- Inspects test files to determine whether a test hits a real sandbox/test-mode endpoint or mocks the HTTP layer.
- Differentiates: (a) monitored (sandbox-hitting), (b) tested-but-blind (mocked), (c) untested.

### 5. Sandbox prober
- Runs the customer's test suite (one command) against their sandbox credentials.
- Captures real request/response payloads.
- Stores snapshots keyed by call site + timestamp.
- **Safety:** skips non-idempotent endpoints by default unless explicitly whitelisted.

### 6. Drift detector
- Compares latest snapshot against the previous one.
- Identifies: added/removed fields, renamed fields, type changes, status code changes, new required params.
- Confidence scoring to reduce false positives.

### 7. PR generator
- On drift detection, creates a fresh branch.
- Applies a proposed fix (field rename, default value addition, type coercion, etc.).
- Opens a PR with: what changed, why it changed, suggested fix.
- Deletes the branch immediately after merge or close (CodeRabbit hygiene).

### 8. Coverage reporter
- Per-call-site status: monitored / tested-but-blind / untested.
- Exposed in-app or via a status check on the PR.

## Data model (simplified)

```text
Installation
  - repo, owner, app_id, webhook_secret

CallSite
  - repo_id, file_path, method, endpoint
  - inferred_spec_json, last_checked_at

Snapshot
  - call_site_id, captured_at
  - request_shape_json, response_shape_json

DriftEvent
  - call_site_id, detected_at
  - old_snapshot_id, new_snapshot_id
  - diff_summary, suggested_fix_json
  - pr_number (nullable, until opened)
```

## v1 scope

- Single vendor: **Stripe**.
- Single language/framework target (to be decided; likely TypeScript/Node given target audience).
- GitHub App only. No GitLab/Bitbucket/GitHub Enterprise in v1.
- Suggest-only PRs. No auto-merge.

## Known hard problems

- **Mocked vs. sandbox tests** — looks identical from the outside unless you trace whether the test made a network call. Detecting this reliably is core infra.
- **Coverage ceiling** — if it's not tested against a real sandbox, it's invisible. Say this plainly.
- **Non-idempotent endpoints** — POST /charges can't be replayed safely without explicit sandbox handling.
- **Spec inference precision** — dynamic dispatch, wrapper SDKs, and generated clients can obscure the actual HTTP surface.

## Out of scope for v1

- Auto-merge / auto-apply.
- Multi-vendor support.
- Passive traffic monitoring / proxying.
- New-feature discovery (changelog/docs crawling).
