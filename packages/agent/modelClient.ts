import { isToolName, type ToolDefinition, type ToolName } from "./tools";
import type { TranscriptEntry } from "./state";

/**
 * Model-call seam: the migration loop speaks this, not any vendor SDK.
 *
 * Providers implement it: the OpenAI chat-completions shape (inline in
 * `migrationAgent`, preserved for backward compatibility) and any
 * fetch-style provider registered below. A test fake implements it with
 * scripted turns. The loop cannot tell them apart, which is the point:
 * provider is a runtime option, not a rewrite.
 */
/** Built-in names. The registry accepts any string beyond these. */
export type BuiltinModelProvider = "openai" | "anthropic";
export type ModelProvider = BuiltinModelProvider | string;

export interface ModelTurn {
    content: string;
    toolCalls: { id: string; name: ToolName; args: Record<string, unknown> }[];
}

export interface ModelCallRequest {
    model: string;
    temperature: number;
    system: string;
    transcript: TranscriptEntry[];
    tools: ToolDefinition[];
    signal?: AbortSignal;
}

export interface ModelClient {
    create(request: ModelCallRequest): Promise<ModelTurn>;
}

export interface ProviderFactoryOptions {
    apiKey: string;
    baseURL?: string;
    fetchFn?: typeof fetch;
}

export interface ModelProviderSpec {
    /** Registry name, e.g. "anthropic". */
    name: string;
    /** Env var holding the key, e.g. "ANTHROPIC_API_KEY". */
    envKey: string;
    create: (options: ProviderFactoryOptions) => ModelClient;
}

const providerRegistry = new Map<string, ModelProviderSpec>();

/**
 * Registers a fetch-style model provider. Adding Gemini (or anything else)
 * is this call plus a `ModelClient` implementation: the loop, trigger,
 * and CLI resolve through the registry and need no edits.
 */
export function registerModelProvider(spec: ModelProviderSpec): void {
    providerRegistry.set(spec.name.toLowerCase(), spec);
}

/** Names available through the registry (excludes the OpenAI SDK path). */
export function modelProviderNames(): string[] {
    return [...providerRegistry.keys()].sort();
}

/** Env var holding the key for a registered provider, if any. */
export function modelProviderEnvKey(name: string): string | null {
    return providerRegistry.get(name.toLowerCase())?.envKey ?? null;
}

export class UnknownModelProviderError extends Error {}

/**
 * Builds a registered provider's client. Throws `UnknownModelProviderError`
 * naming the known providers: an unrecognised provider is a configuration
 * error and must fail fast, never silently fall back to another model.
 */
export function createProviderClient(
    name: string,
    options: ProviderFactoryOptions,
): ModelClient {
    const spec = providerRegistry.get(name.toLowerCase());
    if (!spec) {
        const known = ["openai", ...modelProviderNames()].join(", ");
        throw new UnknownModelProviderError(
            `Unknown model provider "${name}". Known: ${known}.`,
        );
    }
    return spec.create(options);
}

export interface AnthropicClientOptions {
    apiKey: string;
    baseURL?: string;
    maxTokens?: number;
    fetchFn?: typeof fetch;
}type AnthropicContentBlock =
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: unknown }
    | { type: "tool_result"; tool_use_id: string; content: string };

/**
 * Maps our transcript onto Anthropic messages. Consecutive `tool` entries
 * fold into one `user` message with several `tool_result` blocks, which is
 * what the API requires after an assistant turn with parallel `tool_use`.
 */
export function toAnthropicMessages(transcript: TranscriptEntry[]): { role: string; content: unknown }[] {
    const messages: { role: string; content: unknown }[] = [];
    let pendingResults: AnthropicContentBlock[] = [];
    const flush = (): void => {
        if (pendingResults.length > 0) {
            messages.push({ role: "user", content: pendingResults });
            pendingResults = [];
        }
    };
    for (const entry of transcript) {
        if (entry.role === "tool") {
            if (entry.toolCallId) {
                pendingResults.push({
                    type: "tool_result",
                    tool_use_id: entry.toolCallId,
                    content: entry.content,
                });
            }
            continue;
        }
        flush();
        if (entry.role === "assistant" && entry.toolCalls?.length) {
            const blocks: AnthropicContentBlock[] = [];
            if (entry.content) blocks.push({ type: "text", text: entry.content });
            for (const call of entry.toolCalls) {
                blocks.push({ type: "tool_use", id: call.id, name: call.name, input: call.args });
            }
            messages.push({ role: "assistant", content: blocks });
            continue;
        }
        messages.push({ role: entry.role, content: entry.content });
    }
    flush();
    return messages;
}

/**
 * Maps an Anthropic messages response onto a loop turn. Unknown tool names
 * are dropped, mirroring `parseToolCalls`: a hallucinated tool ends the
 * run as text, it never reaches the executor.
 */
export function fromAnthropicResponse(body: unknown): ModelTurn {
    const blocks = (body as { content?: unknown }).content;
    const list = Array.isArray(blocks) ? blocks : [];
    const texts: string[] = [];
    const toolCalls: ModelTurn["toolCalls"] = [];
    for (const block of list) {
        const item = block as { type?: string; text?: unknown; id?: unknown; name?: unknown; input?: unknown };
        if (item.type === "text" && typeof item.text === "string") {
            texts.push(item.text);
        } else if (item.type === "tool_use" && typeof item.id === "string" && typeof item.name === "string") {
            if (!isToolName(item.name)) continue;
            const args =
                item.input && typeof item.input === "object"
                    ? (item.input as Record<string, unknown>)
                    : {};
            toolCalls.push({ id: item.id, name: item.name, args });
        }
    }
    return { content: texts.join(""), toolCalls };
}

export class AnthropicRequestError extends Error {
    constructor(
        message: string,
        readonly status?: number,
    ) {
        super(message);
    }
}

/**
 * Anthropic messages provider over plain fetch: no SDK dependency, same
 * `ModelClient` contract as the OpenAI path. Timeouts ride on the caller's
 * AbortSignal so the loop's retry wrapper treats both providers alike;
 * thrown errors carry `status` so 429/5xx retry and 401/400 do not.
 */
export function createAnthropicModelClient(options: AnthropicClientOptions): ModelClient {
    if (!options.apiKey) throw new AnthropicRequestError("Anthropic provider requires an API key");
    const base = (options.baseURL ?? "https://api.anthropic.com").replace(/\/$/, "");
    const fetchFn = options.fetchFn ?? fetch;
    return {
        async create(request: ModelCallRequest): Promise<ModelTurn> {
            let response: Response;
            try {
                response = await fetchFn(`${base}/v1/messages`, {
                    method: "POST",
                    signal: request.signal,
                    headers: {
                        "content-type": "application/json",
                        "x-api-key": options.apiKey,
                        "anthropic-version": "2023-06-01",
                    },
                    body: JSON.stringify({
                        model: request.model,
                        system: request.system,
                        messages: toAnthropicMessages(request.transcript),
                        tools: request.tools.map((tool) => ({
                            name: tool.name,
                            description: tool.description,
                            input_schema: tool.inputSchema,
                        })),
                        tool_choice: { type: "auto" },
                        temperature: request.temperature,
                        max_tokens: options.maxTokens ?? 4096,
                    }),
                });
            } catch (error) {
                if (error instanceof DOMException && error.name === "AbortError") throw error;
                const reason = error instanceof Error ? error.message : String(error);
                throw new AnthropicRequestError(`Anthropic request failed: ${reason}`);
            }
            if (!response.ok) {
                throw new AnthropicRequestError(
                    `Anthropic request failed with status ${response.status}`,
                    response.status,
                );
            }
            let body: unknown;
            try {
                body = await response.json();
            } catch {
                throw new AnthropicRequestError("Anthropic returned a body that is not JSON", response.status);
            }
            return fromAnthropicResponse(body);
        },
    };
}

registerModelProvider({
    name: "anthropic",
    envKey: "ANTHROPIC_API_KEY",
    create: (options) => createAnthropicModelClient(options),
});
