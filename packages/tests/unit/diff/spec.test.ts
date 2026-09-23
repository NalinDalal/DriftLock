import { describe, expect, test } from "bun:test";
import {
    diffSpecs,
    specFromCallSite,
    normalizeField,
} from "@driftlock/diff";

const baseSpec = {
    packageName: "stripe",
    method: "stripe.charges.create",
    endpoint: "/v1/charges",
    httpMethod: "POST",
    requestFields: [
        { name: "amount", type: "number", required: true },
        { name: "currency", type: "string", required: true },
    ],
    responseFields: [
        { name: "id", type: "string", required: true },
        { name: "status", type: "string", required: true },
    ],
    capturedAt: "2026-09-18T00:00:00.000Z",
};

describe("diffSpecs", () => {
    test("reports the id → ID rename as a rename, not remove+add", () => {
        const docs = {
            ...baseSpec,
            source: "vendor-docs" as const,
            responseFields: [
                { name: "ID", type: "string", required: true },
                { name: "status", type: "string", required: true },
            ],
        };
        const { changes, breakingChanges, hasDrift } = diffSpecs(
            { ...baseSpec, source: "code-usage" as const },
            docs,
        );

        expect(changes).toHaveLength(1);
        expect(changes[0]!.kind).toBe("field_renamed");
        expect(changes[0]!.from).toBe("id");
        expect(changes[0]!.to).toBe("ID");
        expect(changes[0]!.breaking).toBe(false);
        expect(breakingChanges).toHaveLength(0);
        expect(hasDrift).toBe(true);
    });

    test("underscore/camel atomization is also a rename (order_id vs orderId)", () => {
        const specsOld = {
            ...baseSpec,
            source: "code-usage" as const,
            requestFields: [{ name: "order_id", type: "string", required: true }],
        };
        const specsNext = {
            ...baseSpec,
            source: "vendor-docs" as const,
            requestFields: [{ name: "orderId", type: "string", required: true }],
        };
        const { changes } = diffSpecs(specsOld, specsNext);
        expect(changes[0]!.kind).toBe("field_renamed");
        expect(changes[0]!.from).toBe("order_id");
        expect(changes[0]!.to).toBe("orderId");
    });

    test("a genuinely removed field is breaking", () => {
        const { breakingChanges, changes } = diffSpecs(
            { ...baseSpec, source: "code-usage" as const },
            {
                ...baseSpec,
                source: "vendor-docs" as const,
                responseFields: [{ name: "id", type: "string", required: true }],
            },
        );
        expect(changes[0]!.kind).toBe("field_removed");
        expect(changes[0]!.field).toBe("status");
        expect(breakingChanges).toContain("response.status removed");
    });

    test("type change is flagged breaking with old/new types", () => {
        const { changes, breakingChanges } = diffSpecs(
            { ...baseSpec, source: "code-usage" as const },
            {
                ...baseSpec,
                source: "vendor-docs" as const,
                responseFields: [
                    { name: "id", type: "string", required: true },
                    { name: "status", type: "boolean", required: true },
                ],
            },
        );
        expect(changes[0]!.kind).toBe("type_changed");
        expect(changes[0]!.oldType).toBe("string");
        expect(changes[0]!.newType).toBe("boolean");
        expect(breakingChanges[0]).toBe(
            "response.status: string → boolean",
        );
    });

    test("confidence is high when either side is sandbox-observed", () => {
        const code = { ...baseSpec, source: "code-usage" as const };
        const sandbox = {
            ...baseSpec,
            source: "sandbox-capture" as const,
            responseFields: baseSpec.responseFields.map((f) => ({ ...f })),
        };
        expect(diffSpecs(code, sandbox).confidence).toBe("high");
        expect(diffSpecs(code, { ...baseSpec, source: "vendor-docs" as const }).confidence).toBe("medium");
        expect(diffSpecs(code, code).confidence).toBe("low");
    });

    test("identical specs produce no drift", () => {
        const a = specFromCallSite({
            packageName: "stripe",
            method: "stripe.charges.create",
            endpoint: "/v1/charges",
            httpMethod: "POST",
            requestShape: { amount: "number" },
            responseFields: ["id", "status"],
        });
        const b = { ...a };
        const { hasDrift, changes } = diffSpecs(a, b);
        expect(hasDrift).toBe(false);
        expect(changes).toHaveLength(0);
    });
});

describe("specFromCallSite", () => {
    test("maps an extracted call site into the shared IR", () => {
        const spec = specFromCallSite({
            packageName: "stripe",
            method: "stripe.charges.create",
            requestShape: { amount: "number", currency: "string" },
            responseFields: ["id", "status"],
        });
        expect(spec.requestFields).toEqual([
            { name: "amount", type: "number", required: true },
            { name: "currency", type: "string", required: true },
        ]);
        expect(spec.responseFields.map((f) => f.name)).toEqual(["id", "status"]);
        expect(spec.source).toBe("code-usage");
        expect(spec.endpoint).toBe("stripe.charges.create");
    });
});

describe("normalizeField", () => {
    test("collapses id/ID/order_id/orderId atoms", () => {
        expect(normalizeField("id")).toBe(normalizeField("ID"));
        expect(normalizeField("order_id")).toBe(normalizeField("orderId"));
    });
});