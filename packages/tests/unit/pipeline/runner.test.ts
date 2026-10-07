import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { mock } from "bun:test";
import type { CallSite } from "@driftlock/core";
import type { TrafficCapture } from "@driftlock/sandbox";
import { SandboxRunner, type SandboxConfig, type SandboxResult } from "@driftlock/sandbox";
import { TypeScriptExtractor } from "@driftlock/parser";
import type { SnapshotStore, CapturedShapes } from "@driftlock/pipeline";
import { analyzeAndCompare } from "@driftlock/pipeline";

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

function mockSnapshotStore(
    baseline: CapturedShapes | null,
): SnapshotStore {
    return {
        load: mock(async () => baseline),
        save: mock(async () => {}),
    };
}

function suiteResult(
    traffic: TrafficCapture[],
    overrides: Partial<SandboxResult> = {},
): SandboxResult {
    return {
        exitCode: 0,
        stdout: "",
        stderr: "",
        duration: 10,
        trafficCaptured: traffic,
        ...overrides,
    };
}

/**
 * Scoped stubs for the two statics `analyzeAndCompare` constructs.
 *
 * `mock.module` is process-global and unrestorable in this Bun version: one
 * call poisons every file sharing the run (the parser suite failed with this
 * file's canned `src/charge.ts` sites). Prototype patches with try/finally
 * restore are scoped to the test that needs them.
 */
async function withStubs<T>(
    stubs: {
        sitesForFile: (filePath: string) => CallSite[];
        suite: (repoPath: string, config: SandboxConfig) => Promise<SandboxResult>;
    },
    fn: () => Promise<T>,
): Promise<T> {
    const origExtract = TypeScriptExtractor.prototype.extractFromFile;
    const origSuite = SandboxRunner.prototype.runTestSuite;
    TypeScriptExtractor.prototype.extractFromFile = async (filePath: string) => ({
        callSites: stubs.sitesForFile(filePath),
        errors: [],
    });
    SandboxRunner.prototype.runTestSuite = async (
        repoPath: string,
        config: SandboxConfig,
    ) => stubs.suite(repoPath, config);
    try {
        return await fn();
    } finally {
        TypeScriptExtractor.prototype.extractFromFile = origExtract;
        SandboxRunner.prototype.runTestSuite = origSuite;
    }
}

function repoWithCharge(): string {
    const repo = mkdtempSync(join(tmpdir(), "driftlock-runner-"));
    mkdirSync(join(repo, "src"), { recursive: true });
    writeFileSync(join(repo, "src", "charge.ts"), "stripe.charges.create({ amount: 1 });");
    return repo;
}

describe("analyzeAndCompare", () => {
    test("returns empty result when no call sites are found", async () => {
        const repo = mkdtempSync(join(tmpdir(), "driftlock-runner-"));
        const store = mockSnapshotStore(null);
        const result = await analyzeAndCompare({
            repoPath: repo,
            command: "npm test",
            snapshotStore: store,
        });
        expect(result.callSites.length).toBe(0);
        expect(result.baselines.length).toBe(0);
        expect(result.drifts.length).toBe(0);
        expect(result.trafficCaptured).toBe(0);
    });

    test("registers baselines when no prior snapshot exists", async () => {
        const repo = repoWithCharge();
        const site = callSite({ filePath: join("src", "charge.ts") });
        const traffic = [capture({ amount: 1 }, { id: "ch_1" })];

        const store = mockSnapshotStore(null);
        const result = await withStubs(
            {
                sitesForFile: () => [site],
                suite: async () => suiteResult(traffic),
            },
            () =>
                analyzeAndCompare({
                    repoPath: repo,
                    command: "npm test",
                    snapshotStore: store,
                }),
        );

        expect(result.callSites.length).toBe(1);
        expect(result.baselines.length).toBe(1);
        expect(result.drifts.length).toBe(0);
        expect(result.shapes.get("cs-1")?.request.amount?.kind).toBe("number");
        expect(result.shapes.get("cs-1")?.response.id?.kind).toBe("string");
    });

    test("detects drift when a response field is removed", async () => {
        const repo = repoWithCharge();
        const site = callSite({ filePath: join("src", "charge.ts") });
        const traffic = [capture({ amount: 1 }, { id: "ch_1" })];

        const baseline: CapturedShapes = {
            request: { amount: { kind: "number" } },
            response: { id: { kind: "string" }, status: { kind: "string" } },
        };
        const store = mockSnapshotStore(baseline);

        const result = await withStubs(
            {
                sitesForFile: () => [site],
                suite: async () => suiteResult(traffic),
            },
            () =>
                analyzeAndCompare({
                    repoPath: repo,
                    command: "npm test",
                    snapshotStore: store,
                }),
        );

        expect(result.callSites.length).toBe(1);
        expect(result.baselines.length).toBe(0);
        expect(result.drifts.length).toBe(1);
        expect(result.drifts[0].works.length).toBeGreaterThan(0);
    });

    test("resolves endpoints from captured traffic for unknown vendors", async () => {
        const repo = repoWithCharge();
        const site = callSite({ endpoint: undefined, httpMethod: undefined });
        const traffic = [capture({ amount: 1 }, { id: "ch_1" })];

        const store = mockSnapshotStore(null);
        const result = await withStubs(
            {
                sitesForFile: () => [site],
                suite: async () => suiteResult(traffic),
            },
            () =>
                analyzeAndCompare({
                    repoPath: repo,
                    command: "npm test",
                    snapshotStore: store,
                }),
        );

        expect(result.fills.size).toBe(1);
    });

    test("handles multiple call sites with separate baselines and drifts", async () => {
        const repo = mkdtempSync(join(tmpdir(), "driftlock-runner-"));
        mkdirSync(join(repo, "src"), { recursive: true });
        writeFileSync(join(repo, "src", "charge.ts"), "stripe.charges.create({ amount: 1 });");
        writeFileSync(join(repo, "src", "refund.ts"), "stripe.refunds.create({ charge: 'ch_1' });");

        const siteA = callSite({ id: "cs-1", filePath: join("src", "charge.ts") });
        const siteB = callSite({ id: "cs-2", filePath: join("src", "refund.ts"), method: "stripe.refunds.create", endpoint: "/v1/refunds" });
        const traffic = [
            capture({ amount: 1 }, { id: "ch_1" }),
            { ...capture({ charge: "ch_1" }, { id: "re_1" }), url: "https://api.stripe.com/v1/refunds" },
        ];

        const store = mockSnapshotStore(null);
        const result = await withStubs(
            {
                sitesForFile: (filePath: string) =>
                    filePath.includes("charge.ts") ? [siteA] : [siteB],
                suite: async () => suiteResult(traffic, { duration: 20 }),
            },
            () =>
                analyzeAndCompare({
                    repoPath: repo,
                    command: "npm test",
                    snapshotStore: store,
                }),
        );

        expect(result.callSites.length).toBe(2);
        expect(result.baselines.length).toBe(2);
        expect(result.shapes.size).toBe(2);
        expect(result.shapes.has("cs-1")).toBe(true);
        expect(result.shapes.has("cs-2")).toBe(true);
    });

    test("records non-zero exit code from sandbox", async () => {
        const repo = repoWithCharge();
        const site = callSite();
        const traffic = [capture({ amount: 1 }, { id: "ch_1" })];

        const store = mockSnapshotStore(null);
        const result = await withStubs(
            {
                sitesForFile: () => [site],
                suite: async () => suiteResult(traffic, { exitCode: 1, duration: 100 }),
            },
            () =>
                analyzeAndCompare({
                    repoPath: repo,
                    command: "npm test",
                    snapshotStore: store,
                }),
        );

        expect(result.exitCode).toBe(1);
        expect(result.duration).toBe(100);
    });

    test("passes forward options to sandbox safety whitelist", async () => {
        const repo = repoWithCharge();
        const site = callSite();

        // Boxed: TS narrows a closure-assigned `let` to its initializer.
        const seen: { config: SandboxConfig | null } = { config: null };
        const store = mockSnapshotStore(null);
        await withStubs(
            {
                sitesForFile: () => [site],
                suite: async (_repo: string, config: SandboxConfig) => {
                    seen.config = config;
                    return suiteResult([]);
                },
            },
            () =>
                analyzeAndCompare({
                    repoPath: repo,
                    command: "npm test",
                    forward: ["POST /v3/mail/send", "GET /v1/balance"],
                    snapshotStore: store,
                }),
        );

        if (!seen.config?.safety) throw new Error("sandbox was not called with a safety whitelist");
        expect(seen.config.safety.whitelist).toEqual(["POST /v3/mail/send", "GET /v1/balance"]);
    });

    test("saves snapshot on first run and loads it on second run", async () => {
        const repo = repoWithCharge();
        const site = callSite();
        const traffic = [capture({ amount: 1 }, { id: "ch_1" })];

        const snapshots = new Map<string, CapturedShapes>();
        const store: SnapshotStore = {
            load: mock(async (id: string) => snapshots.get(id) ?? null),
            save: mock(async (id: string, shapes: CapturedShapes) => {
                snapshots.set(id, shapes);
            }),
        };

        const stubs = {
            sitesForFile: () => [site],
            suite: async () => suiteResult(traffic),
        };
        const first = await withStubs(stubs, () =>
            analyzeAndCompare({
                repoPath: repo,
                command: "npm test",
                snapshotStore: store,
            }),
        );
        expect(first.baselines.length).toBe(1);
        expect(first.drifts.length).toBe(0);
        expect(store.save).toHaveBeenCalledTimes(1);

        const second = await withStubs(stubs, () =>
            analyzeAndCompare({
                repoPath: repo,
                command: "npm test",
                snapshotStore: store,
            }),
        );
        expect(second.baselines.length).toBe(0);
        expect(store.load).toHaveBeenCalledTimes(2);
    });

    test("skips call sites with no matching traffic capture", async () => {
        const repo = repoWithCharge();
        const site = callSite();

        const store = mockSnapshotStore(null);
        const result = await withStubs(
            {
                sitesForFile: () => [site],
                suite: async () => suiteResult([]),
            },
            () =>
                analyzeAndCompare({
                    repoPath: repo,
                    command: "npm test",
                    snapshotStore: store,
                }),
        );

        expect(result.callSites.length).toBe(1);
        expect(result.shapes.size).toBe(0);
        expect(result.baselines.length).toBe(0);
        expect(result.drifts.length).toBe(0);
        expect(result.trafficCaptured).toBe(0);
    });
});
