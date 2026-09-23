import { describe, expect, test } from "bun:test";
import { diffSchemas, isSchemaDiffEmpty } from "../schemaDiff";

describe("diffSchemas", () => {
    test("detects added fields", () => {
        const previous = { "data.amount": "number" };
        const current = { "data.amount": "number", "data.fee": "number" };
        const diff = diffSchemas(previous, current);
        expect(diff.added).toEqual(["data.fee"]);
        expect(diff.removed).toEqual([]);
        expect(diff.typeChanged).toEqual([]);
    });

    test("detects removed fields", () => {
        const previous = { "data.amount": "number", "data.fee": "number" };
        const current = { "data.amount": "number" };
        const diff = diffSchemas(previous, current);
        expect(diff.added).toEqual([]);
        expect(diff.removed).toEqual(["data.fee"]);
        expect(diff.typeChanged).toEqual([]);
    });

    test("detects type changes", () => {
        const previous = { "data.amount": "number" };
        const current = { "data.amount": "string" };
        const diff = diffSchemas(previous, current);
        expect(diff.added).toEqual([]);
        expect(diff.removed).toEqual([]);
        expect(diff.typeChanged).toEqual([
            { field: "data.amount", from: "number", to: "string" },
        ]);
    });

    test("detects multiple changes at once", () => {
        const previous = {
            "data.amount": "number",
            "data.old_field": "string",
        };
        const current = {
            "data.amount": "string",
            "data.new_field": "number",
        };
        const diff = diffSchemas(previous, current);
        expect(diff.added).toEqual(["data.new_field"]);
        expect(diff.removed).toEqual(["data.old_field"]);
        expect(diff.typeChanged).toEqual([
            { field: "data.amount", from: "number", to: "string" },
        ]);
    });

    test("returns empty diff for identical schemas", () => {
        const schema = { "data.amount": "number", "data.currency": "string" };
        const diff = diffSchemas(schema, schema);
        expect(isSchemaDiffEmpty(diff)).toBe(true);
    });

    test("detects Stripe field rename (source → payment_method)", () => {
        const previous = {
            "data.object.amount": "number",
            "data.object.source": "string",
        };
        const current = {
            "data.object.amount": "number",
            "data.object.payment_method": "string",
        };
        const diff = diffSchemas(previous, current);
        expect(diff.added).toEqual(["data.object.payment_method"]);
        expect(diff.removed).toEqual(["data.object.source"]);
        expect(diff.typeChanged).toEqual([]);
    });

    test("detects null type change", () => {
        const previous = { "data.field": "null" };
        const current = { "data.field": "string" };
        const diff = diffSchemas(previous, current);
        expect(diff.typeChanged).toEqual([
            { field: "data.field", from: "null", to: "string" },
        ]);
    });
});

describe("isSchemaDiffEmpty", () => {
    test("returns true for empty diff", () => {
        expect(
            isSchemaDiffEmpty({ added: [], removed: [], typeChanged: [] }),
        ).toBe(true);
    });

    test("returns false when added fields exist", () => {
        expect(
            isSchemaDiffEmpty({
                added: ["new_field"],
                removed: [],
                typeChanged: [],
            }),
        ).toBe(false);
    });

    test("returns false when removed fields exist", () => {
        expect(
            isSchemaDiffEmpty({
                added: [],
                removed: ["old_field"],
                typeChanged: [],
            }),
        ).toBe(false);
    });

    test("returns false when type changes exist", () => {
        expect(
            isSchemaDiffEmpty({
                added: [],
                removed: [],
                typeChanged: [
                    { field: "x", from: "string", to: "number" },
                ],
            }),
        ).toBe(false);
    });
});
