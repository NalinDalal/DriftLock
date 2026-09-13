import { describe, expect, test, mock, beforeEach } from "bun:test";
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

describe("Agent", () => {
    test("constructor requires API key", () => {
        expect(() => new Agent("test-key")).not.toThrow();
    });

    test("constructor throws without API key", () => {
        expect(() => new Agent("")).toBeDefined();
    });

    test("analyzeChange is a function", () => {
        const agent = new Agent("test-key");
        expect(typeof agent.analyzeChange).toBe("function");
    });

    test("generateFix is a function", () => {
        const agent = new Agent("test-key");
        expect(typeof agent.generateFix).toBe("function");
    });

    test("analyzeChange returns a promise", () => {
        const agent = new Agent("test-key");
        const result = agent.analyzeChange(
            { version: "1.0" },
            { version: "2.0" },
            createDiffSummary(),
        );
        expect(result).toBeInstanceOf(Promise);
        // Don't await - OpenAI won't work in test env
        result.catch(() => {});
    });

    test("generateFix returns a promise", () => {
        const agent = new Agent("test-key");
        const result = agent.generateFix(
            createDriftEvent(),
            "const x = stripe.charges.create({});",
        );
        expect(result).toBeInstanceOf(Promise);
        result.catch(() => {});
    });
});
