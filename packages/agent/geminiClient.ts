import { registerModelProvider } from "./modelClient";
import type { ModelClient, ModelTurn } from "./modelClient";
import { isToolName, type ToolDefinition } from "./tools";
import type { TranscriptEntry } from "./state";

/**
 * Gemini provider over the generateContent REST API: no SDK dependency,
 * same `ModelClient` contract as the other providers.
 *
 * Wire mapping: our tools become `functionDeclarations`, `tool_choice:
 * auto` becomes `functionCallingConfig: { mode: "AUTO" }`, assistant turns
 * with calls become `model` contents with `functionCall` parts, and our
 * consecutive `tool` entries fold into one `user` content with
 * `functionResponse` parts — the shape Gemini requires after a turn with
 * function calls.
 */

export interface GeminiClientOptions {
    apiKey: string;
    baseURL?: string;
    fetchFn?: typeof fetch;
}

type GeminiPart =
    | { text: string }
    | { functionCall: { name: string; args: Record<string, unknown> } }
    | { functionResponse: { name: string; response: { output: string } } };

interface GeminiContent {
    role: "user" | "model";
    parts: GeminiPart[];
}

function toFunctionDeclaration(tool: ToolDefinition): Record<string, unknown> {
    return {
        name: tool.name,
        description: tool.description,
        parameters: {
            type: "object",
            properties: tool.inputSchema.properties,
            required: tool.inputSchema.required,
        },
    };
}

/**
 * Maps our transcript onto Gemini contents. Consecutive `tool` entries
 * fold into one `user` content with several `functionResponse` parts.
 * Entries without a toolCallId carry no function identity and are skipped:
 * a response Gemini cannot route is noise, not signal.
 */
export function toGeminiContents(transcript: TranscriptEntry[]): GeminiContent[] {
    const contents: GeminiContent[] = [];
    let pending: GeminiPart[] = [];
    const flush = (): void => {
        if (pending.length > 0) {
            contents.push({ role: "user", parts: pending });
            pending = [];
        }
    };
    for (const entry of transcript) {
        if (entry.role === "tool") {
            if (entry.toolCallId && entry.toolName) {
                pending.push({
                    functionResponse: {
                        name: entry.toolName,
                        response: { output: entry.content },
                    },
                });
            }
            continue;
        }
        flush();
        if (entry.role === "assistant" && entry.toolCalls?.length) {
            const parts: GeminiPart[] = [];
            if (entry.content) parts.push({ text: entry.content });
            for (const call of entry.toolCalls) {
                parts.push({ functionCall: { name: call.name, args: call.args } });
            }
            contents.push({ role: "model", parts });
            continue;
        }
        contents.push({ role: entry.role === "assistant" ? "model" : "user", parts: [{ text: entry.content }] });
    }
    flush();
    return contents;
}

/**
 * Maps a generateContent response onto a loop turn. Unknown function names
 * are dropped, mirroring the other providers: a hallucinated call ends the
 * run as text, it never reaches the executor.
 */
export function fromGeminiResponse(body: unknown): ModelTurn {
    const candidates = (body as { candidates?: unknown }).candidates;
    const first = Array.isArray(candidates) ? candidates[0] : undefined;
    const parts = (first as { content?: { parts?: unknown } } | undefined)?.content?.parts;
    const list = Array.isArray(parts) ? parts : [];
    const texts: string[] = [];
    const toolCalls: ModelTurn["toolCalls"] = [];
    list.forEach((part, index) => {
        const item = part as {
            text?: unknown;
            functionCall?: { name?: unknown; args?: unknown };
        };
        if (typeof item.text === "string") texts.push(item.text);
        const call = item.functionCall;
        if (call && typeof call.name === "string" && isToolName(call.name)) {
            toolCalls.push({
                id: `gemini-${index}`,
                name: call.name,
                args:
                    call.args && typeof call.args === "object"
                        ? (call.args as Record<string, unknown>)
                        : {},
            });
        }
    });
    return { content: texts.join(""), toolCalls };
}

export class GeminiRequestError extends Error {
    constructor(
        message: string,
        readonly status?: number,
    ) {
        super(message);
    }
}

/**
 * Gemini generateContent provider over plain fetch. Thrown errors carry
 * `status` so 429/5xx retry through the loop's wrapper and 400/401/403 do
 * not. Timeouts ride on the caller's AbortSignal like every provider.
 */
export function createGeminiModelClient(options: GeminiClientOptions): ModelClient {
    if (!options.apiKey) throw new GeminiRequestError("Gemini provider requires an API key");
    const base = (options.baseURL ?? "https://generativelanguage.googleapis.com").replace(/\/$/, "");
    const fetchFn = options.fetchFn ?? fetch;
    return {
        async create(request): Promise<ModelTurn> {
            let response: Response;
            try {
                response = await fetchFn(
                    `${base}/v1beta/models/${request.model}:generateContent`,
                    {
                        method: "POST",
                        signal: request.signal,
                        headers: {
                            "content-type": "application/json",
                            "x-goog-api-key": options.apiKey,
                        },
                        body: JSON.stringify({
                            system_instruction: { parts: [{ text: request.system }] },
                            contents: toGeminiContents(request.transcript),
                            tools: [{ functionDeclarations: request.tools.map(toFunctionDeclaration) }],
                            toolConfig: { functionCallingConfig: { mode: "AUTO" } },
                            generationConfig: { temperature: request.temperature },
                        }),
                    },
                );
            } catch (error) {
                if (error instanceof DOMException && error.name === "AbortError") throw error;
                const reason = error instanceof Error ? error.message : String(error);
                throw new GeminiRequestError(`Gemini request failed: ${reason}`);
            }
            if (!response.ok) {
                throw new GeminiRequestError(
                    `Gemini request failed with status ${response.status}`,
                    response.status,
                );
            }
            let body: unknown;
            try {
                body = await response.json();
            } catch {
                throw new GeminiRequestError("Gemini returned a body that is not JSON", response.status);
            }
            return fromGeminiResponse(body);
        },
    };
}

registerModelProvider({
    name: "gemini",
    envKey: "GEMINI_API_KEY",
    defaultModel: "gemini-2.5-flash",
    create: (options) => createGeminiModelClient(options),
});
