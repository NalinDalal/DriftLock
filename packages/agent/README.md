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

- `tools.ts`: the six tools the model can call, with their JSON schemas.
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
- The environment handed to a command is an allowlist. Anything matching
  `KEY`, `TOKEN`, `SECRET`, `PASSWORD`, `CREDENTIAL`, `PRIVATE`, `SESSION`,
  `COOKIE`, or `AUTH` is dropped, so a customer build script cannot read
  `OPENAI_API_KEY` or `GITHUB_TOKEN` out of the DriftLock process.
- `editFile` reads the `+++` headers out of the patch and refuses any patch
  that targets a different file, a protected path, or a path outside the root.
  A declared path the patch does not honour is a refusal, not a silent retarget.
- Search skips `node_modules`, `.git`, `dist`, `build`, `.next`, `coverage`,
  and `.turbo`.
- Outputs are truncated before they enter the transcript.

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

## [planned] Not done yet

- Commands run directly in the working tree. Sandboxed execution through
  `@driftlock/sandbox` is not wired in, so a customer build script still runs
  with the developer's own privileges and network access.
- The agent does not create the temporary branch yet. It assumes one exists.
- No confidence signal beyond pass/fail. A richer verdict would feed the
  `auto_pr` threshold rather than hardcode "tests passed".
- The loop has never run against the live OpenAI API. Tests inject a fake
  client, so the wire format is type-checked but not proven.

## Tests

```bash
bun test --cwd packages/tests unit/agent/
```

Covers path guards, patch validation, command whitelist rejection, the full
inspect to PR walk against a real temp git repo, and each outcome branch.
