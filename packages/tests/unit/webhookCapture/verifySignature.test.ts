import { describe, expect, test } from "bun:test";
import { createHmac } from "crypto";
import {
    parseCaptureSecrets,
    verifyCaptureSignature,
    signStripePayload,
} from "@driftlock/webhookCapture";

const SECRET = "whsec_test123";
const BODY = `{"type":"payment_intent.succeeded","data":{"object":{"id":"pi_123"}}}`;

function headers(entries: Record<string, string>) {
    const map = new Map(
        Object.entries(entries).map(([k, v]) => [k.toLowerCase(), v]),
    );
    return { get: (name: string) => map.get(name.toLowerCase()) ?? null };
}

describe("parseCaptureSecrets", () => {
    test("parses endpoint:secret pairs", () => {
        const m = parseCaptureSecrets("stripe:whsec_aaa,shopify:shpss_bbb");
        expect(m.get("stripe")).toBe("whsec_aaa");
        expect(m.get("shopify")).toBe("shpss_bbb");
    });

    test("tolerates whitespace and bad entries", () => {
        const m = parseCaptureSecrets(" stripe : whsec_aaa , nonsense, :empty, ,twilio:abc:def ");
        expect(m.get("stripe")).toBe("whsec_aaa");
        expect(m.get("twilio")).toBe("abc:def");
        expect(m.size).toBe(2);
    });

    test("empty input yields empty map", () => {
        expect(parseCaptureSecrets(undefined).size).toBe(0);
        expect(parseCaptureSecrets("").size).toBe(0);
    });
});

describe("verifyCaptureSignature (Stripe scheme)", () => {
    test("accepts a valid signature", () => {
        const sig = signStripePayload(SECRET, BODY);
        const check = verifyCaptureSignature({
            rawBody: BODY,
            headers: headers({ "stripe-signature": sig }),
            secret: SECRET,
        });
        expect(check.ok).toBe(true);
    });

    test("rejects a tampered body", () => {
        const sig = signStripePayload(SECRET, BODY);
        const check = verifyCaptureSignature({
            rawBody: BODY + " ",
            headers: headers({ "stripe-signature": sig }),
            secret: SECRET,
        });
        expect(check).toEqual({ ok: false, reason: "invalid_signature" });
    });

    test("rejects the wrong secret", () => {
        const sig = signStripePayload("whsec_other", BODY);
        const check = verifyCaptureSignature({
            rawBody: BODY,
            headers: headers({ "stripe-signature": sig }),
            secret: SECRET,
        });
        expect(check.ok).toBe(false);
    });

    test("rejects a stale timestamp", () => {
        const sig = signStripePayload(SECRET, BODY, Math.floor(Date.now() / 1000) - 3600);
        const check = verifyCaptureSignature({
            rawBody: BODY,
            headers: headers({ "stripe-signature": sig }),
            secret: SECRET,
        });
        expect(check).toEqual({ ok: false, reason: "stale_timestamp" });
    });

    test("tolerance can be disabled", () => {
        const sig = signStripePayload(SECRET, BODY, 1);
        const check = verifyCaptureSignature({
            rawBody: BODY,
            headers: headers({ "stripe-signature": sig }),
            secret: SECRET,
            toleranceSec: 0,
        });
        expect(check.ok).toBe(true);
    });
});

describe("verifyCaptureSignature (generic HMAC)", () => {
    test("accepts sha256=<hex>", () => {
        const hex = createHmac("sha256", SECRET).update(BODY).digest("hex");
        const check = verifyCaptureSignature({
            rawBody: BODY,
            headers: headers({ "x-webhook-signature": `sha256=${hex}` }),
            secret: SECRET,
        });
        expect(check.ok).toBe(true);
    });

    test("rejects a wrong digest", () => {
        const check = verifyCaptureSignature({
            rawBody: BODY,
            headers: headers({ "x-webhook-signature": "sha256=00" }),
            secret: SECRET,
        });
        expect(check.ok).toBe(false);
    });

    test("missing signature is reported distinctly", () => {
        const check = verifyCaptureSignature({
            rawBody: BODY,
            headers: headers({}),
            secret: SECRET,
        });
        expect(check).toEqual({ ok: false, reason: "missing_signature" });
    });
});
