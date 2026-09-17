import { describe, expect, test } from "bun:test";
import {
    applyFixWork,
    diffShapes,
    fixWorksForDiff,
    inferShape,
    type Shape,
    type FixWork,
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
    options: { direction?: "request" | "response" } = {},
) {
    return diffShapes(shapeOf(oldPayload), shapeOf(newPayload), options);
}

describe("fixWorksForDiff", () => {
    test("became nullable maps to a null_check fix", () => {
        const result = diff({ status: "succeeded" }, { status: null });
        const works = fixWorksForDiff(result);
        expect(works).toHaveLength(1);
        expect(works[0].kind).toBe("null_check");
        expect(works[0].field).toBe("status");
        expect(works[0].oldType).toBe("string");
        expect(works[0].confidence).toBe("high");
    });

    test("request rename maps to a field_rename fix", () => {
        const result = diff(
            { amount: 100, source: "tok" },
            { amount: 100, payment_method: "pm" },
            { direction: "request" },
        );
        const works = fixWorksForDiff(result);
        expect(works).toHaveLength(1);
        expect(works[0].kind).toBe("field_rename");
        expect(works[0].from).toBe("source");
        expect(works[0].to).toBe("payment_method");
    });

    test("request rename with mismatched kinds does not rename", () => {
        const result = diff(
            { amount: 100, source: "tok" },
            { amount: 100, payment_method: 42 },
            { direction: "request" },
        );
        const works = fixWorksForDiff(result);
        expect(works.some((w) => w.kind === "field_rename")).toBe(false);
        expect(works.some((w) => w.kind === "default_value")).toBe(true);
    });

    test("new required request parameter maps to default_value", () => {
        const result = diff(
            { amount: 100 },
            { amount: 100, payment_method: "pm" },
            { direction: "request" },
        );
        const works = fixWorksForDiff(result);
        expect(works[0].kind).toBe("default_value");
        expect(works[0].field).toBe("payment_method");
    });

    test("type change maps to a type_coercion fix", () => {
        const result = diff({ amount: "100" }, { amount: 100 });
        const works = fixWorksForDiff(result);
        expect(works[0].kind).toBe("type_coercion");
        expect(works[0].oldType).toBe("string");
        expect(works[0].newType).toBe("number");
    });

    test("removed response field maps to a custom fix", () => {
        const result = diff({ id: "a", legacy_id: "x" }, { id: "a" });
        const works = fixWorksForDiff(result);
        expect(works[0].kind).toBe("custom");
        expect(works[0].field).toBe("legacy_id");
    });

    test("non-breaking changes produce no fixes", () => {
        const result = diff({ id: "a" }, { id: "a", fee: 30 });
        expect(result.changes.some((c) => c.breaking)).toBe(false);
        expect(fixWorksForDiff(result)).toHaveLength(0);
    });

    test("array element paths produce no templated fixes", () => {
        const result = diff({ data: [{ amount: "1" }] }, { data: [{ amount: 1 }] });
        const works = fixWorksForDiff(result);
        expect(works.some((w) => w.kind === "type_coercion")).toBe(false);
    });

    test("multiple breaking changes produce one fix per change", () => {
        const oldShape: Shape = {
            status: { kind: "string" },
            amount: { kind: "string" },
        };
        const newShape: Shape = {
            status: { kind: "string", nullable: true },
            amount: { kind: "number" },
        };
        const result = diffShapes(oldShape, newShape);
        const works = fixWorksForDiff(result);
        expect(works.map((w) => w.kind)).toEqual(["null_check", "type_coercion"]);
    });
});

describe("applyFixWork", () => {
    test("renames a request parameter token", () => {
        const work: FixWork = {
            kind: "field_rename",
            field: "source",
            from: "source",
            to: "payment_method",
            description: "Rename request parameter 'source' to 'payment_method'",
            template: "rename 'source' to 'payment_method'",
            confidence: "high",
        };
        const source = "create({ amount: 100, source: \"tok_visa\" })";
        expect(applyFixWork(work, source)).toBe(
            "create({ amount: 100, payment_method: \"tok_visa\" })",
        );
    });

    test("does not rename a token that is part of a longer word", () => {
        const work: FixWork = {
            kind: "field_rename",
            field: "source",
            from: "source",
            to: "payment_method",
            description: "Rename request parameter 'source' to 'payment_method'",
            template: "rename 'source' to 'payment_method'",
            confidence: "high",
        };
        const source = "create({ source: auth.sourceId })";
        expect(applyFixWork(work, source)).toBe(
            "create({ payment_method: auth.sourceId })",
        );
    });

    test("adds a null check with a string fallback", () => {
        const work: FixWork = {
            kind: "null_check",
            field: "status",
            oldType: "string",
            description: "Add a null check for 'status'",
            template: "replace 'status' with 'status ?? \"\"'",
            confidence: "high",
        };
        const source = "return charge.status;";
        expect(applyFixWork(work, source)).toBe('return charge.status ?? "";');
    });

    test("uses a zero fallback for numbers", () => {
        const work: FixWork = {
            kind: "null_check",
            field: "total",
            oldType: "number",
            description: "Add a null check for 'total'",
            template: "replace 'total' with 'total ?? 0'",
            confidence: "high",
        };
        expect(applyFixWork(work, "return total;")).toBe("return total ?? 0;");
    });

    test("wraps a field in a type coercion", () => {
        const work: FixWork = {
            kind: "type_coercion",
            field: "amount",
            oldType: "string",
            newType: "number",
            description: "Convert 'amount' from string to number",
            template: "wrap 'amount' in a number coercion",
            confidence: "high",
        };
        const source = "total(result.amount)";
        expect(applyFixWork(work, source)).toBe("total(Number(result.amount))");
    });

    test("returns null when the field is absent", () => {
        const work: FixWork = {
            kind: "field_rename",
            field: "source",
            from: "source",
            to: "payment_method",
            description: "Rename request parameter 'source' to 'payment_method'",
            template: "rename 'source' to 'payment_method'",
            confidence: "high",
        };
        expect(applyFixWork(work, "create({ amount: 1 })")).toBeNull();
    });

    test("returns null for non-applicable kinds", () => {
        const work: FixWork = {
            kind: "default_value",
            field: "payment_method",
            description: "Request parameter 'payment_method' is now required",
            template: "provide a default value for 'payment_method'",
            confidence: "high",
        };
        expect(applyFixWork(work, "create({})")).toBeNull();

        const custom: FixWork = {
            kind: "custom",
            field: "legacy_id",
            description: "Handle removed response field 'legacy_id'",
            template: "remove access to 'legacy_id'",
            confidence: "high",
        };
        expect(applyFixWork(custom, "const id = legacy_id;")).toBeNull();
    });
});