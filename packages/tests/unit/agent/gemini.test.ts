import { describe, expect, test } from "bun:test";
import {
    createGeminiModelClient,
    fromGeminiResponse,
    GeminiRequestError,
    isRetryableModelError,
    modelProviderDefaultModel,
    modelProviderEnvKey,
    modelProviderNames,
    toGeminiContents,
} from "@driftlock/agent";

function geminiBody(parts: unknown[], status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => ({ candidates: [{ content: { parts } }] }),
    };
}

describe("toGeminiContents", () => {
    test("maps user and model turns to roles", () => {
        expect(
            toGeminiContents([
                { role: "user", content: "Find source." },
                { role: "assistant", content: "On it." },
            ]),
        ).toEqual([
            { role: "user", parts: [{ text: "Find source." }] },
            { role: "model", parts: [{ text: "On it." }] },
        ]);
    });

    test("assistant calls become functionCall parts", () => {
        expect(
            toGeminiContents([
                {
                    role: "assistant",
                    content: "Searching.",
                    toolCalls: [{ id: "g0", name: "searchCode", args: { query: "source" } }],
                },
            ]),
        ).toEqual([
            {
                role: "model",
                parts: [
                    { text: "Searching." },
                    { functionCall: { name: "searchCode", args: { query: "source" } } },
                ],
            },
        ]);
    });

    test("consecutive tool results fold into one user content", () => {
        expect(
            toGeminiContents([
                {
                    role: "assistant",
                    content: "",
                    toolCalls: [
                        { id: "g1", name: "searchCode", args: { query: "source" } },
                        { id: "g2", name: "readFile", args: { path: "src/a.ts" } },
                    ],
                },
                { role: "tool", toolCallId: "g1", toolName: "searchCode", content: "src/a.ts:1" },
                { role: "tool", toolCallId: "g2", toolName: "readFile", content: "source" },
                { role: "assistant", content: "Done." },
            ]),
        ).toEqual([
            {
                role: "model",
                parts: [{ functionCall: { name: "searchCode", args: { query: "source" } } }, { functionCall: { name: "readFile", args: { path: "src/a.ts" } } }],
            },
            {
                role: "user",
                parts: [
                    { functionResponse: { name: "searchCode", response: { output: "src/a.ts:1" } } },
                    { functionResponse: { name: "readFile", response: { output: "source" } } },
                ],
            },
            { role: "model", parts: [{ text: "Done." }] },
        ]);
    });
});

describe("fromGeminiResponse", () => {
    test("joins text and maps functionCall with object args", () => {
        expect(
            fromGeminiResponse({
                candidates: [
                    {
                        content: {
                            parts: [
                                { text: "Fixing " },
                                { text: "now." },
                                { functionCall: { name: "searchCode", args: { query: "source" } } },
                            ],
                        },
                    },
                ],
            }),
        ).toEqual({
            content: "Fixing now.",
            toolCalls: [{ id: "gemini-2", name: "searchCode", args: { query: "source" } }],
        });
    });

    test("drops hallucinated functions and coerces bad args to {}", () => {
        const turn = fromGeminiResponse({
            candidates: [
                {
                    content: {
                        parts: [
                            { functionCall: { name: "deleteEverything", args: {} } },
                            { functionCall: { name: "readFile", args: "src/a.ts" } },
                        ],
                    },
                },
            ],
        });
        expect(turn.toolCalls).toEqual([{ id: "gemini-1", name: "readFile", args: {} }]);
    });

    test("a blocked response with no candidates is an empty turn, not a crash", () => {
        expect(fromGeminiResponse({})).toEqual({ content: "", toolCalls: [] });
    });
});

describe("createGeminiModelClient", () => {
    test("requires an API key", () => {
        expect(() => createGeminiModelClient({ apiKey: "" })).toThrow(/API key/);
    });

    test("sends system_instruction, functionDeclarations, and AUTO mode", async () => {
        let seenUrl = "";
        let seenHeaders: Record<string, string> = {};
        let seenBody: Record<string, unknown> = {};
        const client = createGeminiModelClient({
            apiKey: "AIza-test",
            fetchFn: (async (url: string, init?: RequestInit) => {
                seenUrl = url;
                seenHeaders = (init?.headers ?? {}) as Record<string, string>;
                seenBody = JSON.parse(init?.body as string) as Record<string, unknown>;
                return geminiBody([{ functionCall: { name: "searchCode", args: { query: "s" } } }]);
            }) as unknown as typeof fetch,
        });
        const turn = await client.create({
            model: "gemini-2.5-flash",
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
        expect(seenUrl).toBe(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        );
        expect(seenHeaders["x-goog-api-key"]).toBe("AIza-test");
        expect(seenBody["system_instruction"]).toEqual({ parts: [{ text: "You are DriftLock." }] });
        const declarations = (
            (seenBody["tools"] as { functionDeclarations: unknown[] }[])[0].functionDeclarations
        ) as { name: string }[];
        expect(declarations.map((d) => d.name)).toEqual(["searchCode"]);
        expect(seenBody["toolConfig"]).toEqual({ functionCallingConfig: { mode: "AUTO" } });
        expect(turn.toolCalls).toEqual([{ id: "gemini-0", name: "searchCode", args: { query: "s" } }]);
    });

    test("429 retries, 400 does not", async () => {
        const failing = (status: number) =>
            createGeminiModelClient({
                apiKey: "k",
                fetchFn: (async () => geminiBody([], status)) as unknown as typeof fetch,
            });
        const rateLimited = await failing(429)
            .create({ model: "m", temperature: 0, system: "s", transcript: [], tools: [] })
            .catch((e: unknown) => e);
        expect(rateLimited).toBeInstanceOf(GeminiRequestError);
        expect(isRetryableModelError(rateLimited)).toBe(true);
        const badRequest = await failing(400)
            .create({ model: "m", temperature: 0, system: "s", transcript: [], tools: [] })
            .catch((e: unknown) => e);
        expect(isRetryableModelError(badRequest)).toBe(false);
    });
});

describe("gemini registry entry", () => {
    test("registered with env key and flash default", () => {
        expect(modelProviderNames()).toContain("gemini");
        expect(modelProviderEnvKey("gemini")).toBe("GEMINI_API_KEY");
        expect(modelProviderDefaultModel("gemini")).toBe("gemini-2.5-flash");
        expect(modelProviderDefaultModel("anthropic")).toBe("claude-sonnet-4-20250514");
        expect(modelProviderDefaultModel("openai")).toBeNull();
    });
});
