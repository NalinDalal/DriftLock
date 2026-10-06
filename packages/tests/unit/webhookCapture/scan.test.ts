import { describe, expect, test } from "bun:test";
import { branchForAlert, contentMatchesWorks } from "@driftlock/webhookCapture/prCreator";
import type { DriftAlert } from "@driftlock/webhookCapture/driftDetector";
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

describe("branchForAlert", () => {
    function alert(diff: DriftAlert["diff"]): DriftAlert {
        return {
            endpointId: "stripe",
            eventType: "payment_intent.succeeded",
            diff,
            previous: {},
            current: {},
        } as unknown as DriftAlert;
    }

    const rename = { added: ["data.object.payment_method"], removed: ["data.object.source"], typeChanged: [] };
    const retype = { added: [], removed: [], typeChanged: [{ field: "data.object.amount", from: "number", to: "string" }] };

    test("same change maps to the same branch (dedupe preserved)", () => {
        expect(branchForAlert(alert(rename))).toBe(branchForAlert(alert(rename)));
    });

    test("different changes get different branches (fixes compose)", () => {
        expect(branchForAlert(alert(rename))).not.toBe(branchForAlert(alert(retype)));
    });

    test("branch stays within bot charset and length limits", () => {
        const branch = branchForAlert(alert(rename));
        expect(branch).toMatch(/^driftlock\/[A-Za-z0-9._/-]+$/);
        expect(branch.length).toBeLessThanOrEqual(80);
    });
});
