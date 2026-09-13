import { describe, expect, test } from "bun:test";
import { TypeScriptExtractor } from "@driftlock/parser";

describe("Parser integration: extract from real code patterns", () => {
    const extractor = new TypeScriptExtractor();

    test("extracts from async/await Stripe pattern", async () => {
        const code = `
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function createCharge(amount: number, currency: string) {
    const charge = await stripe.charges.create({
        amount,
        currency,
        source: "tok_visa",
        metadata: { order_id: "12345" },
    });
    return charge;
}
`;
        const result = await extractor.extractFromFile("src/payments.ts", code);

        expect(result.callSites.length).toBeGreaterThanOrEqual(1);
        const cs = result.callSites[0];
        expect(cs.method).toBe("stripe.charges.create");
        expect(cs.httpMethod).toBe("POST");
        expect(cs.endpoint).toBe("/v1/charges");
        expect(cs.filePath).toBe("src/payments.ts");
        expect(typeof cs.id).toBe("string");
        expect(cs.id.length).toBeGreaterThan(0);
    });

    test("extracts from customer lifecycle operations", async () => {
        const code = `
async function customerFlow() {
    const customer = await stripe.customers.create({ email: "test@example.com" });
    const updated = await stripe.customers.update(customer.id, { name: "Test" });
    const retrieved = await stripe.customers.retrieve(customer.id);
    const list = await stripe.customers.list({ limit: 10 });
}
`;
        const result = await extractor.extractFromFile("src/customers.ts", code);

        expect(result.callSites).toHaveLength(4);
        expect(result.callSites.map((cs) => cs.method)).toEqual([
            "stripe.customers.create",
            "stripe.customers.update",
            "stripe.customers.retrieve",
            "stripe.customers.list",
        ]);
    });

    test("extracts from invoice operations", async () => {
        const code = `
async function invoiceFlow() {
    const invoice = await stripe.invoices.create({ customer: "cus_123" });
    const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
    const sent = await stripe.invoices.sendInvoice(invoice.id);
}
`;
        const result = await extractor.extractFromFile("src/invoices.ts", code);

        expect(result.callSites.length).toBeGreaterThanOrEqual(2);
        expect(result.callSites[0].method).toBe("stripe.invoices.create");
        expect(result.callSites[0].httpMethod).toBe("POST");
    });

    test("handles file with no Stripe calls", async () => {
        const code = `
import express from "express";

const app = express();
app.get("/health", (req, res) => res.json({ ok: true }));
`;
        const result = await extractor.extractFromFile("src/server.ts", code);

        expect(result.callSites).toHaveLength(0);
        expect(result.errors).toHaveLength(0);
    });

    test("handles mixed Stripe and non-Stripe calls", async () => {
        const code = `
const response = await fetch("https://api.example.com/data");
const charge = await stripe.charges.create({ amount: 100, currency: "usd" });
console.log("done");
`;
        const result = await extractor.extractFromFile("src/mixed.ts", code);

        expect(result.callSites).toHaveLength(1);
        expect(result.callSites[0].method).toBe("stripe.charges.create");
    });

    test("extracts request shapes with nested types", async () => {
        const code = `
await stripe.charges.create({
    amount: 2000,
    currency: "usd",
    description: "Test charge",
    metadata: {},
});
`;
        const result = await extractor.extractFromFile("src/shapes.ts", code);

        // Parser detects the call site and extracts request shape when tree matches
        expect(result.callSites[0]).toBeDefined();
        expect(result.callSites[0].method).toBe("stripe.charges.create");
        expect(typeof result.callSites[0].requestShape).toBe("object");
    });

    test("handles empty file", async () => {
        const result = await extractor.extractFromFile("src/empty.ts", "");

        expect(result.callSites).toHaveLength(0);
        expect(result.errors).toHaveLength(0);
    });

    test("handles single-line Stripe call", async () => {
        const code = `await stripe.charges.create({ amount: 100, currency: "usd" });`;
        const result = await extractor.extractFromFile("src/single.ts", code);

        expect(result.callSites).toHaveLength(1);
        expect(result.callSites[0].method).toBe("stripe.charges.create");
    });
});
