import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VendorContract } from "@driftlock/agent";
import { runWatch } from "@driftlock/cli/watch";

function stub(members: string[], version = "2") {
    return async () => ({
        contract: {
            provider: "stripe",
            version,
            source: "spec",
            authority: "authoritative",
            origin: "stub",
            capturedAt: "2026-01-01T00:00:00.000Z",
            members,
            removed: [],
        } as VendorContract,
        note: "stub",
    });
}

async function dir(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
    const d = await mkdtemp(join(tmpdir(), "driftlock-watch-"));
    return { dir: d, cleanup: () => rm(d, { recursive: true, force: true }) };
}

describe("driftlock watch", () => {
    test("rejects an unknown provider without touching the network", async () => {
        await expect(runWatch({ provider: "acme" })).rejects.toThrow(/Unknown provider/);
    });

    test("twilio carries a published spec URL, so spec polling covers it", async () => {
        const { TWILIO_VENDOR } = await import("@driftlock/core");
        expect(TWILIO_VENDOR.docs?.specUrl).toMatch(/^https:\/\//);
    });

    test("first poll records the baseline and exits 0", async () => {
        const { dir: d, cleanup } = await dir();
        try {
            const code = await runWatch({
                provider: "stripe",
                baselinesDir: d,
                poll: stub(["id", "source"]),
            });
            expect(code).toBe(0);
        } finally {
            await cleanup();
        }
    });

    test("a removed member exits 1 without --trigger", async () => {
        const { dir: d, cleanup } = await dir();
        try {
            await runWatch({ provider: "stripe", baselinesDir: d, poll: stub(["id", "source"]) });
            const code = await runWatch({
                provider: "stripe",
                baselinesDir: d,
                poll: stub(["id", "payment_method"]),
            });
            expect(code).toBe(1);
        } finally {
            await cleanup();
        }
    });

    test("--trigger without --repo exits 2", async () => {
        const { dir: d, cleanup } = await dir();
        try {
            await runWatch({ provider: "stripe", baselinesDir: d, poll: stub(["id", "source"]) });
            const code = await runWatch({
                provider: "stripe",
                baselinesDir: d,
                poll: stub(["id", "payment_method"]),
                trigger: true,
            });
            expect(code).toBe(2);
        } finally {
            await cleanup();
        }
    });
});
