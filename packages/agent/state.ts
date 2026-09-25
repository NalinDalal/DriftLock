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
    done: boolean;
    outcome: Outcome | null;
};

export const limits = {
    MAX_ITERATIONS: 15,
    MAX_COMMANDS: 30,
    MAX_FILES_CHANGED: 20,
};

export function createInitialState(packet: ChangePacket): AgentState {
    return {
        iteration: 0,
        maxIterations: limits.MAX_ITERATIONS,
        maxCommands: limits.MAX_COMMANDS,
        commandsRun: 0,
        maxFilesChanged: limits.MAX_FILES_CHANGED,
        filesChanged: [],
        transcript: [
            {
                role: "user",
                content: [
                    "ChangePacket:",
                    JSON.stringify(packet, null, 2),
                    "",
                    "Migrate this repository. Inspect before editing, make the smallest correct change, then verify with the whitelisted commands.",
                ].join("\n"),
            },
        ],
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

export function decideOutcome(state: AgentState): Outcome {
    if (state.lastTestResult?.passed && state.filesChanged.length > 0) {
        return "auto_pr";
    }
    if (state.filesChanged.length > 0 || state.lastTestResult) return "review_pr";
    return "no_action";
}
