import { describe, expect, test } from "bun:test";
import {
    diffShapes,
    inferShape,
    type Shape,
    type ShapeDiffOptions,
    type ShapeNode,
} from "@driftlock/diff";

function shapeOf(payload: unknown): Shape {
    const node = inferShape(payload);
    if (node.kind !== "object" || !node.properties) {
        throw new Error("shapeOf expects an object payload");
    }
    return node.properties;
}

function diff(
    oldPayload: unknown,
    newPayload: unknown,
    options: ShapeDiffOptions = {},
) {
    return diffShapes(shapeOf(oldPayload), shapeOf(newPayload), options);
}

describe("diffShapes", () => {
    const cases: Array<{
        name: string;
        oldPayload: unknown;
        newPayload: unknown;
        options?: ShapeDiffOptions;
        breaking?: string[];
        nonBreaking?: string[];
        confidence?: "high" | "medium" | "low";
        removed?: string[];
        added?: string[];
    }> = [
        {
            name: "identical shapes produce no drift",
            oldPayload: { id: "ch_1", amount: 100, status: "succeeded" },
            newPayload: { id: "ch_2", amount: 120, status: "succeeded" },
            breaking: [],
            nonBreaking: [],
            confidence: "high",
        },
        {
            name: "removed response field is breaking",
            oldPayload: { id: "ch_1", legacy_id: "x" },
            newPayload: { id: "ch_1" },
            breaking: ["Removed field 'legacy_id'"],
            removed: ["legacy_id"],
        },
        {
            name: "added response field is non-breaking",
            oldPayload: { id: "ch_1" },
            newPayload: { id: "ch_1", fee: 30 },
            nonBreaking: ["Added field 'fee'"],
            added: ["fee"],
            breaking: [],
        },
        {
            name: "type change is breaking",
            oldPayload: { amount: "100" },
            newPayload: { amount: 100 },
            breaking: ["Changed type of 'amount' from string to number"],
        },
        {
            name: "field becoming null triggers a null check",
            oldPayload: { status: "succeeded" },
            newPayload: { status: null },
            breaking: ["Field 'status' is now null"],
        },
        {
            name: "nullable flag removal is non-breaking",
            oldPayload: { a: "x" },
            newPayload: { a: "y" },
            options: { direction: "response" },
            breaking: [],
            nonBreaking: [],
        },
        {
            name: "removed request parameter is non-breaking",
            oldPayload: { amount: 100, source: "tok" },
            newPayload: { amount: 100 },
            options: { direction: "request" },
            nonBreaking: ["Request parameter 'source' is no longer required"],
            breaking: [],
        },
        {
            name: "added request parameter is breaking",
            oldPayload: { amount: 100 },
            newPayload: { amount: 100, payment_method: "pm_1" },
            options: { direction: "request" },
            breaking: ["New required request parameter 'payment_method'"],
            added: ["payment_method"],
        },
        {
            name: "paired top-level request rename is detected as a rename",
            oldPayload: { amount: 100, source: "tok" },
            newPayload: { amount: 100, payment_method: "pm" },
            options: { direction: "request" },
            breaking: [
                "Renamed request parameter 'source' to 'payment_method'",
            ],
            removed: [],
            added: [],
        },
        {
            name: "rename requires matching kinds",
            oldPayload: { amount: 100, source: "tok" },
            newPayload: { amount: 100, payment_method: 42 },
            options: { direction: "request" },
            breaking: ["New required request parameter 'payment_method'"],
            nonBreaking: ["Request parameter 'source' is no longer required"],
            added: ["payment_method"],
        },
        {
            name: "present null then absent is a removal, not a null transition",
            oldPayload: { a: null },
            newPayload: {},
            breaking: ["Removed field 'a'"],
            removed: ["a"],
        },
        {
            name: "present null both sides is no drift",
            oldPayload: { a: null, b: 1 },
            newPayload: { a: null, b: 1 },
            breaking: [],
            nonBreaking: [],
        },
        {
            name: "value changes with identical types are no drift",
            oldPayload: { created_at: "2024-01-01", id: "a" },
            newPayload: { created_at: "2024-01-02", id: "b" },
            breaking: [],
            nonBreaking: [],
        },
        {
            name: "ignored fields do not trigger drift",
            oldPayload: { created_at: "2024-01-01", id: "a" },
            newPayload: { created_at: null, id: "b" },
            options: { ignore: ["created_at"] },
            breaking: [],
            nonBreaking: [],
        },
        {
            name: "empty array to typed array lowers confidence without drift",
            oldPayload: { items: [] },
            newPayload: { items: [{ id: "i1" }] },
            breaking: [],
            confidence: "medium",
        },
        {
            name: "array element type change is breaking",
            oldPayload: { items: [1, 2] },
            newPayload: { items: ["a", "b"] },
            breaking: ["Changed type of 'items[]' from number to string"],
        },
        {
            name: "nested object change reports the full path",
            oldPayload: { customer: { billing: { address: "123 Main" } } },
            newPayload: { customer: { billing: { address: 123 } } },
            breaking: [
                "Changed type of 'customer.billing.address' from string to number",
            ],
        },
        {
            name: "array of objects reports element field paths",
            oldPayload: { data: [{ amount: "100" }] },
            newPayload: { data: [{ amount: 100 }] },
            breaking: ["Changed type of 'data[].amount' from string to number"],
        },
        {
            name: "multiple undersampled arrays drop confidence to low",
            oldPayload: { a: [], b: [] },
            newPayload: { a: [], b: [] },
            breaking: [],
            confidence: "low",
        },
    ];

    for (const c of cases) {
        test(c.name, () => {
            const result = diff(
                c.oldPayload,
                c.newPayload,
                c.options ?? {},
            );
            if (c.breaking) {
                for (const msg of c.breaking) {
                    expect(result.breakingChanges).toContain(msg);
                }
            }
            if (c.nonBreaking) {
                for (const msg of c.nonBreaking) {
                    expect(result.nonBreakingChanges).toContain(msg);
                }
            }
            if (c.confidence) {
                expect(result.confidence).toBe(c.confidence);
            }
            if (c.removed) {
                for (const field of c.removed) {
                    expect(result.removedFields).toContain(field);
                }
            }
            if (c.added) {
                for (const field of c.added) {
                    expect(result.addedFields).toContain(field);
                }
            }
            if (c.breaking?.length) {
                expect(
                    result.breakingChanges.filter((m) =>
                        c.breaking!.includes(m),
                    ),
                ).toHaveLength(c.breaking.length);
            }
        });
    }
});

describe("diffShapes metadata", () => {
    test("type changes carry old and new type", () => {
        const result = diff({ amount: "100" }, { amount: 100 });
        expect(result.typeChanges).toEqual([
            { field: "amount", oldType: "string", newType: "number" },
        ]);
    });

    test("optionality change is recorded when a field becomes null", () => {
        const result = diff({ status: "ok" }, { status: null });
        expect(result.optionalityChanges).toEqual([
            { field: "status", wasRequired: true, nowRequired: false },
        ]);
    });

    test("nullable widening between samples is breaking", () => {
        const oldShape: Shape = {
            status: { kind: "string" },
        };
        const newShape: Shape = {
            status: { kind: "string", nullable: true },
        };
        const result = diffShapes(oldShape, newShape);
        expect(result.breakingChanges).toContain("Field 'status' is now nullable");
        expect(result.changes.filter((c) => c.kind === "became_nullable")).toHaveLength(1);
    });

    test("nullable removal is non-breaking", () => {
        const oldShape: Shape = {
            status: { kind: "string", nullable: true },
        };
        const newShape: Shape = {
            status: { kind: "string" },
        };
        const result = diffShapes(oldShape, newShape);
        expect(result.breakingChanges).toHaveLength(0);
        expect(result.nonBreakingChanges).toContain(
            "Field 'status' is no longer nullable",
        );
    });

    test("null to concrete is a non-breaking narrowing", () => {
        const result = diff({ a: null }, { a: "x" });
        expect(result.breakingChanges).toHaveLength(0);
        expect(result.nonBreakingChanges).toContain("Field 'a' is no longer null");
    });

    test("node path for nullable with null value is inferred", () => {
        const node: ShapeNode = inferShape({ a: "x" }) as ShapeNode;
        expect(node.kind).toBe("object");
        const field = (node as { properties: Record<string, ShapeNode> })
            .properties.a as ShapeNode;
        expect(field.kind).toBe("string");
        expect(field.nullable).toBeUndefined();
    });
});