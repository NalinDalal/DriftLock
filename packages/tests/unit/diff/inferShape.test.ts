import { describe, expect, test } from "bun:test";
import {
    inferShape,
    mergeNodes,
    flattenShape,
    type Shape,
    type ShapeNode,
} from "@driftlock/diff";

function shapeOf(payload: unknown): Shape {
    const node = inferShape(payload);
    if (node.kind !== "object" || !node.properties) {
        throw new Error("shapeOf expects an object payload");
    }
    return node.properties;
}

describe("inferShape", () => {
    test("infers scalar kinds", () => {
        expect(inferShape("abc").kind).toBe("string");
        expect(inferShape(42).kind).toBe("number");
        expect(inferShape(true).kind).toBe("boolean");
        expect(inferShape(null).kind).toBe("null");
    });

    test("infers nested objects", () => {
        const node = inferShape({
            id: "ch_1",
            customer: { billing: { address: "123 Main St" } },
        });
        expect(node.kind).toBe("object");
        expect(
            (node.properties?.customer as ShapeNode).kind,
        ).toBe("object");
        const billing = (node.properties?.customer as ShapeNode).properties
            ?.billing as ShapeNode;
        expect(billing.kind).toBe("object");
        expect((billing.properties?.address as ShapeNode).kind).toBe("string");
    });

    test("infers typed arrays", () => {
        const node = inferShape([1, 2, 3]);
        expect(node.kind).toBe("array");
        expect(node.sampleCount).toBe(3);
        expect((node.items as ShapeNode).kind).toBe("number");
    });

    test("infers empty arrays as unknown", () => {
        const node = inferShape([]);
        expect(node.kind).toBe("array");
        expect(node.sampleCount).toBe(0);
        expect((node.items as ShapeNode).kind).toBe("unknown");
    });

    test("infers objects", () => {
        const node = inferShape({ amount: 10, ok: false });
        expect((node.properties?.amount as ShapeNode).kind).toBe("number");
        expect((node.properties?.ok as ShapeNode).kind).toBe("boolean");
    });

    test("falls back to unknown for undefined", () => {
        expect(inferShape(undefined).kind).toBe("unknown");
    });
});

describe("mergeNodes", () => {
    test("null plus concrete widens to nullable concrete", () => {
        const merged = mergeNodes(inferShape("a"), inferShape(null));
        expect(merged.kind).toBe("string");
        expect(merged.nullable).toBe(true);
    });

    test("concrete plus null widens to nullable concrete", () => {
        const merged = mergeNodes(inferShape(null), inferShape(3));
        expect(merged.kind).toBe("number");
        expect(merged.nullable).toBe(true);
    });

    test("two nulls stay null", () => {
        const merged = mergeNodes(inferShape(null), inferShape(null));
        expect(merged.kind).toBe("null");
        expect(merged.nullable).toBeFalsy();
    });

    test("unknown defers to a known kind", () => {
        expect(mergeNodes(inferShape(undefined), inferShape(1)).kind).toBe(
            "number",
        );
        expect(mergeNodes(inferShape(1), inferShape(undefined)).kind).toBe(
            "number",
        );
    });

    test("merges object properties", () => {
        const a = inferShape({ x: 1 });
        const b = inferShape({ y: "v" });
        const merged = mergeNodes(a, b);
        expect(merged.kind).toBe("object");
        expect((merged.properties?.x as ShapeNode).kind).toBe("number");
        expect((merged.properties?.y as ShapeNode).kind).toBe("string");
    });

    test("merges array element shapes", () => {
        const merged = mergeNodes(inferShape([1, 2]), inferShape([3]));
        expect(merged.kind).toBe("array");
        expect((merged.items as ShapeNode).kind).toBe("number");
        expect(merged.sampleCount).toBe(2);
    });
});

describe("flattenShape", () => {
    test("flattens nested object paths", () => {
        const paths = flattenShape(
            shapeOf({ id: "x", customer: { address: "123" } }),
        ).map((f) => f.path);
        expect(paths).toContain("id");
        expect(paths).toContain("customer");
        expect(paths).toContain("customer.address");
    });

    test("flattens array element paths", () => {
        const fields = flattenShape(
            shapeOf({ items: [{ name: "n", qty: 2 }] }),
        );
        const paths = fields.map((f) => f.path);
        expect(paths).toContain("items[]");
        expect(paths).toContain("items[].name");
        expect(paths).toContain("items[].qty");
    });
});