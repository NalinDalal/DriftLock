import type OpenAI from "openai";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { VendorConfig } from "@driftlock/core";
import { createSandboxCommandRunner, type CommandRunner } from "./commandRunner";
import {
    runMigrationAgent,
    type AgentEvent,
    type RunResult,
} from "./migrationAgent";
import type { PullRequestPublisher, PullRequestTarget } from "./publisher";
import {
    changePacketFromDrift,
    type ObservedDrift,
    type VendorContract,
} from "./vendorContract";

export interface DriftMigrationInput {
    /** Local checkout the agent edits and verifies in. */
    repoPath: string;
    /** Observed drift in the vendor's own words on the wire. */
    drift: ObservedDrift;
    /** Hybrid contract: existence from the spec when fetchable, removal from
     * the observation. Always required; without a known vendor it is a
     * sampled contract and the run degrades to a draft. */
    contract: VendorContract;
    /** Vendor config when known. Without it there is no receiver config, so
     * the publish gate opens a draft for human review instead of a
     * mergeable PR. */
    vendor?: VendorConfig;
    publisher: PullRequestPublisher;
    target: PullRequestTarget;
    /** OpenAI-compatible client for the agent loop. */
    client: OpenAI;
    model?: string;
    /** Override for tests. Defaults to Docker isolation: production edits a
     * real customer checkout, so verification must never run on the host. */
    commandRunner?: CommandRunner;
    /** Progress observer, forwarded to the agent loop. */
    onEvent?: (event: AgentEvent) => void;
}

export interface DriftMigrationResult {
    status: "opened" | "already_open" | "merged" | "needs_review" | "no_action";
    url?: string;
    number?: number;
    branch?: string;
    filesChanged: string[];
    outcome: RunResult["outcome"];
    /** True when the opened PR is a draft (unmergeable until marked ready). */
    draft?: boolean;
}

/**
 * Graduated abstention: when the agent investigated and changed nothing,
 * a single statically-certain inbound rename still earns a DRAFT — never a
 * mergeable PR. Drafts cannot merge until a human marks them ready, so
 * "nothing merges without you" holds while silence stops being the default.
 *
 * Certainty bar (deliberately narrow — anything else stays no_action):
 * - inbound drift only (outbound request surface is never regex-touched),
 * - exactly one removed + one added field sharing a dotted parent,
 * - renames apply to dotted member reads (`obj.from`) only: bare tokens,
 *   object-literal keys (`from:`), and request arguments are left alone,
 * - the leaf name must not be a generic one (`id`, `name`, …) that a
 *   blind repo-wide rename is far more likely to touch wrongly than right.
 */

/** Leaf names too generic to rename blindly across a whole checkout. */
const GENERIC_LEAF_NAMES: ReadonlySet<string> = new Set([
    "id", "type", "name", "value", "data", "key", "status", "url",
    "method", "label", "title", "object", "item", "code", "state",
]);

/** Generated trees the fallback walk never rewrites. */
const SKIP_DIR_RE =
    /(^|[\\/])(node_modules|\.git|dist|build|out|coverage|\.next|\.turbo|\.cache|vendor)([\\/]|$)/;

/** Above this many changed files the blind rename is no longer small and
 *  certain — abstain and leave the decision to a full agent run. */
const MAX_DRAFT_FILES = 5;

function certainRename(drift: ObservedDrift): { from: string; to: string } | null {
    if (drift.direction === "outbound") return null;
    if (drift.removed.length !== 1 || drift.added.length !== 1) return null;
    const [fromPath] = drift.removed;
    const [toPath] = drift.added;
    if (!fromPath || !toPath) return null;
    const parent = (p: string): string => p.split(".").slice(0, -1).join(".");
    if (parent(fromPath) !== parent(toPath)) return null;
    const from = fromPath.split(".").pop() ?? "";
    const to = toPath.split(".").pop() ?? "";
    if (!from || !to || from === to) return null;
    if (GENERIC_LEAF_NAMES.has(from.toLowerCase())) return null;
    return { from, to };
}

function unverifiedBranch(drift: ObservedDrift): string {
    const sig = [...drift.removed, ...drift.added].sort().join("|");
    let hash = 0;
    for (let i = 0; i < sig.length; i++) {
        hash = (hash * 31 + sig.charCodeAt(i)) >>> 0;
    }
    const provider = drift.provider.replace(/[^A-Za-z0-9]+/g, "-").slice(0, 24);
    return `driftlock/unverified-${provider}-${hash.toString(16).padStart(8, "0")}`;
}

async function tryUnverifiedDraft(
    input: DriftMigrationInput,
    drift: ObservedDrift,
): Promise<DriftMigrationResult | null> {
    const rename = certainRename(drift);
    if (!rename) return null;

    const esc = rename.from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const changed: Array<{ path: string; content: string }> = [];
    let entries: string[];
    try {
        entries = readdirSync(input.repoPath, { recursive: true }).filter(
            (file): file is string =>
                typeof file === "string" &&
                /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file) &&
                !SKIP_DIR_RE.test(file),
        );
    } catch {
        return null;
    }
    // Collect the full edit set in memory first: nothing is written until
    // the whole set passes validation below, so a rejected set never
    // leaves the checkout partially modified.
    for (const file of entries) {
        const fullPath = join(input.repoPath, file);
        let content: string;
        try {
            content = readFileSync(fullPath, "utf8");
        } catch {
            continue;
        }
        // Fresh regex per file: /g test() is stateful.
        if (!new RegExp(`\\.${esc}(?![\\w])`).test(content)) continue;
        const fixed = content.replace(
            new RegExp(`\\.${esc}(?![\\w])`, "g"),
            `.${rename.to}`,
        );
        if (fixed === content) continue;
        changed.push({ path: file, content: fixed });
    }
    if (changed.length === 0) return null;
    if (changed.length > MAX_DRAFT_FILES) {
        console.warn(
            `[DRAFT] rename ${rename.from}→${rename.to} would touch ${changed.length} files (cap ${MAX_DRAFT_FILES}); abstaining`,
        );
        return null;
    }
    for (const edit of changed) {
        try {
            writeFileSync(join(input.repoPath, edit.path), edit.content);
        } catch {
            // The publisher commits from the in-memory content, so a failed
            // local write must not abort the draft.
        }
    }

    const paths = changed.map((f) => f.path);
    const branch = unverifiedBranch(drift);
    const body = [
        "## UNVERIFIED DRAFT — review every line before marking ready",
        "",
        "DriftLock's agent investigated this drift but could not verify a fix (no runnable checks passed in this run), so it abstained rather than guessing. This draft applies the single statically-certain change below and nothing else. It cannot merge until you mark it ready.",
        "",
        "### Certain change",
        `- Rename \`.${rename.from}\` → \`.${rename.to}\` in dotted member reads (e.g. \`paymentIntent.${rename.from}\`).`,
        "- Only dotted reads were touched. Bare tokens, object-literal keys, and request arguments were deliberately left alone. Matches inside comments or string literals are possible — check the diff.",
        "",
        "### Drift",
        `- Removed: ${drift.removed.join(", ")}`,
        `- Added: ${drift.added.join(", ")}`,
        "",
        "### Not covered",
        "- Anything beyond the rename above. If the diff shows more, reject this PR.",
    ].join("\n");

    const res = await input.publisher.publish({
        target: input.target,
        title: `driftlock: Rename ${rename.from} to ${rename.to} (unverified draft)`,
        body,
        branch,
        files: changed,
        commitMessage: `driftlock: rename ${rename.from} to ${rename.to} (unverified draft)`,
        draft: true,
    });
    if (res.status === "already_open") {
        return {
            status: "already_open",
            branch: res.branch,
            filesChanged: paths,
            outcome: "draft_pr",
            draft: true,
        };
    }
    return {
        status: "opened",
        url: res.url,
        number: res.number,
        branch: res.branch,
        filesChanged: paths,
        outcome: "draft_pr",
        draft: true,
    };
}
/**
 * The single agent-layer entrypoint every drift trigger uses.
 *
 * Webhook alerts and pipeline drifts differ only in evidence mapping (flat
 * schemas vs captured shapes); the loop — packet → locate → read → edit →
 * verify → contract gate → publish — is identical. Triggers build an
 * `ObservedDrift` and a contract and call this; nothing outside this package
 * invokes `runMigrationAgent` for drift work.
 */
export async function runDriftMigration(
    input: DriftMigrationInput,
): Promise<DriftMigrationResult> {
    const packet = changePacketFromDrift(input.drift);

    const result = await runMigrationAgent({
        root: input.repoPath,
        packet,
        contract: input.contract,
        ...(input.vendor ? { vendor: input.vendor } : {}),
        commandRunner: input.commandRunner ?? createSandboxCommandRunner(),
        publisher: input.publisher,
        target: input.target,
        client: input.client,
        ...(input.model ? { model: input.model } : {}),
        ...(input.onEvent ? { onEvent: input.onEvent } : {}),
    });

    const pr = result.state.pullRequest;
    if (pr) {
        return {
            status: pr.status,
            url: pr.url,
            number: pr.number,
            branch: pr.branch,
            filesChanged: result.filesChanged,
            outcome: result.outcome,
        };
    }
    if (result.filesChanged.length > 0) {
        return {
            status: "needs_review",
            branch: undefined,
            filesChanged: result.filesChanged,
            outcome: result.outcome,
        };
    }
    // Graduated abstention: the agent investigated and changed nothing.
    // When the drift is a single same-parent rename, a dotted-readers-only
    // draft is strictly more useful than silence — and a draft cannot merge
    // until a human marks it ready, so "nothing merges without you" holds.
    // Anything uncertain (multi-field drift, outbound surface, no readers)
    // stays no_action below.
    if (result.outcome === "no_action") {
        const fallback = await tryUnverifiedDraft(input, input.drift);
        if (fallback) return fallback;
    }
    return {
        status: "no_action",
        branch: undefined,
        filesChanged: result.filesChanged,
        outcome: result.outcome,
    };
}
