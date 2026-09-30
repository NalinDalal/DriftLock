import { describe, expect, test } from "bun:test";
import { resolveFixedSource } from "../applyFix";
import type { FixWork } from "@driftlock/diff";

const rename: FixWork = {
    kind: "field_rename",
    field: "source",
    from: "source",
    to: "payment_method",
    description: "Rename source to payment_method",
    confidence: "high",
    template: "",
};

const original = `const charge = await stripe.charges.create({ source: "tok_visa" });\n`;

describe("resolveFixedSource (single fix path)", () => {
    test("deterministic fallback when no AI is configured", async () => {
        const result = await resolveFixedSource({
            works: [rename],
            source: original,
            filePath: "handler.ts",
        });
        expect(result.aiUsed).toBe(false);
        expect(result.fixed).toContain("payment_method");
        expect(result.fixed).not.toContain("source:");
    });

    test("returns null when no work applies", async () => {
        const result = await resolveFixedSource({
            works: [],
            source: original,
            filePath: "handler.ts",
        });
        expect(result.fixed).toBeNull();
        expect(result.aiUsed).toBe(false);
    });

    test("falls back to deterministic when AI confidence is below 60", async () => {
        const realFetch = globalThis.fetch;
        globalThis.fetch = (async () =>
            new Response(
                JSON.stringify({
                    choices: [
                        {
                            message: {
                                content: `\`\`\`typescript
${original}\`\`\`\n\nKept as is.\nConfidence: 30`,
                            },
                        },
                    ],
                }),
                { status: 200, headers: { "content-type": "application/json" } },
            )) as typeof fetch;
        try {
            const result = await resolveFixedSource({
                works: [rename],
                source: original,
                filePath: "handler.ts",
                ai: { provider: "openai", apiKey: "test-key" },
            });
            expect(result.aiUsed).toBe(false);
            expect(result.fixed).toContain("payment_method");
        } finally {
            globalThis.fetch = realFetch;
        }
    });
});
