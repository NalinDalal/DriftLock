import { createHmac, timingSafeEqual } from "crypto";

export interface CaptureSignatureCheck {
    ok: boolean;
    /** Machine-readable reason when rejected: missing_secret not included —
     *  absence of a secret means "not configured", decided by the caller. */
    reason?: "missing_signature" | "invalid_signature" | "stale_timestamp";
}

/**
 * Parse `CAPTURE_SECRETS="stripe:whsec_xxx,shopify:shpss_yyy"` into a map of
 * endpoint ID -> signing secret. Values may contain `:` (only the first
 * colon splits); entries without one are ignored.
 */
export function parseCaptureSecrets(raw: string | undefined): Map<string, string> {
    const out = new Map<string, string>();
    if (!raw) return out;
    for (const entry of raw.split(",")) {
        const idx = entry.indexOf(":");
        if (idx <= 0) continue;
        const endpoint = entry.slice(0, idx).trim();
        const secret = entry.slice(idx + 1).trim();
        if (endpoint && secret) out.set(endpoint, secret);
    }
    return out;
}

function safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
}

function hmacHex(secret: string, payload: string): string {
    return createHmac("sha256", secret).update(payload).digest("hex");
}

function parseStripeHeader(value: string): { t: string; v1: string[] } | null {
    const parts = value.split(",").map((p) => p.trim());
    const t = parts.find((p) => p.startsWith("t="))?.slice(2) ?? "";
    const v1 = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
    if (!t || v1.length === 0) return null;
    return { t, v1 };
}

/**
 * Verify an inbound capture payload against the endpoint's signing secret.
 *
 * Two schemes, checked in order:
 * 1. Stripe: `stripe-signature: t=...,v1=...` — HMAC-SHA256 over `t.rawBody`.
 *    The timestamp must be within `toleranceSec` of now (0 disables the check).
 * 2. Generic HMAC: `x-webhook-signature: sha256=<hex>` (or bare hex) —
 *    HMAC-SHA256 over the raw body.
 */
export function verifyCaptureSignature(input: {
    rawBody: string;
    headers: { get(name: string): string | null };
    secret: string;
    toleranceSec?: number;
    nowMs?: number;
}): CaptureSignatureCheck {
    const toleranceSec = input.toleranceSec ?? 300;
    const nowMs = input.nowMs ?? Date.now();

    const stripeHeader = input.headers.get("stripe-signature");
    if (stripeHeader) {
        const parsed = parseStripeHeader(stripeHeader);
        if (!parsed) return { ok: false, reason: "invalid_signature" };
        if (toleranceSec > 0) {
            const t = Number(parsed.t);
            if (!Number.isFinite(t) || Math.abs(nowMs / 1000 - t) > toleranceSec) {
                return { ok: false, reason: "stale_timestamp" };
            }
        }
        const expected = hmacHex(input.secret, `${parsed.t}.${input.rawBody}`);
        return parsed.v1.some((sig) => safeEqual(sig, expected))
            ? { ok: true }
            : { ok: false, reason: "invalid_signature" };
    }

    const generic = input.headers.get("x-webhook-signature");
    if (generic) {
        const sig = generic.startsWith("sha256=") ? generic.slice("sha256=".length) : generic.trim();
        return safeEqual(sig, hmacHex(input.secret, input.rawBody))
            ? { ok: true }
            : { ok: false, reason: "invalid_signature" };
    }

    return { ok: false, reason: "missing_signature" };
}

/** Test helper: build a Stripe-style signature header for a payload. */
export function signStripePayload(secret: string, rawBody: string, t?: number): string {
    const ts = t ?? Math.floor(Date.now() / 1000);
    return `t=${ts},v1=${hmacHex(secret, `${ts}.${rawBody}`)}`;
}
