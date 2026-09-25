# @driftlock/agent

The migration agent. Takes a vendor API change, edits a customer repository to
match, verifies the result, and stops with a verdict.

## [shipped] What this does

You hand it a `ChangePacket` (provider, from version, to version, summary,
migration docs) and a path to a git repository. It inspects the repo, finds the
affected call sites, reads them, applies minimal diffs, runs a whitelisted
verification command, and reports one of three outcomes:

| Outcome      | Meaning                                              |
| ------------ | ---------------------------------------------------- |
| `auto_pr`    | Files changed and a verification command passed      |
| `review_pr`  | Files changed but validation failed, or never ran   |
| `no_action`  | Nothing changed, usually the API is not used        |

`auto_pr` means the diff is ready for a human. It never means merged.

## Files

- `tools.ts`: the seven tools the model can call, with their JSON schemas.
- `state.ts`: `ChangePacket`, `AgentState`, budgets, and the outcome rules.
- `executor.ts`: the sandbox. Every tool call lands here.
- `publisher.ts`: the pull request path, and the branch guard in front of it.
- `migrationAgent.ts`: the loop. Calls OpenAI, runs tools, applies ceilings.
- `prompt.ts`: the system prompt, including when to stop and report.
- `docsToConfig.ts`: vendor doc to `VendorConfig`, for the parser pipeline.

## The tools

| Tool               | What it does                              |
| ------------------ | ----------------------------------------- |
| `inspectRepo`      | Package manager, dependencies, source tree |
| `searchCode`       | Literal string search, returns `file:line` |
| `readFile`         | File contents with 1-indexed line numbers  |
| `editFile`         | Applies one unified diff                  |
| `replaceInFile`    | Replaces one exact snippet               |
| `runCommand`       | Runs an allowed verification command      |
| `createPullRequest`| Summarises the diff and targets a branch   |

## [shipped] Safety

The agent edits a real repository, so the executor is the boundary.

- `resolveInsideRoot` rejects absolute paths, `~`, and any `..` segment.
- Protected paths are refused: `.env` and variants, `id_rsa`, `*.pem`, `*.key`,
  `*.p12`, `*.pfx`, `.git/config`.
- `editFile` rejects anything that is not a unified diff with `@@` hunks and
  `---`/`+++` headers, then applies it with `git apply` so a bad hunk fails
  loudly instead of corrupting a file.
- `runCommand` is an exact string match against a fixed whitelist (`npm test`,
  `npm run build`, `npm run typecheck`, and pnpm/bun equivalents). Shell
  operators are not accepted, so `npm test && rm -rf /` is refused.
- A whitelisted command is not run on the host. It runs in a Docker container
  against a disposable copy of the repository, with the network off. See
  [Sandboxed command execution](#shipped-sandboxed-command-execution).
- The environment handed to a command is an allowlist. Anything matching
  `KEY`, `TOKEN`, `SECRET`, `PASSWORD`, `CREDENTIAL`, `PRIVATE`, `SESSION`,
  `COOKIE`, or `AUTH` is dropped, so a customer build script cannot read
  `OPENAI_API_KEY` or `GITHUB_TOKEN` out of the DriftLock process.
- `editFile` reads the `+++` headers out of the patch and refuses any patch
  that targets a different file, a protected path, or a path outside the root.
  A declared path the patch does not honour is a refusal, not a silent retarget.
- `editFile` canonicalises the `---`/`+++` header lines to `a/<path>` and
  `b/<path>` and applies with `git apply --recount -p1`, so a diff works
  whether the model writes `src/foo.ts` or `a/src/foo.ts`, and a miscounted
  hunk header is recomputed rather than rejected. One attempt, no silent
  fallbacks, so the error the model sees is always the error git produced.
- `replaceInFile` requires `oldText` to match exactly once. Zero matches and
  multiple matches are separate, explicit errors, so a wrong guess fails loudly
  instead of rewriting the wrong site.
- Search skips `node_modules`, `.git`, `dist`, `build`, `.next`, `coverage`,
  and `.turbo`.
- Outputs are truncated before they enter the transcript.

## [shipped] Why `replaceInFile` exists

Measured against real repositories, the model produces a valid unified diff far
less often than it produces a valid single-line change. The failure mode is
specific: a hunk header that skips a line, a closing brace, or a blank line
between two context lines. That hunk is not a contiguous slice of the file, so
`git apply` rejects it and no combination of flags can rescue it. On a retry
the model commonly re-emits the same shape, or invents a replacement value.

`replaceInFile` removes the part the model gets wrong. It supplies no line
numbers and no hunk body, only text copied from a `readFile` result, and it
refuses anything that is not unique. The diff-based `editFile` is kept for the
case where one contiguous hunk really is the clearest option.

Measured result: on two throwaway repositories, `replaceInFile` took a
migration the diff tool could not complete from 0/2 files edited to 3/3.

## [shipped] Budgets

| Budget            | Limit |
| ----------------- | ----- |
| Iterations        | 15    |
| Commands         | 30    |
| Files changed    | 20    |

Hitting the file ceiling ends the run with `review_pr`. The loop never spends
past its budget, and every refusal is reported back to the model as a tool
result rather than swallowed.

## Usage

```ts
import { createGitHubPublisher, runMigrationAgent } from "@driftlock/agent";

const result = await runMigrationAgent({
    root: "/path/to/checked-out-repo",
    packet: {
        provider: "p5",
        fromVersion: "1.11",
        toVersion: "2.3",
        summary: "createCanvas renamed to createSurface",
        migrationDocs: ["https://example.test/p5-2.3"],
    },
    apiKey: process.env.OPENAI_API_KEY,
    publisher: createGitHubPublisher(process.env.GITHUB_TOKEN),
    target: { owner: "acme", repo: "widgets", base: "main" },
});

result.outcome;         // "auto_pr" | "review_pr" | "no_action"
result.filesChanged;    // ["src/client.ts"]
result.state.pullRequest; // { status, url, number, branch } when a PR exists
result.state.transcript;  // full tool conversation
```

Pass `client` to supply your own OpenAI-compatible client, `model` to override
the default `gpt-4o-mini`, and `publisher` plus `target` to actually open a pull
request. With no publisher, `createPullRequest` returns a preview and says so.

## Running against a non-OpenAI provider

Pass `baseURL` to point the loop at any OpenAI-compatible endpoint. Cloudflare
Workers AI is the one this repo ships credentials for:

```ts
const result = await runMigrationAgent({
    root,
    packet,
    apiKey: process.env.CLOUDFLARE_API_TOKEN,
    baseURL: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
    model: process.env.CLOUDFLARE_AI_MODEL,
});
```

Two wire-format details this proved the hard way, both worth knowing for any
compatible endpoint:

- An assistant message that carries `tool_calls` must send `content` as a
  **string**. OpenAI tolerates `null`; Cloudflare rejects the whole request with
  a 400. The agent sends `""`.
- Cloudflare's native `/ai/run/{model}` endpoint has no tool calling at all. Only
  the OpenAI-compatible `/ai/v1` path works for this loop.

## Opening a pull request

`createPullRequest` goes through `@driftlock/git`, so the commit is a pure delta
on the base branch: blobs, then a tree on top of `base_tree`, then a commit, a
ref, and the PR. No checkout, no push, no clone.

It is refused when any of these hold:

- The branch does not start with `driftlock/`. `PRWriter` force-updates whatever
  ref it is handed, so an unvalidated branch name would let the agent rewrite
  `main`. The prefix is enforced here, and traversal and shell characters are
  rejected.
- A verification command has not passed.
- No file changed, or the working tree is clean.
- The title is blank, or `root` is not a git repository.

`FixPRRunner` keeps one open PR per branch, so re-running the same migration
reports `already_open` rather than opening a second one. A merged PR reports
`merged`, which is the signal to rebaseline the snapshot.

## [shipped] Sandboxed command execution

`runCommand` defaults to `createSandboxCommandRunner()`, which runs the command
through `@driftlock/sandbox`:

- The repository is copied to a throwaway temp directory first, and the copy is
  what gets mounted. The real checkout is never passed to Docker, so a build
  script cannot write to it, and `.git` is not copied either.
- The copy is mounted writable (`readOnly: false`), so `tsc` and bundlers can
  emit. The original `node_modules` is bind-mounted read-only when present, so a
  full dependency tree does not have to be copied.
- The network is off (`NetworkMode: none`) and no endpoints are allowlisted.
- The container env is exactly `CI=1`. The host environment is never forwarded.
- The command is passed as argv, never as a shell string, after the whitelist
  check.
- Defaults: `node:22-alpine`, 5 minute timeout, 2 GB, 2 CPUs.
- The temp copy is removed in a `finally`, so a timeout or a Docker error does
  not leak it.

Pass `commandRunner` to `runMigrationAgent` to substitute your own seam, for
example a local `CommandRunner` that skips Docker entirely.

## [planned] Not done yet

- The agent does not create the temporary branch yet. It assumes one exists.
- No confidence signal beyond pass/fail. A richer verdict would feed the
  `auto_pr` threshold rather than hardcode "tests passed".
- The loop has only been proven against Cloudflare Workers AI
  (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`). A representative run against two
  throwaway repositories is recorded in [Real repository runs](#real-repository-runs);
  a wider model sweep is not done.
- The sandbox uses `SandboxRunner`'s proxy allowlist model, but the agent always
  disables the network. A migration that must reach a registry mid-run is not
  supported yet.
- After a failed edit the model sometimes moves on to verification instead of
  fixing the edit. The prompt tells it to retry; nothing enforces it.

## Real repository runs

Two throwaway repositories, real model, real Docker, no fixtures. Both were
clean on `main` before the run. Drive them with:

```bash
bun --env-file=.env run run-real-migration.ts stripe ../some-repo
bun --env-file=.env run run-real-migration.ts p5 ../some-repo
```

Results, `@cf/meta/llama-3.3-70b-instruct-fp8-fast`:

| Packet | Repo | Edits | Verification | PR |
| ------ | ---- | ----- | ------------ | -- |
| stripe `source` to `payment_method` | two small files | 2/2 files, 3/4 sites | impossible | refused |
| p5 1.x to 2.x keyboard input | one sketch | 1/1 file, 1/2 sites | impossible | refused |

Both runs ended `review_pr` with no pull request, and both refusals were
correct. The two repos have no `node_modules` and the sandbox has no network, so
`npm run build` exits 127 and the verification gate can never be satisfied. The
gate refusing to publish is the designed behaviour, not a defect.

The interesting part is what the gate caught. The p5 edit was syntactically
plausible and semantically wrong: the model wrote

```js
if (p.keyIsDown(UP_ARROW)) {
```

inside an instance-mode sketch where every other line uses the `p.` prefix. In
instance mode constants are only reachable through the instance, so that throws
`ReferenceError: UP_ARROW is not defined` on the first frame. Nothing but
running the code would have caught it, and the PR gate is what kept it from
being published. Two further defects showed up here:

- The model migrated `p.keyCode === 38` but left `p.key === " "` alone, so the
  migration is incomplete without the diff showing it as such.
- On stripe it edited the first of two `paymentIntent.source` sites, then moved
  on. The remaining site is visible in `git diff`, but nothing told the model.

Read together: the tool boundary is solid, and the model's API knowledge and
completeness are the weak links. The verification gate is currently the only
thing standing between a wrong migration and a merged one.

## Tests

```bash
bun test --cwd packages/tests unit/agent/
bun test --cwd packages/tests integration/agent/
```

`unit/agent` covers path guards, patch validation, command whitelist rejection,
the full inspect to PR walk against a real temp git repo, and each outcome
branch.

`integration/agent/sandboxIsolation.test.ts` is the one that proves the
isolation claims. It needs a running Docker daemon and it skips itself with a
loud failing prerequisite test when there is not one. It asserts against a real
`node:22-alpine` container that a build cannot write to the real checkout, cannot
resolve DNS, cannot see `.git`, and cannot read `OPENAI_API_KEY` out of the host
environment.

`integration/agent/liveModel.test.ts` runs the whole loop against a real model
and is skipped unless Cloudflare credentials are present. It needs the env file
loaded explicitly, because the test runs from `packages/tests`:

```bash
bun test --env-file=../../.env integration/agent/liveModel.test.ts
```

It asserts the wire contract rather than the migration succeeding: every
`tool_call` must get a matching `tool` result, every message must carry a string
`content`, and the outcome must be one of the three. A representative run
against `@cf/meta/llama-3.3-70b-instruct-fp8-fast`:

```
outcome: auto_pr
iterations: 7 / 15
tool calls: inspectRepo -> searchCode -> readFile -> editFile -> runCommand -> runCommand -> createPullRequest
files changed: src/client.ts
verification passed: true
```

The PR publisher is a stub in that test, so no real pull request is opened.


