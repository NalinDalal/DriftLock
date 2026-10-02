import OpenAI from "openai";
import { readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join } from "node:path";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { isToolAllowed, isToolName, toOpenAITools, toolsForTier, validateToolArgs, type AgentTier, type ToolName } from "./tools";
import { buildSystemPrompt } from "./prompt";
import {
    createAnthropicModelClient,
    type ModelClient,
    type ModelProvider,
    type ModelTurn,
} from "./modelClient";
import {
    assessConfidence,
    buildReceipt,
    canChangeMoreFiles,
    canRunMoreCommands,
    createInitialState,
    decideOutcome,
    describeNextStep,
    limits,
    noteEditFailure,
    noteEditSuccess,
    pendingEditRefusal,
    recordFileChanged,
    recordSearch,
    stageOf,
    type AgentState,
    type ChangePacket,
    type MigrationStage,
    type Outcome,
    type RunReceipt,
    type ToolCall,
    type TranscriptEntry,
    trimTranscript,
} from "./state";
import {
    collectDiffStat,
    editFile,
    hasUncommittedChanges,
    inspectRepo,
    isAllowedCommand,
    isGitRepository,
    readFile,
    replaceInFile,
    resolveInsideRoot,
    runCommand,
    searchCode,
    type ToolResult,
} from "./executor";
import {
    commitMessageFor,
    isAllowedBranch,
    readChangedFiles,
    type PullRequestPublisher,
    type PullRequestTarget,
} from "./publisher";
import type { CommandRunner } from "./commandRunner";
import {
    lookupVendorSymbol,
    verifyVendorSymbols,
    type SymbolFinding,
    type VendorContract,
} from "./vendorContract";
import type { VendorConfig } from "@driftlock/core";
import { fingerprintRepo, type RepoFacts } from "./repoFacts";

/**
 * Reads the changed files off disk and runs the contract check over them.
 *
 * Changed files get the full check, because that is where the agent introduced
 * something and it has to answer for it.
 */
async function checkChangedFiles(
    root: string,
    files: string[],
    contract: VendorContract,
    vendor: VendorConfig,
): Promise<SymbolFinding[]> {
    const sources = new Map<string, string>();
    for (const file of files) {
        const absolute = resolveInsideRoot(root, file);
        if (!absolute) continue;
        const handle = Bun.file(absolute);
        if (await handle.exists()) sources.set(file, await handle.text());
    }
    if (sources.size === 0) return [];
    return verifyVendorSymbols(contract, sources, { vendor });
}

const CONTRACT_SCAN_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const CONTRACT_SKIP_DIRS = new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    "coverage",
    ".turbo",
]);
const MAX_CONTRACT_FILES = 500;

/**
 * Sweeps the whole repository for reads of fields the vendor removed.
 *
 * This is the completeness half of the check, and it deliberately reaches past
 * the files the agent touched. The failure it exists for is a migration that
 * edits two of three call sites: the diff looks finished, the tests pass, and
 * the third file is never opened. A stale read is a missed call site wherever
 * it is, so untouched files are scanned too.
 *
 * Only `stale` is reported from these files. Pre-existing use of some other
 * field is not this migration's problem, and reporting it would bury the one
 * finding that matters.
 */
async function sweepStaleReferences(
    root: string,
    changed: Set<string>,
    contract: VendorContract,
    vendor: VendorConfig,
): Promise<SymbolFinding[]> {
    if (contract.removed.length === 0) return [];

    const sources = new Map<string, string>();
    const queue: string[] = [root];
    let seen = 0;

    while (queue.length > 0 && seen < MAX_CONTRACT_FILES) {
        const dir = queue.pop();
        if (!dir) break;
        let entries: Dirent[];
        try {
            entries = await readdir(dir, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            if (entry.name.startsWith(".") && entry.name !== ".env") continue;
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!CONTRACT_SKIP_DIRS.has(entry.name)) queue.push(full);
                continue;
            }
            if (!CONTRACT_SCAN_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
            if (changed.has(full.slice(root.length + 1))) continue;
            if (seen >= MAX_CONTRACT_FILES) break;
            seen += 1;
            try {
                sources.set(full.slice(root.length + 1), await Bun.file(full).text());
            } catch {
                continue;
            }
        }
    }

    if (sources.size === 0) return [];
    return verifyVendorSymbols(contract, sources, { vendor, reportOnlyStale: true });
}

export type RunOptions = {
    root: string;
    packet: ChangePacket;
    apiKey?: string;
    model?: string;
    /** Subscription tier. Defaults to pro so existing callers keep full tools. */
    tier?: AgentTier;
    /**
     * Model provider. Defaults to OpenAI wire protocol; pass "anthropic"
     * (with `anthropicApiKey` or `ANTHROPIC_API_KEY`) to run the same loop
     * against Anthropic's messages API with tool_use blocks.
     */
    provider?: ModelProvider;
    /** Full override for the model call. Wins over `client` and `provider`. */
    modelClient?: ModelClient;
    anthropicApiKey?: string;
    anthropicBaseURL?: string;
    anthropicFetchFn?: typeof fetch;
    baseURL?: string;
    client?: OpenAI;
    publisher?: PullRequestPublisher;
    target?: PullRequestTarget;
    commandRunner?: CommandRunner;
    /**
     * Allow model-requested commands to run directly on the host. Defaults to
     * false: without a `commandRunner` (e.g. `createSandboxCommandRunner()`),
     * `runCommand` is refused so untrusted repository scripts can never execute
     * outside isolation. Set true only for an operator's own machine.
     */
    allowHostExecution?: boolean;
    /**
     * Ground truth about the vendor's API surface. When present it is injected
     * into the opening message and enforced before any pull request is opened.
     */
    contract?: VendorContract;
    vendor?: VendorConfig;
    /**
     * Overrides the repository fingerprint. Normally this is read from disk
     * before the loop starts, because the model cannot be trusted to go looking
     * for it, but a caller that already knows the facts can supply them.
     */
    repoFacts?: RepoFacts;
    /**
     * Model-call resilience (timeouts and transient failures are the common
     * way a long run dies). Defaults: 120s timeout, 2 retries, 1s base delay.
     */
    modelTimeoutMs?: number;
    modelMaxRetries?: number;
    modelRetryBaseMs?: number;
    /**
     * Human-in-the-loop for high-stakes tools. Before a tool in
     * `toolsRequiringApproval` runs, `approveTool` is consulted; a rejection
     * (or a throwing hook — fail-closed) returns a FAILED tool result the
     * model can react to instead of executing. Defaults to approving.
     */
    approveTool?: (call: { name: ToolName; args: Record<string, unknown> }) =>
        | Promise<"approve" | "reject">
        | "approve"
        | "reject";
    toolsRequiringApproval?: ToolName[];
    /** Progress observer; see `AgentEvent`. Never affects the run. */
    onEvent?: (event: AgentEvent) => void;
    /** Transcript budget in serialized characters before old tool results are
     * compacted. Defaults to 120000. */
    transcriptBudgetChars?: number;
};

export type RunResult = {
    outcome: Outcome;
    state: AgentState;
    filesChanged: string[];
    /** Structured audit line for this run: what changed, what proved it. */
    receipt: RunReceipt;
};

/**
 * Run observer (SDK event sinks, without the SDK). Fires on iteration start,
 * every tool result, every model retry, and completion. Observer errors are
 * swallowed: a sink failure must never change what the run does.
 */
export type AgentEvent =
    | { type: "iteration"; iteration: number; stage: MigrationStage }
    | { type: "tool"; name: ToolName; ok: boolean; iteration: number }
    | { type: "model_retry"; attempt: number; error: string }
    | { type: "done"; outcome: Outcome; iterations: number };

/** Tools that pause for operator approval. Publishing is the irreversible
 * external side effect in this loop, so it is the only default. */
export const DEFAULT_APPROVAL_TOOLS: ToolName[] = ["createPullRequest"];

type RunnerDeps = {
    create: OpenAI["chat"]["completions"]["create"];
};

/**
 * Which model-call failures are worth retrying. Rate limits, overloaded
 * servers, timeouts, and dropped connections are transient; anything else
 * (auth, bad request, bad key) will fail identically on retry.
 */
export function isRetryableModelError(error: unknown): boolean {
    if (error instanceof DOMException && error.name === "AbortError") return true;
    const status = (error as { status?: unknown } | null)?.status;
    if (typeof status === "number") return status === 429 || status >= 500;
    if (error instanceof TypeError) return true;
    return false;
}

function modelErrorMessage(error: unknown): string {
    if (error instanceof DOMException && error.name === "AbortError") {
        return "model request timed out";
    }
    return error instanceof Error ? error.message : String(error);
}

async function createWithRetry<T>(
    run: (signal: AbortSignal) => Promise<T>,
    options: {
        timeoutMs: number;
        maxRetries: number;
        baseDelayMs: number;
        onRetry?: (attempt: number, error: unknown) => void;
    },
): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), options.timeoutMs);
        try {
            const response = await run(controller.signal);
            clearTimeout(timer);
            return response;
        } catch (error) {
            clearTimeout(timer);
            if (attempt >= options.maxRetries || !isRetryableModelError(error)) {
                throw error;
            }
            options.onRetry?.(attempt + 1, error);
            const delay = Math.min(options.baseDelayMs * 2 ** attempt, 10_000);
            await Bun.sleep(delay * (0.5 + Math.random() * 0.5));
        }
    }
}

function toWireMessages(
    transcript: TranscriptEntry[],
): ChatCompletionMessageParam[] {
    const messages: ChatCompletionMessageParam[] = [];
    for (const entry of transcript) {
        if (entry.role === "tool") {
            if (entry.toolCallId) {
                messages.push({
                    role: "tool",
                    tool_call_id: entry.toolCallId,
                    content: entry.content,
                });
            }
            continue;
        }
        if (entry.role === "assistant" && entry.toolCalls?.length) {
            messages.push({
                role: "assistant",
                content: entry.content || "",
                tool_calls: entry.toolCalls.map((call) => ({
                    id: call.id,
                    type: "function" as const,
                    function: { name: call.name, arguments: JSON.stringify(call.args) },
                })),
            });
            continue;
        }
        messages.push({ role: entry.role, content: entry.content });
    }
    return messages;
}

function parseToolCalls(raw: unknown): ToolCall[] {
    if (!Array.isArray(raw)) return [];
    const calls: ToolCall[] = [];
    for (const item of raw) {
        const call = item as {
            id?: unknown;
            function?: { name?: unknown; arguments?: unknown };
        };
        if (typeof call.id !== "string") continue;
        if (typeof call.function?.name !== "string") continue;
        if (!isToolName(call.function.name)) continue;
        let args: Record<string, unknown> = {};
        if (typeof call.function.arguments === "string" && call.function.arguments.trim()) {
            try {
                const parsed = JSON.parse(call.function.arguments) as unknown;
                if (parsed && typeof parsed === "object") {
                    args = parsed as Record<string, unknown>;
                }
            } catch {
                args = {};
            }
        }
        calls.push({ id: call.id, name: call.function.name, args });
    }
    return calls;
}

function readString(args: Record<string, unknown>, key: string): string {
    const value = args[key];
    return typeof value === "string" ? value : "";
}

async function execute(
    name: ToolCall["name"],
    args: Record<string, unknown>,
    options: RunOptions,
    state: AgentState,
): Promise<ToolResult> {
    const tier: AgentTier = options.tier ?? "pro";
    // Tier gate enforced here, not just in the prompt: a free run that asks
    // for createPullRequest gets a FAILED result it can react to, not a PR.
    if (!isToolAllowed(name, tier)) {
        return {
            ok: false,
            output: `${name} is disabled on the ${tier} plan. Summarise the change for review instead.`,
        };
    }
    // Schema check before the executor: a call missing a required arg gets
    // a precise retry directive instead of a confusing tool failure.
    const argError = validateToolArgs(name, args);
    if (argError) {
        return { ok: false, output: argError };
    }
    const root = options.root;
    // Human-in-the-loop: high-stakes tools pause for approval first. A denial
    // (or a throwing hook — fail-closed) is an ordinary FAILED result the
    // model can react to, not a halt.
    if ((options.toolsRequiringApproval ?? DEFAULT_APPROVAL_TOOLS).includes(name)) {
        let decision: "approve" | "reject" = "approve";
        try {
            decision = (await options.approveTool?.({ name, args })) ?? "approve";
        } catch (error) {
            return {
                ok: false,
                output: `Approval hook failed for ${name}: ${error instanceof Error ? error.message : String(error)}. Denied by default; fix the hook or call again.`,
            };
        }
        if (decision !== "approve") {
            return {
                ok: false,
                output: `Operator denied ${name}. Explain what you wanted and ask what to change, or proceed without it.`,
            };
        }
    }
    switch (name) {
        case "inspectRepo":
            return inspectRepo(root);
        case "searchCode": {
            const result = await searchCode(
                root,
                readString(args, "query"),
                readString(args, "path") || undefined,
            );
            if (result.ok) recordSearch(state, readString(args, "query"));
            return result;
        }
        case "readFile":
            return readFile(root, readString(args, "path"));
        case "editFile": {
            if (!canChangeMoreFiles(state)) {
                return {
                    ok: false,
                    output: `Refusing edit: MAX_FILES_CHANGED (${state.maxFilesChanged}) reached`,
                };
            }
            const path = readString(args, "path");
            const result = await editFile(root, path, readString(args, "patch"));
            if (result.ok) {
                recordFileChanged(state, path);
                noteEditSuccess(state, path);
                // A passing verification no longer describes the tree once it is edited.
                state.lastTestResult = undefined;
            } else {
                noteEditFailure(state, path);
            }
            return result;
        }
        case "replaceInFile": {
            if (!canChangeMoreFiles(state)) {
                return {
                    ok: false,
                    output: `Refusing edit: MAX_FILES_CHANGED (${state.maxFilesChanged}) reached`,
                };
            }
            const path = readString(args, "path");
            const result = await replaceInFile(
                root,
                path,
                readString(args, "oldText"),
                readString(args, "newText"),
            );
            if (result.ok) {
                recordFileChanged(state, path);
                noteEditSuccess(state, path);
                // A passing verification no longer describes the tree once it is edited.
                state.lastTestResult = undefined;
            } else {
                noteEditFailure(state, path);
            }
            return result;
        }
        case "lookupVendorSymbol": {
            const contract = options.contract;
            if (!contract) {
                return {
                    ok: false,
                    output:
                        "No vendor contract gates this run, so there is nothing authoritative to resolve against. Re-read the change packet and search the repository instead of guessing a name.",
                };
            }
            const symbol = readString(args, "symbol");
            if (!symbol.trim()) {
                return { ok: false, output: "lookupVendorSymbol requires a non-empty symbol" };
            }
            const found = lookupVendorSymbol(contract, symbol);
            const lines = [
                `${found.status.toUpperCase()}: ${found.detail}`,
            ];
            if (found.suggestions.length > 0) {
                lines.push(`Candidates from the contract: ${found.suggestions.join(", ")}.`);
            }
            if (found.status !== "exists") {
                lines.push("Do not guess a name that is not in this list.");
            }
            return { ok: true, output: lines.join("\n") };
        }
        case "readContract": {
            const contract = options.contract;
            if (!contract) {
                return {
                    ok: false,
                    output:
                        "No vendor contract gates this run, so there is nothing to re-read. Re-read the change packet and search the repository instead.",
                };
            }
            const prefix = readString(args, "prefix").trim();
            const rawLimit = args["limit"];
            const parsedLimit =
                typeof rawLimit === "number"
                    ? rawLimit
                    : Number.parseInt(readString(args, "limit"), 10);
            const limit = Number.isNaN(parsedLimit) ? 50 : Math.min(Math.max(parsedLimit, 1), 200);
            const matched = contract.members.filter((member) =>
                prefix ? member === prefix || member.startsWith(`${prefix}.`) || member.startsWith(prefix) : true,
            );
            const shown = matched.slice(0, limit);
            const lines = [
                `${contract.provider} contract from ${contract.origin}: ${matched.length} member(s)${prefix ? ` starting with "${prefix}"` : ""}.`,
                ...shown.map((member) => `- ${member}`),
            ];
            if (matched.length > shown.length) {
                lines.push(`...and ${matched.length - shown.length} more. Narrow with prefix or raise limit.`);
            }
            if (contract.removed.length > 0) {
                lines.push(`Removed by the vendor: ${contract.removed.join(", ")}.`);
            }
            return { ok: true, output: lines.join("\n") };
        }
        case "checkCompleteness":
            return checkCompleteness(root, options, state);
        case "runCommand": {
            if (state.pendingEditRetry) {
                return { ok: false, output: pendingEditRefusal(state) };
            }
            if (!canRunMoreCommands(state)) {
                return {
                    ok: false,
                    output: `Refusing command: MAX_COMMANDS (${state.maxCommands}) reached`,
                };
            }
            state.commandsRun += 1;
            const command = readString(args, "command");
            // Allowlist enforced here, not in each runner: a custom
            // CommandRunner is a test seam or an isolation boundary, never a
            // policy decision. Untrusted model output stops at this line no
            // matter which runner is plugged in.
            if (!isAllowedCommand(command)) {
                const refused = {
                    ok: false,
                    output: `Command not allowed: ${command.trim()}. The harness only runs verification commands from the repository facts, copied exactly, with no shell operators.`,
                };
                state.lastTestResult = { passed: false, output: refused.output };
                return refused;
            }
            if (!options.commandRunner && options.allowHostExecution !== true) {
                const refused = {
                    ok: false,
                    output:
                        "Refusing command: no commandRunner was supplied, and host execution is disabled. Pass commandRunner: createSandboxCommandRunner() (Docker isolation), or set allowHostExecution: true only on an operator's own machine.",
                };
                state.lastTestResult = { passed: false, output: refused.output };
                return refused;
            }
            const result = options.commandRunner
                ? await options.commandRunner.run(root, command)
                : await runCommand(root, command);
            state.lastTestResult = { passed: result.ok, output: result.output };
            if (!result.ok) return result;
            // Verification passed, but a green build on 2 of 3 call sites is
            // the exact failure the real runs showed. Warn inline while the
            // model can still act, rather than saving the news for the PR gate.
            const warning = await staleWarning(root, options, state);
            if (warning) {
                return { ok: true, output: `${result.output}\n\n${warning}` };
            }
            return result;
        }
        case "createPullRequest":
            if (state.pendingEditRetry) {
                return { ok: false, output: pendingEditRefusal(state) };
            }
            return openPullRequest(
                args,
                options.packet,
                options.publisher,
                options.target,
                state,
                root,
                options.contract,
                options.vendor,
            );
        default:
            return { ok: false, output: `Unknown tool: ${String(name)}` };
    }
}

/**
 * On-demand completeness sweep, and the shared body behind the inline
 * warning appended to a passing verification.
 *
 * Changed files get the full check; untouched files are swept for stale
 * reads of removed fields. Findings are stored on state so the outcome and
 * the receipt reflect them even when the model never calls createPullRequest.
 */
async function checkCompleteness(
    root: string,
    options: RunOptions,
    state: AgentState,
): Promise<ToolResult> {
    const contract = options.contract;
    const vendor = options.vendor;
    if (!contract || !vendor) {
        const searched = state.searchedQueries.length > 0 ? state.searchedQueries.join(", ") : "(none yet)";
        const changed = state.filesChanged.length > 0 ? state.filesChanged.join(", ") : "(none yet)";
        return {
            ok: true,
            output: [
                "No vendor contract gates this run, so completeness cannot be checked against the vendor.",
                `Searches issued: ${searched}. Files changed: ${changed}.`,
                "Search once per deprecated name in the change packet, read every hit, and say in your report which names you searched and what you found.",
            ].join("\n"),
        };
    }
    const findings = [
        ...(await checkChangedFiles(root, state.filesChanged, contract, vendor)),
        ...(await sweepStaleReferences(root, new Set(state.filesChanged), contract, vendor)),
    ];
    state.symbolFindings = findings;
    state.contractChecked = true;
    if (findings.length === 0) {
        return {
            ok: true,
            output: `Completeness clean: no stale reads of ${contract.removed.join(", ") || "(no removed fields)"} anywhere in the repository.`,
        };
    }
    return {
        ok: false,
        output: [
            `INCOMPLETE: ${findings.length} stale vendor symbol(s) remain. A green build does not excuse them.`,
            "",
            ...findings.map(
                (finding) =>
                    `- ${finding.file}:${finding.line} ${finding.kind}: ${finding.detail}\n    ${finding.text}`,
            ),
            "",
            "Fix every line above (lookupVendorSymbol names the real replacements), then run checkCompleteness again.",
        ].join("\n"),
    };
}

/** Warning text appended to a passing verification when stale reads remain. */
async function staleWarning(
    root: string,
    options: RunOptions,
    state: AgentState,
): Promise<string | null> {
    const contract = options.contract;
    const vendor = options.vendor;
    if (!contract || !vendor || state.filesChanged.length === 0) return null;
    if (contract.removed.length === 0) return null;
    const findings = [
        ...(await checkChangedFiles(root, state.filesChanged, contract, vendor)),
        ...(await sweepStaleReferences(root, new Set(state.filesChanged), contract, vendor)),
    ];
    if (findings.length === 0) return null;
    state.symbolFindings = findings;
    state.contractChecked = true;
    const { level, reasons } = assessConfidence(state);
    return [
        `COMPLETENESS WARNING (confidence: ${level}): verification passed, but ${findings.length} stale vendor symbol(s) remain elsewhere:`,
        ...findings.map(
            (finding) =>
                `- ${finding.file}:${finding.line} ${finding.kind}: ${finding.detail}`,
        ),
        `Why this matters: ${reasons.join("; ")}.`,
        "Call checkCompleteness for exact lines, fix them, then verify again. Do not open a PR yet.",
    ].join("\n");
}

async function openPullRequest(
    args: Record<string, unknown>,
    packet: ChangePacket,
    publisher: PullRequestPublisher | undefined,
    target: PullRequestTarget | undefined,
    state: AgentState,
    root: string,
    contract?: VendorContract,
    vendor?: VendorConfig,
): Promise<ToolResult> {
    const title = readString(args, "title").trim();
    const body = readString(args, "body").trim();
    const branch = readString(args, "branch").trim();

    if (!title) return { ok: false, output: "createPullRequest requires a title" };
    if (!isAllowedBranch(branch)) {
        return {
            ok: false,
            output: `Refusing branch "${branch}": must start with "driftlock/" and use only letters, digits, . _ - /`,
        };
    }
    if (state.filesChanged.length === 0) {
        return { ok: false, output: "Refusing to open a PR with no changed files" };
    }
    if (state.lastTestResult?.passed !== true) {
        return {
            ok: false,
            output:
                "Refusing to open a PR: no passing verification command. Run an allowed command and fix failures first.",
        };
    }

    if (contract && vendor) {
        const findings = [
            ...(await checkChangedFiles(root, state.filesChanged, contract, vendor)),
            ...(await sweepStaleReferences(
                root,
                new Set(state.filesChanged),
                contract,
                vendor,
            )),
        ];
        state.symbolFindings = findings;
        state.contractChecked = true;
        if (findings.length > 0) {
            return {
                ok: false,
                output: [
                    `Refusing to open a PR: ${findings.length} vendor symbol(s) do not match the ${contract.provider} contract captured from ${contract.source} (${contract.origin}). Changed files get a full check, and the rest of the repository is swept for fields this migration removed.`,
                    "",
                    ...findings.map(
                        (finding) =>
                            `- ${finding.file}:${finding.line} ${finding.kind}: ${finding.detail}\n    ${finding.text}`,
                    ),
                    "",
                    "Fix every line above, then call createPullRequest again. The contract is the authority; do not argue with it.",
                ].join("\n"),
            };
        }
    }

    if (!(await isGitRepository(root))) {
        return { ok: false, output: "The repository root is not a git repository" };
    }
    if (!(await hasUncommittedChanges(root))) {
        return { ok: false, output: "Refusing to open a PR: the working tree is clean" };
    }

    // The policy, enforced where the PR is opened rather than in the outcome
    // label: without a vendor contract nothing checked the edits against the
    // vendor's real API surface, so the run may only ever produce a draft.
    const draft = !contract || !vendor;

    if (!publisher || !target) {
        const stat = await collectDiffStat(root);
        const confidence = assessConfidence(state);
        return {
            ok: true,
            output: [
                `PREVIEW ONLY, no pull request was opened.`,
                `A publisher and target were not supplied to the agent.`,
                `Would open${draft ? " as a draft (no vendor contract)" : ""} on branch ${branch} against ${target?.base ?? "<base>"}`,
                `Title: ${title}`,
                `Body: ${body}`,
                `Diff stat: ${stat || "(no changes)"}`,
                `Confidence: ${confidence.level} (${confidence.reasons.join("; ")}).`,
            ].join("\n"),
        };
    }

    const files = await readChangedFiles(root, state.filesChanged);
    if (files.length === 0) {
        return { ok: false, output: "No changed files could be read from disk" };
    }

    let result: Awaited<ReturnType<PullRequestPublisher["publish"]>>;
    try {
        result = await publisher.publish({
            target,
            title,
            body,
            branch,
            files,
            commitMessage: commitMessageFor({
                provider: packet.provider,
                fromVersion: packet.fromVersion,
                toVersion: packet.toVersion,
            }),
            draft,
        });
    } catch (error) {
        return {
            ok: false,
            output: `Pull request could not be opened (${error instanceof Error ? error.message : String(error)}). Edits are kept locally; fix the cause and call createPullRequest again.`,
        };
    }

    state.pullRequest = result;
    const confidence = assessConfidence(state);
    return {
        ok: true,
        output: [
            `Pull request ${result.status}${draft ? " (draft)" : ""}: ${result.url}`,
            `Branch: ${result.branch}`,
            `Files published: ${files.length}`,
            `Confidence: ${confidence.level} (${confidence.reasons.join("; ")}).`,
        ].join("\n"),
    };
}

export async function runMigrationAgent(options: RunOptions): Promise<RunResult> {
    // Stage 0. Read what the repository is before the model gets a say, so that
    // the opening message contains the real scripts, the real package manager,
    // and the installed version of whatever is being migrated. An agent asked to
    // migrate a repository it has not looked at will guess, and a wrong guess
    // about a script name is indistinguishable from a real build failure.
    const facts = options.repoFacts ?? (await fingerprintRepo(options.root));
    const state = createInitialState(options.packet, options.contract, facts);
    const tier: AgentTier = options.tier ?? "pro";
    const systemPrompt = buildSystemPrompt(tier);
    // The contract gate needs both halves: the API surface and the config
    // that says which receivers it applies to. Anything less is ungated.
    state.hasContract = Boolean(options.contract && options.vendor);
    const model = options.model ?? "gpt-4o-mini";
    const modelResilience = {
        timeoutMs: options.modelTimeoutMs ?? 120_000,
        maxRetries: options.modelMaxRetries ?? 2,
        baseDelayMs: options.modelRetryBaseMs ?? 1000,
    };
    const budgetChars = options.transcriptBudgetChars ?? 120_000;
    // Provider resolution: an explicit ModelClient wins (tests, custom
    // runtimes), then the Anthropic messages API, then the OpenAI-compatible
    // client. All three produce the same transcript entries downstream.
    // The OpenAI client is built lazily so Anthropic runs never require
    // OPENAI_API_KEY to even be present.
    const turnClient: ModelClient | null =
        options.modelClient ??
        ((options.provider ?? "openai") === "anthropic"
            ? createAnthropicModelClient({
                  apiKey: options.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY ?? "",
                  ...(options.anthropicBaseURL ? { baseURL: options.anthropicBaseURL } : {}),
                  ...(options.anthropicFetchFn ? { fetchFn: options.anthropicFetchFn } : {}),
              })
            : null);
    const openAiCreate = (): RunnerDeps["create"] => {
        const client =
            options.client ??
            new OpenAI({
                apiKey: options.apiKey ?? process.env.OPENAI_API_KEY,
                ...(options.baseURL ? { baseURL: options.baseURL } : {}),
            });
        return client.chat.completions.create.bind(client.chat.completions);
    };
    // One client for the run, built only for the path taken: Anthropic runs
    // never touch the OpenAI constructor.
    const openAi = turnClient ? null : openAiCreate();
    // Observer errors must never change what the run does.
    const emit = (event: AgentEvent): void => {
        try {
            options.onEvent?.(event);
        } catch {
            // Sinks observe; they do not steer.
        }
    };
    let lastStage: MigrationStage | null = null;

    while (!state.done && state.iteration < state.maxIterations) {
        state.iteration++;

        // The opening message carries the grounding and the first instruction
        // only. Each time the work crosses into a new stage, the instruction for
        // that stage is appended, so the model is told what to do next at the
        // moment it becomes relevant rather than being handed the whole plan up
        // front and expected to remember the relevant part.
        const stage = stageOf(state);
        if (stage !== lastStage) {
            if (lastStage !== null) {
                state.transcript.push({
                    role: "user",
                    content: describeNextStep(stage, facts),
                });
            }
            lastStage = stage;
        }
        emit({ type: "iteration", iteration: state.iteration, stage });

        // A dead model endpoint must degrade to an outcome, never throw: the
        // edits on disk are real work worth reporting as review_pr.
        let content = "";
        let toolCalls: ToolCall[] = [];
        try {
            if (turnClient) {
                const turn: ModelTurn = await createWithRetry(
                    (signal) =>
                        turnClient.create({
                            model,
                            temperature: 0.1,
                            system: systemPrompt,
                            transcript: state.transcript,
                            tools: toolsForTier(tier),
                            signal,
                        }),
                    {
                        ...modelResilience,
                        onRetry: (attempt, error) =>
                            emit({ type: "model_retry", attempt, error: modelErrorMessage(error) }),
                    },
                );
                content = turn.content;
                toolCalls = turn.toolCalls;
            } else {
                const response = await createWithRetry(
                    (signal) =>
                        openAi!(
                            {
                                model,
                                temperature: 0.1,
                                messages: [
                                    { role: "system", content: systemPrompt },
                                    ...toWireMessages(state.transcript),
                                ],
                                tools: toOpenAITools(tier),
                                tool_choice: "auto",
                            },
                            { signal },
                        ) as Promise<
                            Extract<Awaited<ReturnType<RunnerDeps["create"]>>, { choices: unknown }>
                        >,
                    {
                        ...modelResilience,
                        onRetry: (attempt, error) =>
                            emit({ type: "model_retry", attempt, error: modelErrorMessage(error) }),
                    },
                );
                const message = response.choices[0]?.message;
                content = (message as { content?: unknown } | undefined)?.content as string ?? "";
                toolCalls = parseToolCalls(
                    (message as { tool_calls?: unknown } | undefined)?.tool_calls,
                );
            }
        } catch (error) {
            state.transcript.push({
                role: "assistant",
                content: `Model call failed (${modelErrorMessage(error)}). Stopping with what is on disk.`,
            });
            state.done = true;
            state.outcome = decideOutcome(state);
            break;
        }

        if (toolCalls.length === 0) {
            state.transcript.push({
                role: "assistant",
                content,
            });
            state.done = true;
            state.outcome = decideOutcome(state);
            break;
        }

        state.transcript.push({
            role: "assistant",
            content,
            toolCalls,
        });

        for (const call of toolCalls) {
            const result = await execute(call.name, call.args, options, state);
            if (!state.toolsUsed.includes(call.name)) state.toolsUsed.push(call.name);
            state.transcript.push({
                role: "tool",
                toolCallId: call.id,
                toolName: call.name,
                content: result.ok ? result.output : `FAILED: ${result.output}`,
            });
            emit({ type: "tool", name: call.name, ok: result.ok, iteration: state.iteration });
            if (call.name === "createPullRequest" && result.ok) state.done = true;
            // Failure threshold: that many tool failures in a row means the
            // strategy is stuck. Escalate to a human (review/draft) instead of
            // burning the remaining iterations proving it again.
            if (result.ok) {
                state.consecutiveFailures = 0;
            } else {
                state.consecutiveFailures += 1;
                if (state.consecutiveFailures >= limits.MAX_CONSECUTIVE_FAILURES) {
                    state.transcript.push({
                        role: "assistant",
                        content: `Stopping: ${state.consecutiveFailures} tool calls failed in a row. The failures above describe what to look at.`,
                    });
                    state.done = true;
                    state.outcome = decideOutcome(state);
                    break;
                }
            }
        }

        if (state.filesChanged.length >= limits.MAX_FILES_CHANGED) {
            state.done = true;
            state.outcome = "review_pr";
        }

        if (state.done && !state.outcome) {
            state.outcome = decideOutcome(state);
        }

        // Bound context growth before the next model call.
        trimTranscript(state, budgetChars);
    }

    if (!state.done) {
        state.done = true;
        state.outcome =
            state.iteration >= state.maxIterations && state.filesChanged.length > 0
                ? "review_pr"
                : decideOutcome(state);
    }

    const outcome = state.outcome ?? decideOutcome(state);
    emit({ type: "done", outcome, iterations: state.iteration });
    return {
        outcome,
        state,
        filesChanged: state.filesChanged,
        receipt: buildReceipt(state, options.packet, model, outcome),
    };
}
