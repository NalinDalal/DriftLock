import { describe, expect, test } from "bun:test";
import { TypeScriptExtractor, STRIPE_VENDOR, TWILIO_VENDOR } from "@driftlock/parser";

describe("Parser integration: extract from real code patterns", () => {
    const extractor = new TypeScriptExtractor({
        vendors: [STRIPE_VENDOR],
    });

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

    // ── New integration tests ────────────────────────────────────────────

    test("extracts payment intent lifecycle with custom actions", async () => {
        const code = `
async function paymentFlow() {
    const intent = await stripe.paymentIntents.create({
        amount: 5000,
        currency: "usd",
    });
    const confirmed = await stripe.paymentIntents.confirm(intent.id);
    const captured = await stripe.paymentIntents.capture(intent.id);
}
`;
        const result = await extractor.extractFromFile(
            "src/payment-intents.ts",
            code,
        );

        expect(result.callSites).toHaveLength(3);
        expect(result.callSites[0].endpoint).toBe("/v1/payment_intents");
        expect(result.callSites[1].endpoint).toBe(
            "/v1/payment_intents/:id/confirm",
        );
        expect(result.callSites[2].endpoint).toBe(
            "/v1/payment_intents/:id/capture",
        );
    });

    test("extracts from real-world code with variable resolution and destructuring", async () => {
        const code = `
import Stripe from "stripe";
const stripe = new Stripe("sk_test_123");

export async function processPayment(amount: number) {
    const currency = "usd";
    const metadata = { order_id: "12345" };

    const { id, status } = await stripe.charges.create({
        amount,
        currency,
        metadata,
    });

    if (status === "succeeded") {
        const charge = await stripe.charges.retrieve(id);
        return charge;
    }
}
`;
        const result = await extractor.extractFromFile(
            "src/real-world.ts",
            code,
        );

        expect(result.callSites).toHaveLength(2);

        // First call: create
        expect(result.callSites[0].method).toBe("stripe.charges.create");
        expect(result.callSites[0].httpMethod).toBe("POST");
        expect(result.callSites[0].requestShape).toHaveProperty("amount");
        expect(result.callSites[0].requestShape).toHaveProperty("currency");
        expect(result.callSites[0].requestShape).toHaveProperty("metadata");
        expect(result.callSites[0].responseFields).toEqual(["id", "status"]);

        // Second call: retrieve
        expect(result.callSites[1].method).toBe("stripe.charges.retrieve");
        expect(result.callSites[1].httpMethod).toBe("GET");
        expect(result.callSites[1].endpoint).toBe("/v1/charges/:id");
    });

    test("extracts subscription with cancel action", async () => {
        const code = `
async function manageSubscription(subId: string) {
    const sub = await stripe.subscriptions.retrieve(subId);
    await stripe.subscriptions.cancel(subId);
}
`;
        const result = await extractor.extractFromFile(
            "src/subscriptions.ts",
            code,
        );

        expect(result.callSites).toHaveLength(2);
        expect(result.callSites[0].endpoint).toBe("/v1/subscriptions/:id");
        expect(result.callSites[1].endpoint).toBe(
            "/v1/subscriptions/:id/cancel",
        );
    });

    test("handles multi-vendor codebase", async () => {
        const multiExtractor = new TypeScriptExtractor({
            vendors: [STRIPE_VENDOR, TWILIO_VENDOR],
        });
        const code = `
import Stripe from "stripe";
import Twilio from "twilio";

const stripe = new Stripe("sk_test");
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);

async function notifyAndCharge(userId: string, amount: number) {
    await stripe.charges.create({ amount, currency: "usd" });
    await twilioClient.messages.create({
        body: "Payment processed!",
        to: "+1234567890",
        from: "+0987654321",
    });
}
`;
        const result = await multiExtractor.extractFromFile(
            "src/multi-vendor.ts",
            code,
        );

        expect(result.callSites).toHaveLength(2);
        expect(result.callSites[0].method).toBe("stripe.charges.create");
        expect(result.callSites[0].endpoint).toBe("/v1/charges");
        expect(result.callSites[1].method).toBe(
            "twilioClient.messages.create",
        );
        expect(result.callSites[1].endpoint).toBe(
            "/2010-04-01/messages",
        );
    });
});
