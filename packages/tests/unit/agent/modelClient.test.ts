import { describe, expect, test } from "bun:test";
import {
    AnthropicRequestError,
    createAnthropicModelClient,
    createProviderClient,
    fromAnthropicResponse,
    isRetryableModelError,
    modelProviderEnvKey,
    modelProviderNames,
    registerModelProvider,
    toAnthropicMessages,
    UnknownModelProviderError,
} from "@driftlock/agent";

function anthropicBody(content: unknown[], status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => ({ content }),
    };
}

describe("toAnthropicMessages", () => {
    test("passes plain turns through with roles intact", () => {
        const messages = toAnthropicMessages([
            { role: "user", content: "Locate call sites." },
            { role: "assistant", content: "On it." },
        ]);
        expect(messages).toEqual([
            { role: "user", content: "Locate call sites." },
            { role: "assistant", content: "On it." },
        ]);
    });

    test("assistant tool calls become tool_use blocks", () => {
        const messages = toAnthropicMessages([
            {
                role: "assistant",
                content: "Searching.",
                toolCalls: [{ id: "a1", name: "searchCode", args: { query: "source" } }],
            },
        ]);
        expect(messages).toEqual([
            {
                role: "assistant",
                content: [
                    { type: "text", text: "Searching." },
                    { type: "tool_use", id: "a1", name: "searchCode", input: { query: "source" } },
                ],
            },
        ]);
    });

    test("consecutive tool results fold into one user message", () => {
        const messages = toAnthropicMessages([
            {
                role: "assistant",
                content: "",
                toolCalls: [
                    { id: "a1", name: "searchCode", args: { query: "source" } },
                    { id: "a2", name: "readFile", args: { path: "src/a.ts" } },
                ],
            },
            { role: "tool", toolCallId: "a1", toolName: "searchCode", content: "src/a.ts:1" },
            { role: "tool", toolCallId: "a2", toolName: "readFile", content: "source" },
            { role: "assistant", content: "Done." },
        ]);
        expect(messages).toHaveLength(3);
        expect(messages[1]).toEqual({
            role: "user",
            content: [
                { type: "tool_result", tool_use_id: "a1", content: "src/a.ts:1" },
                { type: "tool_result", tool_use_id: "a2", content: "source" },
            ],
        });
    });
});

describe("fromAnthropicResponse", () => {
    test("joins text and maps tool_use with object input", () => {
        const turn = fromAnthropicResponse({
            content: [
                { type: "text", text: "Fixing " },
                { type: "text", text: "now." },
                { type: "tool_use", id: "b1", name: "searchCode", input: { query: "source" } },
            ],
        });
        expect(turn.content).toBe("Fixing now.");
        expect(turn.toolCalls).toEqual([{ id: "b1", name: "searchCode", args: { query: "source" } }]);
    });

    test("drops hallucinated tools and coerces bad input to {}", () => {
        const turn = fromAnthropicResponse({
            content: [
                { type: "tool_use", id: "b1", name: "deleteEverything", input: {} },
                { type: "tool_use", id: "b2", name: "readFile", input: "src/a.ts" },
            ],
        });
        expect(turn.toolCalls).toEqual([{ id: "b2", name: "readFile", args: {} }]);
    });
});

describe("provider registry", () => {
    test("anthropic is registered with its env key", () => {
        expect(modelProviderNames()).toContain("anthropic");
        expect(modelProviderEnvKey("anthropic")).toBe("ANTHROPIC_API_KEY");
        expect(modelProviderEnvKey("ANTHROPIC")).toBe("ANTHROPIC_API_KEY");
        expect(modelProviderEnvKey("nope")).toBeNull();
    });

    test("unknown providers fail fast naming the known ones", () => {
        const error = (() => {
            try {
                createProviderClient("skynet", { apiKey: "k" });
            } catch (e) {
                return e;
            }
            throw new Error("must throw");
        })();
        expect(error).toBeInstanceOf(UnknownModelProviderError);
        expect((error as Error).message).toContain("openai");
        expect((error as Error).message).toContain("anthropic");
    });

    test("a custom provider plugs in with one registration call", async () => {
        registerModelProvider({
            name: "echo",
            envKey: "ECHO_API_KEY",
            defaultModel: "echo-1",
            create: () => ({
                create: async (request) => ({
                    content: `saw ${request.transcript.length} entries`,
                    toolCalls: [],
                }),
            }),
        });
        expect(modelProviderNames()).toContain("echo");
        const client = createProviderClient("ECHO", { apiKey: "k" });
        const turn = await client.create({
            model: "echo-1",
            temperature: 0,
            system: "s",
            transcript: [{ role: "user", content: "hi" }],
            tools: [],
        });
        expect(turn.content).toBe("saw 1 entries");
    });
});
describe("createAnthropicModelClient", () => {
    test("requires an API key", () => {
        expect(() => createAnthropicModelClient({ apiKey: "" })).toThrow(/API key/);
    });

    test("sends system, input_schema tools, and tool_choice auto", async () => {
        let seenUrl = "";
        let seenHeaders: Record<string, string> = {};
        let seenBody: Record<string, unknown> = {};
        const client = createAnthropicModelClient({
            apiKey: "sk-ant-test",
            fetchFn: (async (url: string, init?: RequestInit) => {
                seenUrl = url;
                seenHeaders = (init?.headers ?? {}) as Record<string, string>;
                seenBody = JSON.parse(init?.body as string) as Record<string, unknown>;
                return anthropicBody([
                    { type: "tool_use", id: "c1", name: "searchCode", input: { query: "source" } },
                ]);
            }) as unknown as typeof fetch,
        });
        const turn = await client.create({
            model: "claude-sonnet-4-20250514",
            temperature: 0.1,
            system: "You are DriftLock.",
            transcript: [{ role: "user", content: "Find source." }],
            tools: [
                {
                    name: "searchCode",
                    description: "Search.",
                    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
                },
            ],
        });
        expect(seenUrl).toBe("https://api.anthropic.com/v1/messages");
        expect(seenHeaders["x-api-key"]).toBe("sk-ant-test");
        expect(seenHeaders["anthropic-version"]).toBe("2023-06-01");
        expect(seenBody["system"]).toBe("You are DriftLock.");
        expect(seenBody["tool_choice"]).toEqual({ type: "auto" });
        expect(seenBody["max_tokens"]).toBe(4096);
        expect(turn.toolCalls).toEqual([{ id: "c1", name: "searchCode", args: { query: "source" } }]);
    });

    test("non-2xx errors carry status so 429 retries and 401 does not", async () => {
        const failing = (status: number) =>
            createAnthropicModelClient({
                apiKey: "k",
                fetchFn: (async () => anthropicBody([], status)) as unknown as typeof fetch,
            });
        const rateLimited = await failing(429)
            .create({ model: "m", temperature: 0, system: "s", transcript: [], tools: [] })
            .catch((e: unknown) => e);
        expect(rateLimited).toBeInstanceOf(AnthropicRequestError);
        expect(isRetryableModelError(rateLimited)).toBe(true);
        const unauthorized = await failing(401)
            .create({ model: "m", temperature: 0, system: "s", transcript: [], tools: [] })
            .catch((e: unknown) => e);
        expect(isRetryableModelError(unauthorized)).toBe(false);
    });

    test("abort propagates as AbortError for the retry wrapper", async () => {
        const client = createAnthropicModelClient({
            apiKey: "k",
            fetchFn: (async (_url: string, init?: RequestInit) => {
                init?.signal?.throwIfAborted();
                throw new DOMException("aborted", "AbortError");
            }) as unknown as typeof fetch,
        });
        const controller = new AbortController();
        controller.abort();
        const error = await client
            .create({ model: "m", temperature: 0, system: "s", transcript: [], tools: [], signal: controller.signal })
            .catch((e: unknown) => e);
        expect(isRetryableModelError(error)).toBe(true);
    });
});
