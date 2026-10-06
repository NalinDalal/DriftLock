# DriftLock CLI

`driftlock` is the command-line engine behind DriftLock (Dependabot, but for APIs): it scans a codebase for vendor API call sites, captures real traffic shapes, diffs them against a baseline, and opens a GitHub PR with the fix. The GitHub Action workflow in `templates/driftlock.yml` is a thin wrapper around `driftlock fix`.

## Install

Once published:

```bash
bun add -g @driftlock/cli
# or on a CI runner, no install needed:
bunx @driftlock/cli --help
```

From source (this repo):

```bash
bun install
bun run --cwd apps/cli index.ts --help
```

## Commands

All commands print human-readable output by default. `fix` and `analyze` support machine-readable flags for CI.

### `driftlock analyze <path>`

Scan a directory for TypeScript/JavaScript vendor SDK call sites (Stripe, Twilio, any configured vendor).

```bash
driftlock analyze ./src
driftlock analyze ./src -o json
```

| Flag | Default | Meaning |
| ---- | ------- | ------- |
| `-o, --output <format>` | `table` | `json` for machine-readable call sites and errors |

### `driftlock test <path>`

Run the test suite in an isolated Docker sandbox through a capture proxy, recording which tests hit real APIs versus mocks.

```bash
driftlock test ./repo --command "bun test"
```

| Flag | Default | Meaning |
| ---- | ------- | ------- |
| `-c, --command <cmd>` | `npm test` | Test command to run inside the sandbox |
| `-t, --timeout <ms>` | `300000` | Sandbox timeout |

### `driftlock diff <path>`

Compare API snapshots for a repo, optionally against a base branch, to see which call sites a branch affects.

```bash
driftlock diff ./repo --base main
```

### `driftlock fix <path>` (the loop)

Scan, capture, compare, fix, and open PRs. The core loop:

1. First run records baseline snapshots to `.driftlock/snapshots/` (no comparison yet).
2. Later runs diff captured shapes against the baseline and fix each drift.
3. Each fix becomes a GitHub PR. Nothing merges without review.

```bash
# Preview only, no writes, no PRs
driftlock fix ./repo --dry-run

# Detect and open PRs (needs GITHUB_TOKEN)
driftlock fix ./repo --repo owner/repo --command "bun test"

# Scheduled CI: also commit refreshed baselines so the next run compares
driftlock fix ./repo --repo owner/repo --command "bun test" --commit-baselines --json
```

| Flag | Default | Meaning |
| ---- | ------- | ------- |
| `--repo <owner/repo>` | — | Create fix PRs against this repo (skips PRs if omitted) |
| `--base <branch>` | `main` | Base branch for fix PRs and baseline pushes |
| `-c, --command <cmd>` | `npm test` | Test command for traffic capture |
| `--forward <pattern>` | — | Forward a normally-intercepted endpoint (repeatable) |
| `--dry-run` | — | Show call sites, create nothing |
| `--json` | — | Last stdout line is always a JSON summary (for CI) |
| `--commit-baselines` | — | Commit changed `.driftlock/` snapshots and push to the base branch |

With `--json`, the last stdout line is always:

```json
{"callSites":N,"drifts":N,"fixes":N,"prs":[...],"baselines":N,"pendingCapture":N,"baselinesCommitted":true}
```

Each `prs` entry carries `url`, `number`, `status`, and `driftId`. The GitHub Action template parses this line to report the run to DriftLock Cloud.

### `driftlock watch <provider>`

Poll a vendor's published spec for breaking changes, optionally triggering the migration agent. Cron-friendly exit codes: `0` no breaking change, `1` members removed, `2` poll failed.

```bash
driftlock watch stripe
driftlock watch stripe --trigger --repo owner/repo
```

| Flag | Default | Meaning |
| ---- | ------- | ------- |
| `--version <v>` | `latest` | Version label recorded on the baseline |
| `--baselines-dir <dir>` | `.driftlock/vendor-baselines` | Where polled baselines live |
| `--trigger` | — | Run the migration agent when members are removed |
| `--repo <owner/repo\|path>` | — | Repo to migrate (with `--trigger`) |
| `--base <branch>` | `main` | Base branch for triggered PRs |
| `--model <name>` | `DRIFTLOCK_MODEL` | Model for the triggered agent |
| `--tier <free\|pro>` | `DRIFTLOCK_PLAN` or `pro` | Free tier never publishes PRs |
| `--model-provider <name>` | `DRIFTLOCK_MODEL_PROVIDER` or `openai` | Model provider (OpenAI wire protocol default, so Ollama works via `OPENAI_BASE_URL`) |

### `driftlock init`

Interactive first-time setup: writes a `.driftlock.yml` (test command, proxy, sandbox) in the current directory.

### `driftlock capture --har <path>`

Turn a HAR 1.2 recording into a consumer contract (`--base-url` filters entries, `--out` writes yaml/json, otherwise stdout).

### `driftlock migrate --repo <owner/repo|path> --change <file>`

One-shot migration from a ProviderChange JSON file (used by `watch --trigger` internally). `--dry-run` shows the patch without pushing.

## Environment variables

| Variable | Needed for | Meaning |
| -------- | ---------- | ------- |
| `GITHUB_TOKEN` | PR creation | Repo-scoped token (Contents + Pull requests read/write) |
| `AI_PROVIDER` | Model fixes | `openai`, `anthropic`, `gemini`, or `cloudflare` (omit for deterministic-only) |
| `AI_API_KEY` | `openai` / `anthropic` | Model key (`GEMINI_API_KEY` / `CLOUDFLARE_API_TOKEN` take precedence per provider) |
| `AI_MODEL` / `GEMINI_MODEL` / `CLOUDFLARE_AI_MODEL` | Model fixes | Override the default model per provider |
| `AI_BASE_URL` / `OPENAI_BASE_URL` | Local models | OpenAI-compatible endpoint, e.g. `http://127.0.0.1:11434/v1` for Ollama (only with `AI_PROVIDER=openai`) |
| `CLOUDFLARE_ACCOUNT_ID` | `cloudflare` | Workers AI account ID |
| `DRIFTLOCK_MODEL` / `DRIFTLOCK_PLAN` / `DRIFTLOCK_MODEL_PROVIDER` | `watch --trigger` | Model, tier, and provider for the triggered agent |

Without any `AI_*` variables, fixes are deterministic (renames, null checks, type coercions) and still automatic. Model fixes apply only when the model is confident (≥ 60) and passes semantic validation; otherwise the deterministic fix stands.

## Baselines

Snapshots live in `<repo>/.driftlock/snapshots/`. They are ordinary files: commit them. On ephemeral CI runners pass `--commit-baselines` so snapshots persist for the next run; without it every run re-baselines and drift is never detected.

## Publishing (maintainers)

The published package ships a single bundled file, because the ten `@driftlock/*` workspace dependencies are not on npm. Two things cannot be bundled and are handled explicitly:

- Native modules (`tree-sitter` grammars) stay external: they install from the registry on the target machine, built for its platform. Bundling them breaks (the parser crashes at startup).
- `cpu-features` stays external: it is absent on some runners and `ssh2` tolerates that via try/catch.

`prepublishOnly` runs the build plus `scripts/prepare-publish.ts`, which writes a publishable `dist/package.json` (bundled code + the three native registry deps, no `workspace:*` ranges). You publish the `dist` directory itself:

```bash
cd apps/cli
npm login
bun run build
bun scripts/prepare-publish.ts
npm pack ./dist            # inspect: index.js + package.json only
# offline proof: install the tarball in an empty dir, then run the bin
npm install --prefix /tmp/pkgtest ./driftlock-cli-0.1.0.tgz
/tmp/pkgtest/node_modules/.bin/driftlock analyze ./some/repo
npm publish ./dist --access public
```

Release flow: bump `version` in `apps/cli/package.json`, run the checks above, publish, then tag `cli-vX.Y.Z` (`templates/driftlock.yml` pins `bunx @driftlock/cli`, which resolves `latest`). Verify on a clean machine with `bunx @driftlock/cli --help`. Never re-add `"private": true` (npm refuses to publish it), never point `bin` back at TypeScript source (runners have no workspace to resolve it from), and never remove a `--external` flag without re-running the tarball proof (the last removal crashed the parser).
