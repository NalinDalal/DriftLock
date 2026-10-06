import { describe, expect, test } from "bun:test";
import {
    readWatchConfig,
    runWatchTick,
    startWatchScheduler,
    type WatchConfig,
} from "@driftlock/be/src/watch";
import { STRIPE_VENDOR } from "@driftlock/core";

function baseConfig(over: Partial<WatchConfig> = {}): WatchConfig {
    return {
        enabled: true,
        intervalMs: 3_600_000,
        vendors: [STRIPE_VENDOR],
        baselinesDir: "/tmp/driftlock-test-baselines",
        tier: "pro",
        maxRepos: 50,
        concurrency: 2,
        ...over,
    };
}

describe("readWatchConfig", () => {
    test("disabled by default (safe rollout; rollback is unsetting the var)", () => {
        expect(readWatchConfig({}).enabled).toBe(false);
    });

    test("clamps tiny intervals so a typo cannot hot-loop the poll", () => {
        expect(readWatchConfig({ WATCH_INTERVAL_MS: "5" }).intervalMs).toBe(60_000);
    });

    test("drops unknown vendors instead of failing the whole loop", () => {
        const config = readWatchConfig({ WATCH_VENDORS: "stripe,acme" });
        expect(config.vendors.map((v) => v.name)).toEqual([STRIPE_VENDOR.name]);
    });

    test("unknown plan fails closed to free (a typo must never grant publishing)", () => {
        expect(readWatchConfig({ DRIFTLOCK_PLAN: "free" }).tier).toBe("free");
        expect(readWatchConfig({ DRIFTLOCK_PLAN: "enterprise" }).tier).toBe("free");
        expect(readWatchConfig({}).tier).toBe("pro");
    });
});

describe("runWatchTick", () => {
    test("no breaking change means no migrations and no clones", async () => {
        let polls = 0;
        let clones = 0;
        const result = await runWatchTick(baseConfig(), {
            poll: (async () => {
                polls++;
                return null;
            }) as never,
            listWatchedRepos: async () => [{ owner: "a", name: "b", base: "main" }],
            clone: (async () => {
                clones++;
                return { path: "/tmp/x", cleanup: async () => {} };
            }) as never,
        });
        expect(polls).toBe(1);
        expect(clones).toBe(0);
        expect(result.migrations).toEqual([]);
        expect(result.breakingVendors).toEqual([]);
    });

    test("breaking change migrates every watched repo and records PR urls", async () => {
        const change = {
            provider: "stripe",
            fromVersion: "v1",
            toVersion: "v2",
            removed: ["source"],
            added: ["payment_method"],
            contract: { provider: "stripe" },
            note: "staged",
        };
        const result = await runWatchTick(baseConfig({ githubToken: "tok" }), {
            poll: (async () => change) as never,
            listWatchedRepos: async () => [
                { owner: "a", name: "one", base: "main" },
                { owner: "a", name: "two", base: "main" },
            ],
            clone: (async (owner: string, name: string) => ({
                path: `/tmp/${name}`,
                cleanup: async () => {},
            })) as never,
            migrate: (async () => ({
                outcome: "migrated",
                filesChanged: ["src/payment.ts"],
                state: { pullRequest: { url: "https://pr/1", number: 1, branch: "b" } },
            })) as never,
        });
        expect(result.breakingVendors).toEqual([STRIPE_VENDOR.name]);
        expect(result.migrations).toHaveLength(2);
        expect(result.migrations[0]).toMatchObject({
            repo: "a/one",
            outcome: "migrated",
            prUrl: "https://pr/1",
        });
    });

    test("unwatched repos are never cloned or migrated", async () => {
        const change = {
            provider: "stripe",
            fromVersion: "v1",
            toVersion: "v2",
            removed: ["source"],
            added: [],
            contract: { provider: "stripe" },
            note: "staged",
        };
        let migrates = 0;
        const result = await runWatchTick(baseConfig(), {
            poll: (async () => change) as never,
            listWatchedRepos: async () => [],
            migrate: (async () => {
                migrates++;
                return { outcome: "migrated", filesChanged: [], state: {} };
            }) as never,
        });
        expect(migrates).toBe(0);
        expect(result.migrations).toEqual([]);
        expect(result.breakingVendors).toHaveLength(1);
    });

    test("a failed poll logs and continues instead of killing the tick", async () => {
        const result = await runWatchTick(
            { ...baseConfig(), vendors: [STRIPE_VENDOR, STRIPE_VENDOR] },
            { poll: (async () => { throw new Error("spec down"); }) as never },
        );
        expect(result.breakingVendors).toEqual([]);
        expect(result.migrations).toEqual([]);
        expect(result.vendorsChecked).toHaveLength(2);
    });

    test("repos beyond maxRepos are skipped, oldest first", async () => {
        const change = {
            provider: "stripe",
            fromVersion: "v1",
            toVersion: "v2",
            removed: ["source"],
            added: [],
            contract: { provider: "stripe" },
            note: "staged",
        };
        const seen: string[] = [];
        const result = await runWatchTick(baseConfig({ maxRepos: 2 }), {
            poll: (async () => change) as never,
            listWatchedRepos: async () => [
                { owner: "a", name: "one", base: "main" },
                { owner: "a", name: "two", base: "main" },
                { owner: "a", name: "three", base: "main" },
            ],
            clone: (async (_o: string, name: string) => {
                seen.push(name);
                return { path: `/tmp/${name}`, cleanup: async () => {} };
            }) as never,
            migrate: (async () => ({
                outcome: "no_action",
                filesChanged: [],
                state: {},
            })) as never,
        });
        expect(seen).toEqual(["one", "two"]);
        expect(result.migrations.map((m) => m.repo)).toEqual(["a/one", "a/two"]);
    });

    test("concurrency bounds parallel migrations and one failure never aborts the batch", async () => {        const change = {
            provider: "stripe",
            fromVersion: "v1",
            toVersion: "v2",
            removed: ["source"],
            added: [],
            contract: { provider: "stripe" },
            note: "staged",
        };
        let inFlight = 0;
        let peak = 0;
        const result = await runWatchTick(baseConfig({ concurrency: 2 }), {
            poll: (async () => change) as never,
            listWatchedRepos: async () => [
                { owner: "a", name: "one", base: "main" },
                { owner: "a", name: "two", base: "main" },
                { owner: "a", name: "three", base: "main" },
                { owner: "a", name: "four", base: "main" },
            ],
            clone: (async (_o: string, name: string) => ({
                path: `/tmp/${name}`,
                cleanup: async () => {},
            })) as never,
            migrate: (async (_v: unknown, _c: unknown, opts: { root: string }) => {
                inFlight++;
                peak = Math.max(peak, inFlight);
                await new Promise((r) => setTimeout(r, 10));
                inFlight--;
                if (opts.root.endsWith("two")) throw new Error("clone lost power");
                return { outcome: "no_action", filesChanged: [], state: {} };
            }) as never,
        });
        expect(peak).toBeLessThanOrEqual(2);
        expect(result.migrations).toHaveLength(3);
    });

    test("each repo migration is recorded with outcome and PR url", async () => {
        const change = {
            provider: "stripe",
            fromVersion: "v1",
            toVersion: "v2",
            removed: ["source"],
            added: ["payment_method"],
            contract: { provider: "stripe" },
            note: "staged",
        };
        const records: Array<{ repo: string; outcome: string; prUrl?: string; ok: boolean }> = [];
        await runWatchTick(baseConfig(), {
            poll: (async () => change) as never,
            listWatchedRepos: async () => [{ owner: "a", name: "one", base: "main" }],
            clone: (async () => ({ path: "/tmp/one", cleanup: async () => {} })) as never,
            migrate: (async () => ({
                outcome: "migrated",
                filesChanged: ["src/payment.ts"],
                state: { pullRequest: { url: "https://pr/1", number: 1, branch: "b" } },
            })) as never,
            recordTick: (async (repo, entry) => {
                records.push({ repo: `${repo.owner}/${repo.name}`, outcome: entry.outcome, prUrl: entry.prUrl, ok: entry.ok });
            }) as never,
        });
        expect(records).toEqual([{ repo: "a/one", outcome: "migrated", prUrl: "https://pr/1", ok: true }]);
    });

    test("a failed repo migration is recorded as failed and the batch continues", async () => {
        const change = {
            provider: "stripe",
            fromVersion: "v1",
            toVersion: "v2",
            removed: ["source"],
            added: [],
            contract: { provider: "stripe" },
            note: "staged",
        };
        const records: Array<{ repo: string; ok: boolean }> = [];
        const result = await runWatchTick(baseConfig(), {
            poll: (async () => change) as never,
            listWatchedRepos: async () => [
                { owner: "a", name: "bad", base: "main" },
                { owner: "a", name: "good", base: "main" },
            ],
            clone: (async (_o: string, name: string) => ({
                path: `/tmp/${name}`,
                cleanup: async () => {},
            })) as never,
            migrate: (async (_v: unknown, _c: unknown, opts: { root: string }) => {
                if (opts.root.endsWith("/bad")) throw new Error("boom");
                return { outcome: "no_action", filesChanged: [], state: {} };
            }) as never,
            recordTick: (async (repo, entry) => {
                records.push({ repo: repo.name, ok: entry.ok });
            }) as never,
        });
        expect(records).toEqual([
            { repo: "bad", ok: false },
            { repo: "good", ok: true },
        ]);
        expect(result.migrations).toHaveLength(1);
    });
});

describe("startWatchScheduler", () => {
    test("returns a no-op stopper when disabled and runs nothing", () => {
        let polls = 0;
        const stop = startWatchScheduler(
            { WATCH_ENABLED: "false" },
            { poll: (async () => { polls++; return null; }) as never },
        );
        stop();
        expect(polls).toBe(0);
    });
});
