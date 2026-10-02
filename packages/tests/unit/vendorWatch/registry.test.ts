import { describe, expect, test } from "bun:test";
import type { VendorConfig } from "@driftlock/core";
import type { RepoFacts } from "@driftlock/agent";
import {
    checkVendorPackageDrift,
    compareVersions,
    fetchLatestVersion,
    MemoryRegistryCache,
    RegistryError,
    stripRange,
} from "@driftlock/vendorWatch";

function facts(deps: Record<string, string>, resolved: Record<string, string> = {}): RepoFacts {
    return {
        ecosystem: "npm",
        ecosystemSupport: "parsed",
        alsoDetected: [],
        packageManager: "npm",
        manifests: ["package.json"],
        lockfiles: ["package-lock.json"],
        scripts: {},
        dependencies: deps,
        resolvedVersions: resolved,
        frameworks: [],
        ci: [],
        verificationCommands: [],
        sourceFiles: [],
        totalSourceFiles: 0,
        warnings: [],
    };
}

const stripe: VendorConfig = {
    name: "stripe",
    sdk: "stripe",
    clientNames: ["stripe"],
    basePath: "/v1",
};

function stubFetch(payload: unknown, seen: { url?: string; count: number }) {
    return (async (url: string) => {
        seen.url = url;
        seen.count += 1;
        return { ok: true, status: 200, json: async () => payload };
    }) as unknown as typeof fetch;
}

describe("stripRange", () => {
    test("strips caret, tilde, comparators, and v prefix", () => {
        expect(stripRange("^17.4.0")).toBe("17.4.0");
        expect(stripRange("~1.2.3")).toBe("1.2.3");
        expect(stripRange(">=1.2.3")).toBe("1.2.3");
        expect(stripRange("v2.0.0")).toBe("2.0.0");
        expect(stripRange("18.1.0")).toBe("18.1.0");
    });
});

describe("compareVersions", () => {
    test("orders dotted versions numerically, not lexicographically", () => {
        expect(compareVersions("18.1.0", "17.4.0")).toBeGreaterThan(0);
        expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
        expect(compareVersions("1.9.0", "1.10.0")).toBeLessThan(0);
        expect(compareVersions("2.0.0", "2.0.0-beta.1")).toBeGreaterThan(0);
    });
});

describe("fetchLatestVersion", () => {
    test("reads the npm latest endpoint", async () => {
        const seen = { count: 0 };
        const { latest, origin } = await fetchLatestVersion("stripe", "npm", {
            fetchFn: stubFetch({ version: "18.1.0" }, seen),
        });
        expect(latest).toBe("18.1.0");
        expect(origin).toBe("https://registry.npmjs.org/stripe/latest");
        expect(seen.count).toBe(1);
    });

    test("keeps scoped names in canonical form", async () => {
        const seen = { count: 0 };
        const { origin } = await fetchLatestVersion("@acme/sdk", "npm", {
            fetchFn: stubFetch({ version: "1.0.0" }, seen),
        });
        expect(origin).toBe("https://registry.npmjs.org/@acme%2fsdk/latest");
    });

    test("reads crates.io, PyPI, and Go proxy shapes", async () => {
        const seen = { count: 0 };
        await expect(
            fetchLatestVersion("serde", "rust", {
                fetchFn: stubFetch({ crate: { max_stable_version: "1.0.228" } }, seen),
            }),
        ).resolves.toMatchObject({ latest: "1.0.228" });
        await expect(
            fetchLatestVersion("requests", "python", {
                fetchFn: stubFetch({ info: { version: "2.32.3" } }, seen),
            }),
        ).resolves.toMatchObject({ latest: "2.32.3" });
        await expect(
            fetchLatestVersion("example.com/mod", "go", {
                fetchFn: stubFetch({ Version: "v1.2.3" }, seen),
            }),
        ).resolves.toMatchObject({ latest: "1.2.3" });
    });

    test("a cache hit skips the network", async () => {
        const seen = { count: 0 };
        const cache = new MemoryRegistryCache(60_000);
        const opts = { fetchFn: stubFetch({ version: "18.1.0" }, seen), cache };
        await fetchLatestVersion("stripe", "npm", opts);
        await fetchLatestVersion("stripe", "npm", opts);
        expect(seen.count).toBe(1);
    });

    test("expired entries refetch", async () => {
        const seen = { count: 0 };
        let now = 1_000;
        const cache = new MemoryRegistryCache(60_000, () => now);
        const opts = { fetchFn: stubFetch({ version: "18.1.0" }, seen), cache };
        await fetchLatestVersion("stripe", "npm", opts);
        now += 61_000;
        await fetchLatestVersion("stripe", "npm", opts);
        expect(seen.count).toBe(2);
    });

    test("redirects and errors throw RegistryError instead of guessing", async () => {
        const redirect = (async () => ({ ok: false, status: 302 })) as unknown as typeof fetch;
        await expect(fetchLatestVersion("stripe", "npm", { fetchFn: redirect })).rejects.toBeInstanceOf(
            RegistryError,
        );
        const serverError = (async () => ({
            ok: false,
            status: 500,
            json: async () => ({}),
        })) as unknown as typeof fetch;
        await expect(
            fetchLatestVersion("stripe", "npm", { fetchFn: serverError }),
        ).rejects.toThrow(/returned 500/);
        await expect(fetchLatestVersion("  ", "npm")).rejects.toBeInstanceOf(RegistryError);
    });
});

describe("checkVendorPackageDrift", () => {
    function driftFor(pinned: string, latest: string) {
        return checkVendorPackageDrift(facts({ stripe: pinned }, { stripe: pinned }), stripe, {
            fetchFn: stubFetch({ version: latest }, { count: 0 }),
        });
    }

    test("reports drift when the registry is newer than the pin", async () => {
        const drift = await driftFor("17.4.0", "18.1.0");
        expect(drift.drift).toBe(true);
        expect(drift.pinned).toBe("17.4.0");
        expect(drift.latest).toBe("18.1.0");
    });

    test("reports current when pinned equals latest, ranges stripped", async () => {
        const drift = await driftFor("^18.1.0", "18.1.0");
        expect(drift.drift).toBe(false);
        expect(drift.pinned).toBe("18.1.0");
    });

    test("an undeclared SDK is not drift, with latest noted", async () => {
        const drift = await checkVendorPackageDrift(facts({}), stripe, {
            fetchFn: stubFetch({ version: "18.1.0" }, { count: 0 }),
        });
        expect(drift.drift).toBe(false);
        expect(drift.pinned).toBeUndefined();
        expect(drift.latest).toBe("18.1.0");
    });

    test("an ecosystem with no registry mapping throws", async () => {
        const unknown = { ...facts({ stripe: "1.0.0" }), ecosystem: "ruby" };
        await expect(checkVendorPackageDrift(unknown, stripe)).rejects.toBeInstanceOf(RegistryError);
    });
});
