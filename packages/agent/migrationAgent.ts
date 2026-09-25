import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { isToolName, toOpenAITools } from "./tools";
import { SYSTEM_PROMPT } from "./prompt";
import {
    canChangeMoreFiles,
    canRunMoreCommands,
    createInitialState,
    decideOutcome,
    limits,
    recordFileChanged,
    type AgentState,
    type ChangePacket,
    type Outcome,
    type ToolCall,
    type TranscriptEntry,
} from "./state";
import {
    createPullRequest,
    editFile,
    inspectRepo,
    readFile,
    runCommand,
    searchCode,
    type ToolResult,
} from "./executor";

export type RunOptions = {
    root: string;
    packet: ChangePacket;
    apiKey?: string;
    model?: string;
    client?: OpenAI;
};

export type RunResult = {
    outcome: Outcome;
    state: AgentState;
    filesChanged: string[];
};

type RunnerDeps = {
    create: OpenAI["chat"]["completions"]["create"];
};

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
                content: entry.content || null,
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
    root: string,
    state: AgentState,
): Promise<ToolResult> {
    switch (name) {
        case "inspectRepo":
            return inspectRepo(root);
        case "searchCode":
            return searchCode(root, readString(args, "query"), readString(args, "path") || undefined);
        case "readFile":
            return readFile(root, readString(args, "path"));
        case "editFile": {
            if (!canChangeMoreFiles(state)) {
                return {
                    ok: false,
                    output: `Refusing edit: MAX_FILES_CHANGED (${state.maxFilesChanged}) reached`,
                };
            }
            const result = await editFile(root, readString(args, "path"), readString(args, "patch"));
            if (result.ok) recordFileChanged(state, readString(args, "path"));
            return result;
        }
        case "runCommand": {
            if (!canRunMoreCommands(state)) {
                return {
                    ok: false,
                    output: `Refusing command: MAX_COMMANDS (${state.maxCommands}) reached`,
                };
            }
            state.commandsRun += 1;
            const result = await runCommand(root, readString(args, "command"));
            state.lastTestResult = { passed: result.ok, output: result.output };
            return result;
        }
        case "createPullRequest":
            return createPullRequest(
                root,
                readString(args, "title"),
                readString(args, "body"),
                readString(args, "branch"),
            );
        default:
            return { ok: false, output: `Unknown tool: ${String(name)}` };
    }
}

export async function runMigrationAgent(options: RunOptions): Promise<RunResult> {
    const client =
        options.client ??
        new OpenAI({
            apiKey: options.apiKey ?? process.env.OPENAI_API_KEY,
        });
    const deps: RunnerDeps = { create: client.chat.completions.create.bind(client.chat.completions) };
    const state = createInitialState(options.packet);
    const model = options.model ?? "gpt-4o-mini";

    while (!state.done && state.iteration < state.maxIterations) {
        state.iteration++;

        const response = await deps.create({
            model,
            temperature: 0.1,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                ...toWireMessages(state.transcript),
            ],
            tools: toOpenAITools(),
            tool_choice: "auto",
        });

        const message = response.choices[0]?.message;
        const toolCalls = parseToolCalls(
            (message as { tool_calls?: unknown } | undefined)?.tool_calls,
        );

        if (toolCalls.length === 0) {
            state.transcript.push({
                role: "assistant",
                content: message?.content ?? "",
            });
            state.done = true;
            state.outcome = decideOutcome(state);
            break;
        }

        state.transcript.push({
            role: "assistant",
            content: message?.content ?? "",
            toolCalls,
        });

        for (const call of toolCalls) {
            const result = await execute(call.name, call.args, options.root, state);
            state.transcript.push({
                role: "tool",
                toolCallId: call.id,
                toolName: call.name,
                content: result.ok ? result.output : `FAILED: ${result.output}`,
            });

            if (call.name === "createPullRequest") {
                state.done = true;
                state.outcome = decideOutcome(state);
                break;
            }
        }

        if (state.filesChanged.length >= limits.MAX_FILES_CHANGED) {
            state.done = true;
            state.outcome = "review_pr";
        }
    }

    if (!state.done) {
        state.done = true;
        state.outcome =
            state.iteration >= state.maxIterations && state.filesChanged.length > 0
                ? "review_pr"
                : decideOutcome(state);
    }

    return {
        outcome: state.outcome ?? decideOutcome(state),
        state,
        filesChanged: state.filesChanged,
    };
}
