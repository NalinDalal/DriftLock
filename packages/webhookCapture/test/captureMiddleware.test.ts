import { describe, expect, test } from "bun:test";
import { InMemorySchemaStore } from "../schemaStore";
import { createCaptureMiddleware } from "../captureMiddleware";

describe("createCaptureMiddleware", () => {
    test("captures payload and detects baseline", async () => {
        const store = new InMemorySchemaStore();
        const { capture } = createCaptureMiddleware(store);

        const req = new Request("http://localhost/webhooks/capture/stripe", {
            method: "POST",
            headers: { "x-github-event": "payment_intent.succeeded" },
        });

        const alert = await capture(req, {
            type: "payment_intent.succeeded",
            amount: 2000,
        });

        expect(alert).toBeNull();
    });

    test("detects drift on second capture", async () => {
        const store = new InMemorySchemaStore();
        const { capture } = createCaptureMiddleware(store);

        const req1 = new Request("http://localhost/webhooks/capture/stripe", {
            method: "POST",
            headers: { "x-github-event": "charge.created" },
        });
        await capture(req1, { amount: 2000, currency: "usd" });

        const req2 = new Request("http://localhost/webhooks/capture/stripe", {
            method: "POST",
            headers: { "x-github-event": "charge.created" },
        });
        const alert = await capture(req2, {
            amount: 2000,
            currency: "usd",
            fee: 30,
        });

        expect(alert).not.toBeNull();
        expect(alert!.diff.added).toEqual(["fee"]);
    });

    test("uses custom event type extractor", async () => {
        const store = new InMemorySchemaStore();
        const { capture } = createCaptureMiddleware(store, {
            extractEventType: (req) =>
                req.headers.get("x-stripe-event") ?? "unknown",
        });

        const req = new Request("http://localhost/webhooks/capture/stripe", {
            method: "POST",
            headers: { "x-stripe-event": "invoice.paid" },
        });

        await capture(req, { invoice_id: "in_123" });

        const types = await store.listEventTypes("stripe");
        expect(types).toEqual(["invoice.paid"]);
    });

    test("uses custom endpoint ID extractor", async () => {
        const store = new InMemorySchemaStore();
        const { capture } = createCaptureMiddleware(store, {
            extractEndpointId: (req) => {
                const url = new URL(req.url);
                return url.searchParams.get("id") ?? "default";
            },
        });

        const req = new Request(
            "http://localhost/webhooks/capture?id=my-endpoint",
            { method: "POST" },
        );

        await capture(req, { data: "test" });

        const types = await store.listEventTypes("my-endpoint");
        expect(types).toEqual(["__default__"]);
    });
});
