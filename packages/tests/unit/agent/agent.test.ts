import { describe, expect, test, mock } from "bun:test";
import { Agent } from "@driftlock/agent";
import type { DriftEvent, DiffSummary } from "@driftlock/core";

function createDiffSummary(overrides: Partial<DiffSummary> = {}): DiffSummary {
    return {
        addedFields: [],
        removedFields: [],
        typeChanges: [],
        optionalityChanges: [],
        breakingChanges: [],
        nonBreakingChanges: [],
        ...overrides,
    };
}

function createDriftEvent(overrides: Partial<DriftEvent> = {}): DriftEvent {
    return {
        id: "de_1",
        callSiteId: "cs_1",
        detectedAt: new Date(),
        oldSnapshotId: "snap_old",
        newSnapshotId: "snap_new",
        diffSummary: createDiffSummary({
            removedFields: ["legacy_id"],
            breakingChanges: ["Removed field 'legacy_id'"],
        }),
        suggestedFix: null,
        confidence: "medium",
        prNumber: null,
        status: "detected",
        ...overrides,
    };
}

function createMockedAgent(content: string) {
    const agent = new Agent("test-key");
    const create = mock(async () => ({
        choices: [{ message: { content } }],
    }));
    // Replace only this instance's SDK boundary, leaving other tests untouched.
    const boundary = agent as unknown as {
        openai: { chat: { completions: { create: typeof create } } };
    };
    boundary.openai.chat.completions.create = create;
    return { agent, create };
}

describe("Agent", () => {
    test("constructor accepts an API key", () => {
        expect(() => new Agent("test-key")).not.toThrow();
    });

    test("constructor accepts an empty API key", () => {
        expect(() => new Agent("")).not.toThrow();
    });

    test("analyzeChange is a function", () => {
        const agent = new Agent("test-key");
        expect(typeof agent.analyzeChange).toBe("function");
    });

    test("generateFix is a function", () => {
        const agent = new Agent("test-key");
        expect(typeof agent.generateFix).toBe("function");
    });

    test.each(["breaking", "non-breaking", "unknown"] as const)(
        "analyzeChange parses %s impact and analysis content",
        async (impact) => {
            const { agent, create } = createMockedAgent(
                [
                    "Summary: API version changed",
                    `Impact: ${impact}`,
                    "Confidence: high",
                    "Affected: cs_1, cs_2",
                    "Reasoning: Compared the API snapshots",
                ].join("\n"),
            );
            const result = await agent.analyzeChange(
                { version: "1.0" },
                { version: "2.0" },
                createDiffSummary(),
            );

            expect(create).toHaveBeenCalledTimes(1);
            expect(result).toEqual({
                summary: "API version changed",
                impact,
                confidence: "high",
                affectedCallSites: ["cs_1", "cs_2"],
                reasoning: "Compared the API snapshots",
            });
        },
    );

    test("generateFix parses a multiline diff after an empty header and skips code fences", async () => {
        const diff = [
            "--- a/client.ts",
            "+++ b/client.ts",
            "@@ -1 +1 @@",
            "-const id = response.legacy_id;",
            "+const id = response.id;",
        ].join("\n");
        const { agent, create } = createMockedAgent(
            [
                "Description: Use the replacement ID field",
                "Diff:",
                "```diff",
                diff,
                "```",
                "Explanation: The legacy ID field was removed",
            ].join("\n"),
        );
        const result = await agent.generateFix(
            createDriftEvent(),
            "const id = response.legacy_id;",
        );

        expect(create).toHaveBeenCalledTimes(1);
        expect(result).toEqual({
            fix: {
                id: "fix_de_1",
                driftEventId: "de_1",
                type: "custom",
                description: "Use the replacement ID field",
                diff,
                confidence: "medium",
                files: [],
                generatedAt: expect.any(Date),
            },
            explanation: "The legacy ID field was removed",
            alternatives: [],
        });
    });
});
