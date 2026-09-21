import { describe, expect, test } from "bun:test";
import { flattenPayload } from "../schemaFlattener";

describe("flattenPayload", () => {
    test("flattens a simple object", () => {
        const result = flattenPayload({ id: "pi_123", amount: 2000 });
        expect(result).toEqual({ id: "string", amount: "number" });
    });

    test("flattens nested objects with dot notation", () => {
        const result = flattenPayload({
            data: { object: { id: "pi_123", amount: 2000 } },
        });
        expect(result).toEqual({
            "data.object.id": "string",
            "data.object.amount": "number",
        });
    });

    test("handles arrays", () => {
        const result = flattenPayload({
            items: [{ id: "1", name: "test" }],
        });
        expect(result).toEqual({
            items: "array",
            "items[].id": "string",
            "items[].name": "string",
        });
    });

    test("handles null values", () => {
        const result = flattenPayload({ field: null });
        expect(result).toEqual({ field: "null" });
    });

    test("handles booleans", () => {
        const result = flattenPayload({ active: true, deleted: false });
        expect(result).toEqual({ active: "boolean", deleted: "boolean" });
    });

    test("handles deeply nested objects", () => {
        const result = flattenPayload({
            a: { b: { c: { d: "deep" } } },
        });
        expect(result).toEqual({ "a.b.c.d": "string" });
    });

    test("handles mixed types", () => {
        const result = flattenPayload({
            type: "payment_intent.succeeded",
            data: {
                object: {
                    id: "pi_123",
                    amount: 2000,
                    currency: "usd",
                    metadata: null,
                },
            },
        });
        expect(result).toEqual({
            type: "string",
            "data.object.id": "string",
            "data.object.amount": "number",
            "data.object.currency": "string",
            "data.object.metadata": "null",
        });
    });

    test("handles empty object", () => {
        const result = flattenPayload({});
        expect(result).toEqual({});
    });

    test("handles empty array items", () => {
        const result = flattenPayload({ items: [] });
        expect(result).toEqual({ items: "array" });
    });

    test("handles Stripe-like webhook payload", () => {
        const result = flattenPayload({
            id: "evt_123",
            type: "payment_intent.succeeded",
            data: {
                object: {
                    id: "pi_123",
                    amount: 2000,
                    currency: "usd",
                    status: "succeeded",
                    metadata: { order_id: "ord_1" },
                },
            },
        });
        expect(result).toEqual({
            id: "string",
            type: "string",
            "data.object.id": "string",
            "data.object.amount": "number",
            "data.object.currency": "string",
            "data.object.status": "string",
            "data.object.metadata.order_id": "string",
        });
    });
});
