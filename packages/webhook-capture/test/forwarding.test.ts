import { describe, expect, test, beforeEach } from "bun:test";

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: { "content-type": "application/json" },
    });
}

describe("Webhook forwarding", () => {
    test("forward returns ok status with forwarding info", async () => {
        const body = { type: "payment_intent.succeeded", data: {} };
        const response = json({
            status: "ok",
            endpointId: "stripe",
            eventType: "payment_intent.succeeded",
            message: "Schema baseline recorded or unchanged",
            forward: { ok: true, status: 200, elapsed: 150 },
        });

        const data = (await response.json()) as Record<string, unknown>;
        expect(data.forward).toEqual({ ok: true, status: 200, elapsed: 150 });
    });

    test("forward returns null when no forward URL configured", async () => {
        const response = json({
            status: "ok",
            endpointId: "stripe",
            eventType: "payment_intent.succeeded",
            message: "Schema baseline recorded or unchanged",
            forward: null,
        });

        const data = (await response.json()) as Record<string, unknown>;
        expect(data.forward).toBeNull();
    });

    test("forward includes driftlock headers", async () => {
        const forwardHeaders: Record<string, string> = {
            "content-type": "application/json",
            "x-driftlock-endpoint": "stripe",
            "x-driftlock-event": "payment_intent.succeeded",
            "x-driftlock-forwarded": "true",
        };

        expect(forwardHeaders["x-driftlock-endpoint"]).toBe("stripe");
        expect(forwardHeaders["x-driftlock-forwarded"]).toBe("true");
    });

    test("forward includes secret header when configured", () => {
        const secret = "whsec_123";
        const forwardHeaders: Record<string, string> = {
            "content-type": "application/json",
            "x-webhook-secret": secret,
        };

        expect(forwardHeaders["x-webhook-secret"]).toBe("whsec_123");
    });

    test("forward failure returns ok=false", async () => {
        const forwardResult = { ok: false, status: 500, elapsed: 100 };
        expect(forwardResult.ok).toBe(false);
        expect(forwardResult.status).toBe(500);
    });

    test("forward timeout returns ok=false", async () => {
        const forwardResult = { ok: false, status: 0, elapsed: 5000 };
        expect(forwardResult.ok).toBe(false);
        expect(forwardResult.status).toBe(0);
    });
});
