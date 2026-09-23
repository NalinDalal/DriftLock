import { describe, expect, test } from "bun:test";
import { InMemorySchemaStore } from "../schemaStore";
import { DriftDetector } from "../driftDetector";

describe("Rollback detection", () => {
    test("detects when vendor reverts to previous schema", async () => {
        const store = new InMemorySchemaStore();
        const detector = new DriftDetector(store);

        const rollbacks: Array<{ endpointId: string; eventType: string }> = [];
        detector.onRollback((alert) => {
            rollbacks.push({
                endpointId: alert.endpointId,
                eventType: alert.eventType,
            });
        });

        await detector.processPayload("stripe", "charge.created", {
            amount: 2000,
            source: "tok_visa",
        });

        const drift = await detector.processPayload(
            "stripe",
            "charge.created",
            {
                amount: 2000,
                payment_method: "pm_123",
            },
        );

        expect(drift).not.toBeNull();
        expect("diff" in drift!).toBe(true);

        const rollback = await detector.processPayload(
            "stripe",
            "charge.created",
            {
                amount: 2000,
                source: "tok_visa",
            },
        );

        expect(rollback).not.toBeNull();
        expect("revertedTo" in rollback!).toBe(true);
        expect(rollbacks).toHaveLength(1);
        expect(rollbacks[0].endpointId).toBe("stripe");
    });

    test("does not trigger rollback for new schema", async () => {
        const store = new InMemorySchemaStore();
        const detector = new DriftDetector(store);

        const rollbacks: Array<{ endpointId: string }> = [];
        detector.onRollback((alert) => {
            rollbacks.push({ endpointId: alert.endpointId });
        });

        await detector.processPayload("stripe", "charge.created", {
            amount: 2000,
            source: "tok_visa",
        });

        await detector.processPayload("stripe", "charge.created", {
            amount: 2000,
            payment_method: "pm_123",
        });

        await detector.processPayload("stripe", "charge.created", {
            amount: 2000,
            payment_method: "pm_456",
        });

        expect(rollbacks).toHaveLength(0);
    });

    test("rollback alert contains correct schema info", async () => {
        const store = new InMemorySchemaStore();
        const detector = new DriftDetector(store);

        let rollbackAlert: any = null;
        detector.onRollback((alert) => {
            rollbackAlert = alert;
        });

        await detector.processPayload("stripe", "charge.created", {
            amount: 2000,
            source: "tok_visa",
        });

        await detector.processPayload("stripe", "charge.created", {
            amount: 2000,
            payment_method: "pm_123",
        });

        await detector.processPayload("stripe", "charge.created", {
            amount: 2000,
            source: "tok_visa",
        });

        expect(rollbackAlert).not.toBeNull();
        expect(rollbackAlert.revertedTo).toEqual({
            "amount": "number",
            "source": "string",
        });
        expect(rollbackAlert.revertedFrom).toEqual({
            "amount": "number",
            "payment_method": "string",
        });
    });

    test("rollback handler is async", async () => {
        const store = new InMemorySchemaStore();
        const detector = new DriftDetector(store);

        const results: string[] = [];
        detector.onRollback(async (alert) => {
            await new Promise((r) => setTimeout(r, 10));
            results.push(`rollback-${alert.eventType}`);
        });

        await detector.processPayload("stripe", "charge.created", {
            amount: 2000,
            source: "tok_visa",
        });

        await detector.processPayload("stripe", "charge.created", {
            amount: 2000,
            payment_method: "pm_123",
        });

        await detector.processPayload("stripe", "charge.created", {
            amount: 2000,
            source: "tok_visa",
        });

        expect(results).toEqual(["rollback-charge.created"]);
    });
});
