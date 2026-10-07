import { afterEach, describe, expect, test } from "bun:test";
import { STRIPE_VENDOR } from "@driftlock/core";
import { clearSpecCache, resolveHybridContract } from "@driftlock/agent";

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
    clearSpecCache();
});

function rejectFetch(): void {
    globalThis.fetch = (() => Promise.reject(new Error("no network in tests"))) as unknown as typeof fetch;
}

const SPEC = {
    components: {
        schemas: {
            PaymentIntent: {
                properties: {
                    id: { type: "string" },
                    payment_method: { type: "string" },
                },
            },
        },
    },
};

describe("resolveHybridContract", () => {
    test("returns the sampled observation when there is no vendor", async () => {
        const { contract, note } = await resolveHybridContract({
            provider: "unknown-vendor",
            origin: "webhook thing observed payload",
            currentMembers: ["data.object.payment_method"],
            removed: ["data.object.source"],
        });

        expect(contract.source).toBe("recorded");
        expect(contract.authority).toBe("sampled");
        expect(contract.removed).toContain("source");
        expect(contract.members).toContain("payment_method");
        expect(note).toMatch(/no specUrl/);
    });

    test("falls back to sampled when the spec fetch fails", async () => {
        rejectFetch();
        const { contract, note } = await resolveHybridContract({
            vendor: STRIPE_VENDOR,
            provider: "stripe",
            origin: "webhook payment_intent.succeeded observed payload",
            currentMembers: ["data.object.payment_method"],
            removed: ["data.object.source"],
        });

        expect(contract.source).toBe("recorded");
        expect(contract.authority).toBe("sampled");
        expect(contract.removed).toContain("source");
        expect(note).toMatch(/failed/);
    });

    test("unions spec members in and keeps observed removals", async () => {
        globalThis.fetch = (async () =>
            ({ ok: true, json: async () => SPEC }) as Response) as unknown as typeof fetch;
        const { contract, note } = await resolveHybridContract({
            vendor: STRIPE_VENDOR,
            provider: "stripe",
            origin: "webhook payment_intent.succeeded observed payload",
            currentMembers: ["data.object.payment_method"],
            removed: ["data.object.source"],
        });

        expect(contract.source).toBe("spec");
        expect(contract.authority).toBe("authoritative");
        // Observed removal survives the union: the completeness signal.
        expect(contract.removed).toContain("source");
        expect(contract.removed).toContain("data.object.source");
        // Observed members survive too.
        expect(contract.members).toContain("data.object.payment_method");
        expect(note).toMatch(/observed removals/);
    });

    test("caches spec members per spec URL", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls += 1;
            return { ok: true, json: async () => SPEC } as Response;
        }) as unknown as typeof fetch;
        const input = {
            vendor: STRIPE_VENDOR,
            provider: "stripe",
            origin: "webhook payment_intent.succeeded observed payload",
            currentMembers: ["data.object.payment_method"],
            removed: ["data.object.source"],
        };

        await resolveHybridContract(input);
        await resolveHybridContract({ ...input, removed: ["data.object.other"] });

        expect(calls).toBe(1);
    });
});
