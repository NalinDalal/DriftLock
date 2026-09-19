import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { mock } from "bun:test";
import type { CallSite } from "@driftlock/core";
import type { TrafficCapture } from "@driftlock/sandbox";
import type { SnapshotStore, CapturedShapes } from "../snapshots";
import { analyzeAndCompare } from "../runner";

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
        const repo = mkdtempSync(join(tmpdir(), "driftlock-runner-"));
        mkdirSync(join(repo, "src"), { recursive: true });
        writeFileSync(join(repo, "src", "charge.ts"), "stripe.charges.create({ amount: 1 });");
        const site = callSite({ filePath: join("src", "charge.ts") });
        const traffic = [capture({ amount: 1 }, { id: "ch_1" })];

        mock.module("@driftlock/parser", () => ({
            TypeScriptExtractor: mock(() => ({
                extractFromFile: mock(async () => ({ callSites: [site] })),
            })),
            detectLanguage: mock(() => "typescript"),
        }));

        mock.module("@driftlock/sandbox", () => ({
            SandboxRunner: mock(() => ({
                runTestSuite: mock(async () => ({
                    exitCode: 0,
                    duration: 10,
                    trafficCaptured: traffic,
                })),
            })),
        }));

        const store = mockSnapshotStore(null);
        const result = await analyzeAndCompare({
            repoPath: repo,
            command: "npm test",
            snapshotStore: store,
        });

        expect(result.callSites.length).toBe(1);
        expect(result.baselines.length).toBe(1);
        expect(result.drifts.length).toBe(0);
        expect(result.shapes.get("cs-1")?.request.amount?.kind).toBe("number");
        expect(result.shapes.get("cs-1")?.response.id?.kind).toBe("string");
    });

    test("detects drift when a response field is removed", async () => {
        const repo = mkdtempSync(join(tmpdir(), "driftlock-runner-"));
        mkdirSync(join(repo, "src"), { recursive: true });
        writeFileSync(join(repo, "src", "charge.ts"), "stripe.charges.create({ amount: 1 });");
        const site = callSite({ filePath: join("src", "charge.ts") });
        const traffic = [capture({ amount: 1 }, { id: "ch_1" })];

        mock.module("@driftlock/parser", () => ({
            TypeScriptExtractor: mock(() => ({
                extractFromFile: mock(async () => ({ callSites: [site] })),
            })),
            detectLanguage: mock(() => "typescript"),
        }));

        mock.module("@driftlock/sandbox", () => ({
            SandboxRunner: mock(() => ({
                runTestSuite: mock(async () => ({
                    exitCode: 0,
                    duration: 10,
                    trafficCaptured: traffic,
                })),
            })),
        }));

        const baseline: CapturedShapes = {
            request: { amount: { kind: "number" } },
            response: { id: { kind: "string" }, status: { kind: "string" } },
        };
        const store = mockSnapshotStore(baseline);

        const result = await analyzeAndCompare({
            repoPath: repo,
            command: "npm test",
            snapshotStore: store,
        });

        expect(result.callSites.length).toBe(1);
        expect(result.baselines.length).toBe(0);
        expect(result.drifts.length).toBe(1);
        expect(result.drifts[0].works.length).toBeGreaterThan(0);
    });

    test("resolves endpoints from captured traffic for unknown vendors", async () => {
        const repo = mkdtempSync(join(tmpdir(), "driftlock-runner-"));
        mkdirSync(join(repo, "src"), { recursive: true });
        writeFileSync(join(repo, "src", "charge.ts"), "stripe.charges.create({ amount: 1 });");
        const site = callSite({ endpoint: undefined, httpMethod: undefined });
        const traffic = [capture({ amount: 1 }, { id: "ch_1" })];

        mock.module("@driftlock/parser", () => ({
            TypeScriptExtractor: mock(() => ({
                extractFromFile: mock(async () => ({ callSites: [site] })),
            })),
            detectLanguage: mock(() => "typescript"),
        }));

        mock.module("@driftlock/sandbox", () => ({
            SandboxRunner: mock(() => ({
                runTestSuite: mock(async () => ({
                    exitCode: 0,
                    duration: 10,
                    trafficCaptured: traffic,
                })),
            })),
        }));

        const store = mockSnapshotStore(null);
        const result = await analyzeAndCompare({
            repoPath: repo,
            command: "npm test",
            snapshotStore: store,
        });

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

        mock.module("@driftlock/parser", () => ({
            TypeScriptExtractor: mock(() => ({
                extractFromFile: mock(async (filePath: string) => {
                    if (filePath.includes("charge.ts")) {
                        return { callSites: [siteA] };
                    }
                    return { callSites: [siteB] };
                }),
            })),
            detectLanguage: mock(() => "typescript"),
        }));

        mock.module("@driftlock/sandbox", () => ({
            SandboxRunner: mock(() => ({
                runTestSuite: mock(async () => ({
                    exitCode: 0,
                    duration: 20,
                    trafficCaptured: traffic,
                })),
            })),
        }));

        const store = mockSnapshotStore(null);
        const result = await analyzeAndCompare({
            repoPath: repo,
            command: "npm test",
            snapshotStore: store,
        });

        expect(result.callSites.length).toBe(2);
        expect(result.baselines.length).toBe(2);
        expect(result.shapes.size).toBe(2);
        expect(result.shapes.has("cs-1")).toBe(true);
        expect(result.shapes.has("cs-2")).toBe(true);
    });

    test("records non-zero exit code from sandbox", async () => {
        const repo = mkdtempSync(join(tmpdir(), "driftlock-runner-"));
        mkdirSync(join(repo, "src"), { recursive: true });
        writeFileSync(join(repo, "src", "charge.ts"), "stripe.charges.create({ amount: 1 });");
        const site = callSite();
        const traffic = [capture({ amount: 1 }, { id: "ch_1" })];

        mock.module("@driftlock/parser", () => ({
            TypeScriptExtractor: mock(() => ({
                extractFromFile: mock(async () => ({ callSites: [site] })),
            })),
            detectLanguage: mock(() => "typescript"),
        }));

        mock.module("@driftlock/sandbox", () => ({
            SandboxRunner: mock(() => ({
                runTestSuite: mock(async () => ({
                    exitCode: 1,
                    duration: 100,
                    trafficCaptured: traffic,
                })),
            })),
        }));

        const store = mockSnapshotStore(null);
        const result = await analyzeAndCompare({
            repoPath: repo,
            command: "npm test",
            snapshotStore: store,
        });

        expect(result.exitCode).toBe(1);
        expect(result.duration).toBe(100);
    });

    test("passes forward options to sandbox safety whitelist", async () => {
        const repo = mkdtempSync(join(tmpdir(), "driftlock-runner-"));
        mkdirSync(join(repo, "src"), { recursive: true });
        writeFileSync(join(repo, "src", "charge.ts"), "stripe.charges.create({ amount: 1 });");
        const site = callSite();

        mock.module("@driftlock/parser", () => ({
            TypeScriptExtractor: mock(() => ({
                extractFromFile: mock(async () => ({ callSites: [site] })),
            })),
            detectLanguage: mock(() => "typescript"),
        }));

        let capturedConfig: unknown = null;
        mock.module("@driftlock/sandbox", () => ({
            SandboxRunner: mock(() => ({
                runTestSuite: mock(async (_repo: string, config: unknown) => {
                    capturedConfig = config;
                    return {
                        exitCode: 0,
                        duration: 5,
                        trafficCaptured: [],
                    };
                }),
            })),
        }));

        const store = mockSnapshotStore(null);
        await analyzeAndCompare({
            repoPath: repo,
            command: "npm test",
            forward: ["POST /v3/mail/send", "GET /v1/balance"],
            snapshotStore: store,
        });

        expect(capturedConfig).toBeDefined();
        const cfg = capturedConfig as { safety: { whitelist: string[] } };
        expect(cfg.safety.whitelist).toEqual(["POST /v3/mail/send", "GET /v1/balance"]);
    });

    test("saves snapshot on first run and loads it on second run", async () => {
        const repo = mkdtempSync(join(tmpdir(), "driftlock-runner-"));
        mkdirSync(join(repo, "src"), { recursive: true });
        writeFileSync(join(repo, "src", "charge.ts"), "stripe.charges.create({ amount: 1 });");
        const site = callSite();
        const traffic = [capture({ amount: 1 }, { id: "ch_1" })];

        mock.module("@driftlock/parser", () => ({
            TypeScriptExtractor: mock(() => ({
                extractFromFile: mock(async () => ({ callSites: [site] })),
            })),
            detectLanguage: mock(() => "typescript"),
        }));

        mock.module("@driftlock/sandbox", () => ({
            SandboxRunner: mock(() => ({
                runTestSuite: mock(async () => ({
                    exitCode: 0,
                    duration: 10,
                    trafficCaptured: traffic,
                })),
            })),
        }));

        const snapshots = new Map<string, CapturedShapes>();
        const store: SnapshotStore = {
            load: mock(async (id: string) => snapshots.get(id) ?? null),
            save: mock(async (id: string, shapes: CapturedShapes) => {
                snapshots.set(id, shapes);
            }),
        };

        const first = await analyzeAndCompare({
            repoPath: repo,
            command: "npm test",
            snapshotStore: store,
        });
        expect(first.baselines.length).toBe(1);
        expect(first.drifts.length).toBe(0);
        expect(store.save).toHaveBeenCalledTimes(1);

        const second = await analyzeAndCompare({
            repoPath: repo,
            command: "npm test",
            snapshotStore: store,
        });
        expect(second.baselines.length).toBe(0);
        expect(store.load).toHaveBeenCalledTimes(2);
    });

    test("skips call sites with no matching traffic capture", async () => {
        const repo = mkdtempSync(join(tmpdir(), "driftlock-runner-"));
        mkdirSync(join(repo, "src"), { recursive: true });
        writeFileSync(join(repo, "src", "charge.ts"), "stripe.charges.create({ amount: 1 });");
        const site = callSite();

        mock.module("@driftlock/parser", () => ({
            TypeScriptExtractor: mock(() => ({
                extractFromFile: mock(async () => ({ callSites: [site] })),
            })),
            detectLanguage: mock(() => "typescript"),
        }));

        mock.module("@driftlock/sandbox", () => ({
            SandboxRunner: mock(() => ({
                runTestSuite: mock(async () => ({
                    exitCode: 0,
                    duration: 10,
                    trafficCaptured: [],
                })),
            })),
        }));

        const store = mockSnapshotStore(null);
        const result = await analyzeAndCompare({
            repoPath: repo,
            command: "npm test",
            snapshotStore: store,
        });

        expect(result.callSites.length).toBe(1);
        expect(result.shapes.size).toBe(0);
        expect(result.baselines.length).toBe(0);
        expect(result.drifts.length).toBe(0);
        expect(result.trafficCaptured).toBe(0);
    });
});
