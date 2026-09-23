import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { CallSite } from "@driftlock/core";
import type { TrafficCapture } from "@driftlock/sandbox";
import {
    buildDriftResult,
    driftConfidence,
    driftSummary,
    extractShapesFromCaptures,
    FileSnapshotStore,
} from "../index";

function callSite(overrides: Partial<CallSite> = {}): CallSite {
    return {
        id: "cs-1",
        repositoryId: "repo-1",
        filePath: "src/charge.ts",
        line: 12,
        method: "stripe.charges.create",
        packageName: "stripe",
        endpoint: "/v1/charges",
        httpMethod: "POST",
        requestShape: { amount: {} },
        responseFields: ["id"],
        testFiles: [],
        lastCheckedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

function capture(
    body: unknown,
    responseBody: unknown,
): TrafficCapture {
    return {
        timestamp: new Date(),
        method: "POST",
        url: "https://api.stripe.com/v1/charges",
        headers: {},
        body,
        response: { status: 200, headers: {}, body: responseBody },
    };
}

describe("extractShapesFromCaptures", () => {
    test("matches a capture to its call site and infers both shapes", () => {
        const shapes = extractShapesFromCaptures(
            [capture({ amount: 100 }, { id: "ch_1", status: "ok" })],
            [callSite()],
        );
        const site = shapes.get("cs-1");
        expect(site).toBeDefined();
        expect(site?.request.amount?.kind).toBe("number");
        expect(site?.response.id?.kind).toBe("string");
        expect(site?.response.status?.kind).toBe("string");
    });

    test("ignores captures that do not match the endpoint", () => {
        const other = callSite({ id: "cs-2", endpoint: "/v1/refunds" });
        const shapes = extractShapesFromCaptures(
            [capture({ amount: 1 }, { id: "re_1" })],
            [other],
        );
        expect(shapes.size).toBe(0);
    });
});

describe("buildDriftResult", () => {
    test("detects a removed response field and builds a fix work", () => {
        const previous = {
            request: { amount: { kind: "number" as const } },
            response: {
                id: { kind: "string" as const },
                status: { kind: "string" as const },
            },
        };
        const current = {
            request: { amount: { kind: "number" as const } },
            response: { id: { kind: "string" as const } },
        };
        const drift = buildDriftResult(callSite(), previous, current);
        expect(drift.works.length).toBeGreaterThan(0);
        const summary = driftSummary(drift);
        expect(summary.removedFields).toContain("status");
        expect(["high", "medium", "low"]).toContain(
            driftConfidence(drift),
        );
    });

    test("reports no works when the shape is unchanged", () => {
        const shapes = {
            request: { amount: { kind: "number" as const } },
            response: { id: { kind: "string" as const } },
        };
        const drift = buildDriftResult(callSite(), shapes, shapes);
        expect(drift.works.length).toBe(0);
    });
});

describe("FileSnapshotStore", () => {
    test("round-trips captured shapes", async () => {
        const dir = mkdtempSync(join(tmpdir(), "driftlock-pipeline-"));
        const store = new FileSnapshotStore(dir);
        expect(await store.load("cs-1")).toBeNull();
        await (store as any).save(
            "cs-1",
            {
                request: { amount: { kind: "number" } },
                response: { id: { kind: "string" } },
            },
            {
                testCommand: "bun test",
                exitCode: 0,
                duration: 10,
                trafficCaptured: 1,
            },
        );
        const loaded = await store.load("cs-1");
        expect(loaded?.request.amount?.kind).toBe("number");
        expect(loaded?.response.id?.kind).toBe("string");
    });
});