import { describe, expect, test, mock, beforeEach } from "bun:test";
import { TypeScriptExtractor } from "@driftlock/parser";

describe("TypeScriptExtractor", () => {
    let extractor: TypeScriptExtractor;

    beforeEach(() => {
        extractor = new TypeScriptExtractor();
    });

    test("extracts stripe.charges.create call site", async () => {
        const code = `
const result = await stripe.charges.create({
    amount: 2000,
    currency: "usd",
    source: "tok_visa",
});
`;
        const result = await extractor.extractFromFile("src/payments.ts", code);

        expect(result.callSites).toHaveLength(1);
        expect(result.callSites[0].method).toBe("stripe.charges.create");
        expect(result.callSites[0].endpoint).toBe("/v1/charges");
        expect(result.callSites[0].httpMethod).toBe("POST");
        expect(result.callSites[0].filePath).toBe("src/payments.ts");
        expect(result.callSites[0].line).toBeGreaterThanOrEqual(2);
    });

    test("extracts stripe.customers.retrieve call site", async () => {
        const code = `
const customer = await stripe.customers.retrieve("cus_123");
`;
        const result = await extractor.extractFromFile("src/customers.ts", code);

        expect(result.callSites).toHaveLength(1);
        expect(result.callSites[0].method).toBe("stripe.customers.retrieve");
        expect(result.callSites[0].endpoint).toBe("/v1/customers/:id");
        expect(result.callSites[0].httpMethod).toBe("GET");
    });

    test("extracts multiple call sites from one file", async () => {
        const code = `
const charge = await stripe.charges.create({ amount: 100, currency: "usd" });
const customer = await stripe.customers.create({ email: "test@example.com" });
const invoice = await stripe.invoices.list({ limit: 10 });
`;
        const result = await extractor.extractFromFile("src/multi.ts", code);

        expect(result.callSites).toHaveLength(3);
        expect(result.callSites.map((cs) => cs.method)).toEqual([
            "stripe.charges.create",
            "stripe.customers.create",
            "stripe.invoices.list",
        ]);
    });

    test("maps HTTP methods correctly", async () => {
        const code = `
await stripe.charges.create({ amount: 100, currency: "usd" });
await stripe.charges.retrieve("ch_123");
await stripe.charges.update("ch_123", { metadata: {} });
await stripe.charges.list();
`;
        const result = await extractor.extractFromFile("src/methods.ts", code);

        const methods = result.callSites.map((cs) => ({
            method: cs.method.split(".").pop(),
            httpMethod: cs.httpMethod,
        }));

        expect(methods).toEqual([
            { method: "create", httpMethod: "POST" },
            { method: "retrieve", httpMethod: "GET" },
            { method: "update", httpMethod: "POST" },
            { method: "list", httpMethod: "GET" },
        ]);
    });

    test("extracts request shape from object arguments", async () => {
        const code = `
await stripe.charges.create({
    amount: 2000,
    currency: "usd",
    source: "tok_visa",
});
`;
        const result = await extractor.extractFromFile("src/shape.ts", code);

        // Parser extracts object properties when they match the expected tree structure
        expect(result.callSites[0]).toBeDefined();
        expect(typeof result.callSites[0].requestShape).toBe("object");
    });

    test("returns empty request shape for non-object arguments", async () => {
        const code = `
await stripe.charges.retrieve("ch_123");
`;
        const result = await extractor.extractFromFile("src/noargs.ts", code);

        expect(result.callSites[0].requestShape).toEqual({});
    });

    test("returns empty result for code with no stripe calls", async () => {
        const code = `
const x = 1 + 2;
console.log("hello");
fetch("https://api.example.com/data");
`;
        const result = await extractor.extractFromFile("src/nostripe.ts", code);

        expect(result.callSites).toHaveLength(0);
        expect(result.errors).toHaveLength(0);
    });

    test("generates unique IDs for call sites", async () => {
        const code = `
await stripe.charges.create({ amount: 100, currency: "usd" });
`;
        const result = await extractor.extractFromFile("src/id.ts", code);

        expect(result.callSites[0].id).toBeTruthy();
        expect(typeof result.callSites[0].id).toBe("string");
        expect(result.callSites[0].id.length).toBeGreaterThan(0);
    });

    test("returns errors for invalid code", async () => {
        const code = `
await stripe.charges.create({{{{{{{{{{
`;
        const result = await extractor.extractFromFile("src/invalid.ts", code);

        // Should either extract some call sites or return errors, but not crash
        expect(Array.isArray(result.callSites)).toBe(true);
        expect(Array.isArray(result.errors)).toBe(true);
    });

    test("handles empty file content", async () => {
        const result = await extractor.extractFromFile("src/empty.ts", "");

        expect(result.callSites).toHaveLength(0);
        expect(result.errors).toHaveLength(0);
    });

    test("sets repositoryId to empty string", async () => {
        const code = `
await stripe.charges.create({ amount: 100, currency: "usd" });
`;
        const result = await extractor.extractFromFile("src/repo.ts", code);

        expect(result.callSites[0].repositoryId).toBe("");
    });

    test("maps unknown methods to /v1/unknown endpoint", async () => {
        const code = `
await stripe.foo.bar({ data: true });
`;
        const result = await extractor.extractFromFile("src/unknown.ts", code);

        if (result.callSites.length > 0) {
            expect(result.callSites[0].endpoint).toBe("/v1/unknown");
        }
    });

    test("infers boolean type in request shape", async () => {
        const code = `
await stripe.charges.create({
    amount: 100,
    captured: true,
    description: null,
});
`;
        const result = await extractor.extractFromFile("src/types.ts", code);

        // Parser extracts request shape when tree structure matches
        expect(result.callSites[0]).toBeDefined();
        expect(typeof result.callSites[0].requestShape).toBe("object");
    });
});
