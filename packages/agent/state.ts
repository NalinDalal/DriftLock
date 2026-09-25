import { describeContract, type SymbolFinding, type VendorContract } from "./vendorContract";
import { describeRepoFacts, type RepoFacts } from "./repoFacts";

export type ChangePacket = {
    provider: string;
    fromVersion: string;
    toVersion: string;
    summary: string;
    migrationDocs: string[];
};

export type Outcome = "auto_pr" | "review_pr" | "no_action";

export type ToolCall = {
    id: string;
    name: string;
    args: Record<string, unknown>;
};

export type TranscriptEntry = {
    role: "user" | "assistant" | "tool";
    content: string;
    toolCallId?: string;
    toolName?: string;
    toolCalls?: ToolCall[];
};

export type AgentState = {
    iteration: number;
    maxIterations: number;
    maxCommands: number;
    commandsRun: number;
    maxFilesChanged: number;
    filesChanged: string[];
    transcript: TranscriptEntry[];
    lastTestResult?: { passed: boolean; output: string };
    /** Vendor symbols the edits introduced that the contract could not resolve. */
    symbolFindings?: SymbolFinding[];
    contractChecked?: boolean;
    pullRequest?: {
        status: "opened" | "already_open" | "merged";
        url: string;
        number: number;
        branch: string;
    };
    done: boolean;
    outcome: Outcome | null;
};

export const limits = {
    MAX_ITERATIONS: 15,
    MAX_COMMANDS: 30,
    MAX_FILES_CHANGED: 20,
};

export function createInitialState(
    packet: ChangePacket,
    contract?: VendorContract,
    facts?: RepoFacts,
): AgentState {
    const opening = ["ChangePacket:", JSON.stringify(packet, null, 2)];

    if (facts) {
        opening.push(
            "",
            "What this repository actually is, read from its own files before you were asked",
            "to change anything. Trust this over any assumption you would otherwise make.",
            "",
            describeRepoFacts(facts),
        );
    }

    if (contract) {
        opening.push(
            "",
            "The vendor's current API surface, captured from a real source. This is the",
            "authority on what exists. Do not reference a member that is not in this list,",
            "and do not guess at a replacement name.",
            "",
            describeContract(contract),
        );
    }

    opening.push(
        "",
        facts
            ? "Migrate this repository. Search for call sites rather than assuming where they are, make the smallest correct change, then verify with the exact commands listed above."
            : "Migrate this repository. Inspect before editing, make the smallest correct change, then verify with the whitelisted commands.",
    );

    return {
        iteration: 0,
        maxIterations: limits.MAX_ITERATIONS,
        maxCommands: limits.MAX_COMMANDS,
        commandsRun: 0,
        maxFilesChanged: limits.MAX_FILES_CHANGED,
        filesChanged: [],
        transcript: [{ role: "user", content: opening.join("\n") }],
        done: false,
        outcome: null,
    };
}

export function recordFileChanged(state: AgentState, path: string): void {
    if (!state.filesChanged.includes(path)) state.filesChanged.push(path);
}

export function canChangeMoreFiles(state: AgentState): boolean {
    return state.filesChanged.length < state.maxFilesChanged;
}

export function canRunMoreCommands(state: AgentState): boolean {
    return state.commandsRun < state.maxCommands;
}

/**
 * A passing test suite is not sufficient on its own. If the contract check found
 * symbols it could not resolve, the migration is unverified no matter what the
 * build says, so it can never reach `auto_pr`.
 */
export function decideOutcome(state: AgentState): Outcome {
    const contractClean = !state.symbolFindings || state.symbolFindings.length === 0;
    if (state.lastTestResult?.passed && state.filesChanged.length > 0 && contractClean) {
        return "auto_pr";
    }
    if (state.filesChanged.length > 0 || state.lastTestResult) return "review_pr";
    return "no_action";
}
