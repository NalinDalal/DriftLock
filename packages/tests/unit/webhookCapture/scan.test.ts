import { describe, expect, test } from "bun:test";
import { contentMatchesWorks } from "@driftlock/webhookCapture/prCreator";
import type { FixWork } from "@driftlock/diff";

function custom(field: string): FixWork[] {
    return [{ kind: "custom", field, description: "", template: "", confidence: "high" }];
}

describe("contentMatchesWorks", () => {
    test("matches dotted member access", () => {
        expect(contentMatchesWorks("return obj.source;", custom("data.object.source"))).toBe(true);
    });

    test("matches files that only destructure the removed field", () => {
        expect(
            contentMatchesWorks("const { source, amount } = obj;", custom("data.object.source")),
        ).toBe(true);
    });

    test("matches shorthand and object-literal keys", () => {
        expect(contentMatchesWorks("use({ source });", custom("source"))).toBe(true);
        expect(contentMatchesWorks("create({ source: tok });", custom("source"))).toBe(true);
    });

    test("does not match unrelated code", () => {
        expect(contentMatchesWorks("return obj.amount;", custom("data.object.source"))).toBe(false);
        expect(contentMatchesWorks("const id = legacy_id;", custom("data.object.source"))).toBe(false);
    });

    test("matches member access for type coercion works", () => {
        const works = [{ kind: "type_coercion", field: "data.object.amount", description: "", template: "", confidence: "high" as const }];
        expect(contentMatchesWorks("cents: obj.amount", works)).toBe(true);
        expect(contentMatchesWorks("return obj.status;", works)).toBe(false);
    });
});
