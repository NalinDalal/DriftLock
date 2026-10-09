import { describe, expect, test } from "bun:test";
import { vendorForEndpoint, vendorForPackage } from "@driftlock/agent";
import { P5_VENDOR, STRIPE_VENDOR, TWILIO_VENDOR } from "@driftlock/core";

describe("vendorForPackage", () => {
    test("matches known packages", () => {
        expect(vendorForPackage("stripe")).toBe(STRIPE_VENDOR);
        expect(vendorForPackage("Stripe")).toBe(STRIPE_VENDOR);
        expect(vendorForPackage(" twilio ")).toBe(TWILIO_VENDOR);
        expect(vendorForPackage("P5")).toBe(P5_VENDOR);
    });

    test("returns undefined for unknown", () => {
        expect(vendorForPackage("unknown")).toBeUndefined();
        expect(vendorForPackage("")).toBeUndefined();
    });
});

describe("vendorForEndpoint", () => {
    test("matches known endpoints (case/space-insensitive)", () => {
        expect(vendorForEndpoint("stripe")).toBe(STRIPE_VENDOR);
        expect(vendorForEndpoint("STRIPE")).toBe(STRIPE_VENDOR);
        expect(vendorForEndpoint(" twilio ")).toBe(TWILIO_VENDOR);
        expect(vendorForEndpoint("p5")).toBe(P5_VENDOR);
    });

    test("returns undefined for unknown endpoints", () => {
        expect(vendorForEndpoint("slack")).toBeUndefined();
        expect(vendorForEndpoint("")).toBeUndefined();
    });
});
