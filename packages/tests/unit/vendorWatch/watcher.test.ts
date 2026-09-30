import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VendorConfig } from "@driftlock/core";
import {
    checkVendor,
    FileVendorBaselineStore,
    MemoryVendorBaselineStore,
    observedDriftFromChange,
    type VendorChange,
} from "@driftlock/vendorWatch";
import type { VendorContract } from "@driftlock/agent";

const vendor: VendorConfig = {
    name: "stripe",
    sdk: "stripe",
    clientNames: ["stripe"],
    basePath: "/v1",
};

function contract(members: string[], version = "1"): VendorContract {
    return {
        provider: "stripe",
        version,
        source: "spec",
        authority: "authoritative",
        origin: "https://example.test/spec.json",
        capturedAt: "2026-01-01T00:00:00.000Z",
        members,
        removed: [],
    };
}

function poller(members: string[], version = "1") {
    return async () => ({ contract: contract(members, version), note: "stub" });
}

describe("checkVendor", () => {
    test("first poll records the baseline and triggers nothing", async () => {
        const store = new MemoryVendorBaselineStore();
        const change = await checkVendor(vendor, "1", store, {
            poll: poller(["id", "source"]),
        });
        expect(change).toBeNull();
        expect((await store.load("stripe"))?.members).toEqual(["id", "source"]);
    });

    test("a removed member returns a change naming it", async () => {
        const store = new MemoryVendorBaselineStore();
        await checkVendor(vendor, "1", store, { poll: poller(["id", "source"]) });
        const change = await checkVendor(vendor, "2", store, {
            poll: poller(["id", "payment_method"], "2"),
        });
        expect(change?.removed).toEqual(["source"]);
        expect(change?.added).toEqual(["payment_method"]);
        expect(change?.fromVersion).toBe("1");
        expect(change?.toVersion).toBe("2");
    });

    test("additions alone move the baseline forward without triggering", async () => {
        const store = new MemoryVendorBaselineStore();
        await checkVendor(vendor, "1", store, { poll: poller(["id"]) });
        const change = await checkVendor(vendor, "2", store, {
            poll: poller(["id", "status"], "2"),
        });
        expect(change).toBeNull();
        expect((await store.load("stripe"))?.members).toEqual(["id", "status"]);
    });

    test("an unchanged spec triggers nothing", async () => {
        const store = new MemoryVendorBaselineStore();
        await checkVendor(vendor, "1", store, { poll: poller(["id"]) });
        const change = await checkVendor(vendor, "1", store, { poll: poller(["id"]) });
        expect(change).toBeNull();
    });

    test("a poll failure propagates instead of faking a change", async () => {
        const store = new MemoryVendorBaselineStore();
        await expect(
            checkVendor(vendor, "1", store, {
                poll: async () => {
                    throw new Error("No contract source for stripe");
                },
            }),
        ).rejects.toThrow(/No contract source/);
        expect(await store.load("stripe")).toBeNull();
    });
});

describe("FileVendorBaselineStore", () => {
    test("round-trips a contract across instances", async () => {
        const dir = await mkdtemp(join(tmpdir(), "driftlock-baselines-"));
        try {
            const first = new FileVendorBaselineStore(dir);
            expect(await first.load("stripe")).toBeNull();
            await first.save(contract(["id", "source"]));
            const second = new FileVendorBaselineStore(dir);
            expect((await second.load("stripe"))?.members).toEqual(["id", "source"]);
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });

    test("a corrupt file reads as no baseline, not a throw", async () => {
        const dir = await mkdtemp(join(tmpdir(), "driftlock-baselines-"));
        try {
            await Bun.write(join(dir, "stripe.json"), "not json{");
            const store = new FileVendorBaselineStore(dir);
            expect(await store.load("stripe")).toBeNull();
        } finally {
            await rm(dir, { recursive: true, force: true });
        }
    });
});

describe("observedDriftFromChange", () => {
    test("maps the change to drift the packet builder consumes", () => {
        const change: VendorChange = {
            provider: "stripe",
            fromVersion: "1",
            toVersion: "2",
            removed: ["source"],
            added: ["payment_method"],
            contract: contract(["id", "payment_method"], "2"),
            note: "stub",
        };
        const drift = observedDriftFromChange(change, ["https://example.test/changelog"]);
        expect(drift.provider).toBe("stripe");
        expect(drift.removed).toEqual(["source"]);
        expect(drift.added).toEqual(["payment_method"]);
        expect(drift.docs).toEqual(["https://example.test/changelog"]);
    });
});
