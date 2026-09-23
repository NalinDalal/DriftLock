import { describe, expect, test, mock } from "bun:test";
import { InMemorySchemaStore } from "../schemaStore";
import { DriftDetector } from "../driftDetector";

describe("DriftDetector", () => {
    test("records baseline on first payload", async () => {
        const store = new InMemorySchemaStore();
        const detector = new DriftDetector(store);
        const handler = mock(() => {});
        detector.onDrift(handler);

        const result = await detector.processPayload(
            "ep-1",
            "payment_intent.succeeded",
            { type: "payment_intent.succeeded", amount: 2000 },
        );

        expect(result).toBeNull();
        expect(handler).not.toHaveBeenCalled();

        const saved = await store.load("ep-1", "payment_intent.succeeded");
        expect(saved).toEqual({ type: "string", amount: "number" });
    });

    test("detects drift when payload changes", async () => {
        const store = new InMemorySchemaStore();
        const detector = new DriftDetector(store);
        const handler = mock(() => {});
        detector.onDrift(handler);

        await detector.processPayload("ep-1", "charge.created", {
            amount: 2000,
            currency: "usd",
        });

        const alert = await detector.processPayload("ep-1", "charge.created", {
            amount: 2000,
            currency: "usd",
            fee: 30,
        });

        expect(alert).not.toBeNull();
        expect(alert!.diff.added).toEqual(["fee"]);
        expect(alert!.diff.removed).toEqual([]);
        expect(alert!.diff.typeChanged).toEqual([]);
        expect(alert!.endpointId).toBe("ep-1");
        expect(alert!.eventType).toBe("charge.created");
        expect(handler).toHaveBeenCalledTimes(1);
    });

    test("does not alert when payload is unchanged", async () => {
        const store = new InMemorySchemaStore();
        const detector = new DriftDetector(store);
        const handler = mock(() => {});
        detector.onDrift(handler);

        await detector.processPayload("ep-1", "charge.created", {
            amount: 2000,
        });

        const alert = await detector.processPayload("ep-1", "charge.created", {
            amount: 2000,
        });

        expect(alert).toBeNull();
        expect(handler).not.toHaveBeenCalled();
    });

    test("stores schemas per event type independently", async () => {
        const store = new InMemorySchemaStore();
        const detector = new DriftDetector(store);

        await detector.processPayload("ep-1", "charge.created", {
            amount: 2000,
        });
        await detector.processPayload("ep-1", "customer.created", {
            email: "test@example.com",
        });

        const charge = await store.load("ep-1", "charge.created");
        const customer = await store.load("ep-1", "customer.created");

        expect(charge).toEqual({ amount: "number" });
        expect(customer).toEqual({ email: "string" });
    });

    test("detects field removal as drift", async () => {
        const store = new InMemorySchemaStore();
        const detector = new DriftDetector(store);

        await detector.processPayload("ep-1", "event", {
            id: "1",
            status: "active",
            old_field: "value",
        });

        const alert = await detector.processPayload("ep-1", "event", {
            id: "1",
            status: "active",
        });

        expect(alert).not.toBeNull();
        expect(alert!.diff.removed).toEqual(["old_field"]);
    });

    test("detects type change as drift", async () => {
        const store = new InMemorySchemaStore();
        const detector = new DriftDetector(store);

        await detector.processPayload("ep-1", "event", {
            amount: 2000,
        });

        const alert = await detector.processPayload("ep-1", "event", {
            amount: "2000",
        });

        expect(alert).not.toBeNull();
        expect(alert!.diff.typeChanged).toEqual([
            { field: "amount", from: "number", to: "string" },
        ]);
    });

    test("updates baseline after drift detection", async () => {
        const store = new InMemorySchemaStore();
        const detector = new DriftDetector(store);

        await detector.processPayload("ep-1", "event", { a: 1 });
        await detector.processPayload("ep-1", "event", { a: 1, b: 2 });

        const saved = await store.load("ep-1", "event");
        expect(saved).toEqual({ a: "number", b: "number" });
    });

    test("fires multiple handlers", async () => {
        const store = new InMemorySchemaStore();
        const detector = new DriftDetector(store);
        const handler1 = mock(() => {});
        const handler2 = mock(() => {});
        detector.onDrift(handler1);
        detector.onDrift(handler2);

        await detector.processPayload("ep-1", "event", { a: 1 });
        await detector.processPayload("ep-1", "event", { a: 1, b: 2 });

        expect(handler1).toHaveBeenCalledTimes(1);
        expect(handler2).toHaveBeenCalledTimes(1);
    });
});
