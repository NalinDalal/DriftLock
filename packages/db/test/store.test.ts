import { beforeAll, describe, expect, test } from "bun:test";
import { createDb, createStore } from "../index";

const dbUrl = process.env.DATABASE_URL;
const describeDb = dbUrl ? describe : describe.skip;

describeDb("store", () => {
    let repoId: string;
    let csId = "cs-integration-test";

    beforeAll(async () => {
        const db = createDb(dbUrl!);
        const store = createStore(db);
        const suffix = Date.now().toString(36);
        const repo = await store.ensureRepository({
            owner: "test-owner",
            name: `store-test-${suffix}`,
            fullName: `test-owner/store-test-${suffix}`,
            description: "integration test",
        });
        repoId = repo.id;
        csId = `cs-integration-${suffix}`;
        await db.$client.end();
    });

    test("repository lifecycle and call sites", async () => {
        const db = createDb(dbUrl!);
        const store = createStore(db);
        const repo = await store.getRepositoryById(repoId);
        expect(repo?.name).toContain("store-test-");
        await store.upsertCallSite(repoId, {
            id: csId,
            filePath: "src/handler.ts",
            line: 40,
            method: "api.call",
            endpoint: "/v1/data",
            httpMethod: "POST",
            requestShape: { body: { kind: "string" } },
            responseFields: ["id"],
        });
        const sites = await store.listCallSites(repoId);
        expect(sites.some((s) => s.id === csId)).toBe(true);
        await db.$client.end();
    });

    test("snapshot roundtrip and latest", async () => {
        const db = createDb(dbUrl!);
        const store = createStore(db);
        const snap = await store.saveSnapshot({
            callSiteId: csId,
            testCommand: "bun test",
            exitCode: 0,
            duration: 50,
            trafficCaptured: 2,
            requestShape: { body: { kind: "string" } },
            responseShape: { id: { kind: "string" } },
        });
        const latest = await store.getLatestSnapshot(csId);
        expect(latest?.id).toBe(snap.id);
        await db.$client.end();
    });

    test("drift recording, listing, stats, api keys", async () => {
        const db = createDb(dbUrl!);
        const store = createStore(db);
        const snap = await store.getLatestSnapshot(csId);
        await store.recordDrift({
            id: `drift-${Date.now()}`,
            callSiteId: csId,
            oldSnapshotId: snap!.id,
            newSnapshotId: snap!.id,
            diffSummary: { breakingChanges: ["removed field"] },
            suggestedFix: null,
            confidence: "high",
            prNumber: null,
            status: "detected",
        });
        const open = await store.listOpenDriftsByRepo(repoId);
        expect(open.length).toBeGreaterThan(0);
        const stats = await store.countStats(repoId);
        expect(stats.driftOpen).toBeGreaterThan(0);
        const accounts = await store.listAccounts();
        expect(accounts.some((a) => a.owner === "test-owner")).toBe(true);
        const key = await store.createApiKey("integration-test");
        const found = await store.findApiKey(key.raw);
        expect(found).toBeDefined();
        await db.$client.end();
    });
});