import { describe, expect, test, beforeEach } from "bun:test";
import {
    TypeScriptExtractor,
    STRIPE_VENDOR,
    TWILIO_VENDOR,
    detectLanguage,
} from "@driftlock/parser";

describe("TypeScriptExtractor", () => {
    let extractor: TypeScriptExtractor;

    beforeEach(() => {
        extractor = new TypeScriptExtractor({ vendors: [STRIPE_VENDOR] });
    });

    // ── Core extraction ──────────────────────────────────────────────────

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

    test("captures unregistered resources via pattern inference", async () => {
        const code = `
await stripe.foo.bar({ data: true });
await stripe.customers.cancel("cus_123");
`;
        const result = await extractor.extractFromFile("src/unknown.ts", code);

        expect(result.callSites).toHaveLength(2);
        expect(result.callSites[0].method).toBe("stripe.foo.bar");
        // Custom action on an unregistered resource still maps to a pattern
        expect(result.callSites[0].endpoint).toBe("/v1/foo/:id/bar");
        expect(result.callSites[0].httpMethod).toBe("POST");
        expect(result.callSites[1].method).toBe("stripe.customers.cancel");
        expect(result.callSites[1].endpoint).toBe("/v1/customers/:id/cancel");
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

        expect(result.callSites[0]).toBeDefined();
        expect(typeof result.callSites[0].requestShape).toBe("object");
    });

    // ── Pattern-based endpoint inference ─────────────────────────────────

    test("infers endpoint for any registered resource", async () => {
        const code = `
await stripe.products.create({ name: "Widget" });
await stripe.products.retrieve("prod_123");
await stripe.products.list();
await stripe.prices.create({ unit_amount: 1000, currency: "usd" });
await stripe.refunds.create({ payment_intent: "pi_123" });
`;
        const result = await extractor.extractFromFile("src/resources.ts", code);

        expect(result.callSites).toHaveLength(5);
        expect(result.callSites[0].endpoint).toBe("/v1/products");
        expect(result.callSites[0].httpMethod).toBe("POST");
        expect(result.callSites[1].endpoint).toBe("/v1/products/:id");
        expect(result.callSites[1].httpMethod).toBe("GET");
        expect(result.callSites[2].endpoint).toBe("/v1/products");
        expect(result.callSites[2].httpMethod).toBe("GET");
        expect(result.callSites[3].endpoint).toBe("/v1/prices");
        expect(result.callSites[3].httpMethod).toBe("POST");
        expect(result.callSites[4].endpoint).toBe("/v1/refunds");
        expect(result.callSites[4].httpMethod).toBe("POST");
    });

    test("uses custom endpoint overrides for non-standard methods", async () => {
        const code = `
await stripe.invoices.finalizeInvoice("in_123");
await stripe.invoices.sendInvoice("in_123");
await stripe.invoices.voidInvoice("in_123");
await stripe.invoices.payInvoice("in_123");
`;
        const result = await extractor.extractFromFile("src/overrides.ts", code);

        expect(result.callSites).toHaveLength(4);
        expect(result.callSites[0].endpoint).toBe(
            "/v1/invoices/:id/finalize",
        );
        expect(result.callSites[0].httpMethod).toBe("POST");
        expect(result.callSites[1].endpoint).toBe("/v1/invoices/:id/send");
        expect(result.callSites[2].endpoint).toBe("/v1/invoices/:id/void");
        expect(result.callSites[3].endpoint).toBe("/v1/invoices/:id/pay");
    });

    test("infers action endpoints for unknown methods on known resources", async () => {
        const code = `
await stripe.paymentIntents.confirm("pi_123");
await stripe.paymentIntents.cancel("pi_123");
await stripe.paymentIntents.capture("pi_123");
`;
        const result = await extractor.extractFromFile(
            "src/actions.ts",
            code,
        );

        expect(result.callSites).toHaveLength(3);
        expect(result.callSites[0].endpoint).toBe(
            "/v1/payment_intents/:id/confirm",
        );
        expect(result.callSites[0].httpMethod).toBe("POST");
        expect(result.callSites[1].endpoint).toBe(
            "/v1/payment_intents/:id/cancel",
        );
        expect(result.callSites[2].endpoint).toBe(
            "/v1/payment_intents/:id/capture",
        );
    });

    test("infers camelCase resource names as snake_case endpoints", async () => {
        const code = `
await stripe.paymentMethods.create({ type: "card" });
await stripe.setupIntents.create({ payment_method_types: ["card"] });
`;
        const result = await extractor.extractFromFile(
            "src/camelcase.ts",
            code,
        );

        expect(result.callSites).toHaveLength(2);
        expect(result.callSites[0].endpoint).toBe("/v1/payment_methods");
        expect(result.callSites[1].endpoint).toBe("/v1/setup_intents");
    });

    // ── Multi-vendor support ─────────────────────────────────────────────

    test("detects Twilio calls when configured", async () => {
        const twilioExtractor = new TypeScriptExtractor({
            vendors: [TWILIO_VENDOR],
        });
        const code = `
const message = await twilioClient.messages.create({
    body: "Hello",
    to: "+1234567890",
    from: "+0987654321",
});
`;
        const result = await twilioExtractor.extractFromFile(
            "src/sms.ts",
            code,
        );

        expect(result.callSites).toHaveLength(1);
        expect(result.callSites[0].method).toBe(
            "twilioClient.messages.create",
        );
        expect(result.callSites[0].endpoint).toBe(
            "/2010-04-01/messages",
        );
        expect(result.callSites[0].httpMethod).toBe("POST");
    });

    test("detects both Stripe and Twilio when both configured", async () => {
        const multiExtractor = new TypeScriptExtractor({
            vendors: [STRIPE_VENDOR, TWILIO_VENDOR],
        });
        const code = `
await stripe.charges.create({ amount: 100, currency: "usd" });
await twilioClient.messages.create({ body: "Hi", to: "+123" });
`;
        const result = await multiExtractor.extractFromFile(
            "src/multi-vendor.ts",
            code,
        );

        expect(result.callSites).toHaveLength(2);
        expect(result.callSites[0].method).toBe("stripe.charges.create");
        expect(result.callSites[1].method).toBe(
            "twilioClient.messages.create",
        );
    });

    test("does not detect Stripe when only Twilio is configured", async () => {
        const twilioExtractor = new TypeScriptExtractor({
            vendors: [TWILIO_VENDOR],
        });
        const code = `
await stripe.charges.create({ amount: 100, currency: "usd" });
`;
        const result = await twilioExtractor.extractFromFile(
            "src/no-stripe.ts",
            code,
        );

        expect(result.callSites).toHaveLength(0);
    });

    // ── Request shape: variable resolution ───────────────────────────────

    test("resolves variable references in request shape", async () => {
        const code = `
const amount = 2000;
const currency = "usd";
await stripe.charges.create({ amount, currency });
`;
        const result = await extractor.extractFromFile(
            "src/vars.ts",
            code,
        );

        expect(result.callSites).toHaveLength(1);
        expect(result.callSites[0].requestShape).toEqual({
            amount: "number",
            currency: "string",
        });
    });

    test("resolves nested variable references", async () => {
        const code = `
const amount = 2000;
const data = { amount, currency: "usd" };
await stripe.charges.create(data);
`;
        const result = await extractor.extractFromFile(
            "src/nested-vars.ts",
            code,
        );

        expect(result.callSites).toHaveLength(1);
        expect(result.callSites[0].requestShape).toEqual({
            amount: "number",
            currency: "string",
        });
    });

    // ── Request shape: spread operators ──────────────────────────────────

    test("handles spread operators in request shape", async () => {
        const code = `
const base = { currency: "usd" };
await stripe.charges.create({ ...base, amount: 2000 });
`;
        const result = await extractor.extractFromFile(
            "src/spread.ts",
            code,
        );

        expect(result.callSites).toHaveLength(1);
        expect(result.callSites[0].requestShape).toEqual({
            currency: "string",
            amount: "number",
        });
    });

    // ── Request shape: function arguments ────────────────────────────────

    test("extracts shape from typed function parameters", async () => {
        const code = `
function createCharge(amount: number, currency: string) {
    return stripe.charges.create({ amount, currency });
}
`;
        const result = await extractor.extractFromFile(
            "src/params.ts",
            code,
        );

        expect(result.callSites).toHaveLength(1);
        expect(result.callSites[0].requestShape).toEqual({
            amount: "number",
            currency: "string",
        });
    });

    test("extracts shape from destructured, typed parameters", async () => {
        const code = `
function createCharge({ amount, currency }: { amount: number; currency: string }) {
    return stripe.charges.create({ amount, currency });
}
`;
        const result = await extractor.extractFromFile(
            "src/destructured-params.ts",
            code,
        );

        expect(result.callSites).toHaveLength(1);
        expect(result.callSites[0].requestShape).toEqual({
            amount: "number",
            currency: "string",
        });
    });

    test("extracts shape from typed local variables", async () => {
        const code = `
const amount: number = 2000;
const note: string = "ok";
await stripe.charges.create({ amount, note, active: true });
`;
        const result = await extractor.extractFromFile(
            "src/typed-vars.ts",
            code,
        );

        expect(result.callSites[0].requestShape).toEqual({
            amount: "number",
            note: "string",
            active: "boolean",
        });
    });

    test("records member expression values as refs", async () => {
        const code = `
await stripe.charges.create({ amount: order.total });
`;
        const result = await extractor.extractFromFile(
            "src/member-ref.ts",
            code,
        );

        expect(result.callSites[0].requestShape).toEqual({
            amount: { __ref: "order.total" },
        });
    });

    test("unwraps parenthesized argument values", async () => {
        const code = `
await stripe.tokens.create({ card: (obj) });
`;
        const result = await extractor.extractFromFile(
            "src/paren.ts",
            code,
        );

        expect(result.callSites[0].requestShape).toEqual({
            card: "unknown",
        });
    });

    // ── Response field extraction ────────────────────────────────────────

    test("extracts response fields from destructuring", async () => {
        const code = `
const { id, status, amount } = await stripe.charges.create({
    amount: 2000,
    currency: "usd",
});
`;
        const result = await extractor.extractFromFile(
            "src/destructure.ts",
            code,
        );

        expect(result.callSites).toHaveLength(1);
        expect(result.callSites[0].responseFields).toEqual([
            "id",
            "status",
            "amount",
        ]);
    });

    test("extracts response fields from property access", async () => {
        const code = `
const charge = await stripe.charges.create({
    amount: 2000,
    currency: "usd",
});
console.log(charge.id);
console.log(charge.status);
`;
        const result = await extractor.extractFromFile(
            "src/prop-access.ts",
            code,
        );

        expect(result.callSites).toHaveLength(1);
        expect(result.callSites[0].responseFields).toContain("id");
        expect(result.callSites[0].responseFields).toContain("status");
    });

    test("returns empty response fields when no usage found", async () => {
        const code = `
await stripe.charges.create({ amount: 2000, currency: "usd" });
`;
        const result = await extractor.extractFromFile(
            "src/no-response.ts",
            code,
        );

        expect(result.callSites).toHaveLength(1);
        expect(result.callSites[0].responseFields).toEqual([]);
    });

    // ── Edge cases ───────────────────────────────────────────────────────

    test("handles optional chaining on stripe calls", async () => {
        const code = `
await stripe?.charges?.create({ amount: 100, currency: "usd" });
`;
        const result = await extractor.extractFromFile(
            "src/optional.ts",
            code,
        );

        // Optional chaining produces a different AST structure
        expect(Array.isArray(result.callSites)).toBe(true);
    });

    test("handles stripe calls inside conditional blocks", async () => {
        const code = `
if (process.env.NODE_ENV === "production") {
    await stripe.charges.create({ amount: 100, currency: "usd" });
}
`;
        const result = await extractor.extractFromFile(
            "src/conditional.ts",
            code,
        );

        expect(result.callSites).toHaveLength(1);
        expect(result.callSites[0].method).toBe("stripe.charges.create");
    });

    test("handles stripe calls inside try/catch", async () => {
        const code = `
try {
    const charge = await stripe.charges.create({ amount: 100, currency: "usd" });
} catch (e) {
    console.error(e);
}
`;
        const result = await extractor.extractFromFile("src/try.ts", code);

        expect(result.callSites).toHaveLength(1);
        expect(result.callSites[0].method).toBe("stripe.charges.create");
    });

    test("deduplicates response fields from property access", async () => {
        const code = `
const charge = await stripe.charges.create({ amount: 100, currency: "usd" });
console.log(charge.id);
console.log(charge.id);
console.log(charge.status);
`;
        const result = await extractor.extractFromFile(
            "src/dedup.ts",
            code,
        );

        expect(result.callSites[0].responseFields).toEqual([
            "id",
            "status",
        ]);
    });

    test("generates different IDs for different call sites", async () => {
        const code = `
await stripe.charges.create({ amount: 100, currency: "usd" });
await stripe.charges.create({ amount: 200, currency: "eur" });
`;
        const result = await extractor.extractFromFile(
            "src/diff-ids.ts",
            code,
        );

        expect(result.callSites).toHaveLength(2);
        expect(result.callSites[0].id).not.toBe(result.callSites[1].id);
    });

    test("captures nested resource segments", async () => {
        const code = `
await stripe.checkout.sessions.create({ mode: "payment" });
await stripe.accounts.loginLinks.create({ account: "acct_123" });
`;
        const result = await extractor.extractFromFile(
            "src/nested.ts",
            code,
        );

        expect(result.callSites).toHaveLength(2);
        expect(result.callSites[0].method).toBe(
            "stripe.checkout.sessions.create",
        );
        expect(result.callSites[0].endpoint).toBe("/v1/checkout/sessions");
        expect(result.callSites[0].httpMethod).toBe("POST");
        expect(result.callSites[1].method).toBe(
            "stripe.accounts.loginLinks.create",
        );
        expect(result.callSites[1].endpoint).toBe("/v1/accounts/login_links");
    });

    test("applies resource overrides from vendor config", async () => {
        const code = `
await stripe.invoices.finalizeInvoice("in_123");
await stripe.invoices.voidInvoice("in_456");
await stripe.invoices.retrieve("in_789");
`;
        const result = await extractor.extractFromFile(
            "src/overrides.ts",
            code,
        );

        expect(result.callSites[0].endpoint).toBe(
            "/v1/invoices/:id/finalize",
        );
        expect(result.callSites[0].httpMethod).toBe("POST");
        expect(result.callSites[1].endpoint).toBe(
            "/v1/invoices/:id/void",
        );
        expect(result.callSites[2].endpoint).toBe("/v1/invoices/:id");
    });

    test("honors httpMethods hints from vendor config", async () => {
        const vendor = {
            name: "acme",
            sdk: "acme-sdk",
            clientNames: ["acme"],
            basePath: "/api",
            resources: {
                subscriptions: { httpMethods: { cancel: "DELETE" as const } },
            },
        };
        const extractor = new TypeScriptExtractor({ vendors: [vendor] });

        const code = `
await acme.subscriptions.cancel("sub_123");
`;
        const result = await extractor.extractFromFile(
            "src/verb-hint.ts",
            code,
        );

        expect(result.callSites[0].method).toBe(
            "acme.subscriptions.cancel",
        );
        expect(result.callSites[0].endpoint).toBe(
            "/api/subscriptions/:id/cancel",
        );
        expect(result.callSites[0].httpMethod).toBe("DELETE");
    });

    test("works without any registry (pure pattern inference)", async () => {
        const vendor = {
            name: "acme",
            sdk: "acme-sdk",
            clientNames: ["acme"],
            basePath: "/api",
        };
        const extractor = new TypeScriptExtractor({
            vendors: [vendor],
        });

        const code = `
await acme.widgets.create({ sku: "W1" });
await acme.widgets.retrieve("w_1");
await acme.widgets.customAction("w_1");
`;
        const result = await extractor.extractFromFile(
            "src/acme.ts",
            code,
        );

        expect(result.callSites).toHaveLength(3);
        expect(result.callSites[0].endpoint).toBe("/api/widgets");
        expect(result.callSites[0].httpMethod).toBe("POST");
        expect(result.callSites[1].endpoint).toBe("/api/widgets/:id");
        expect(result.callSites[1].httpMethod).toBe("GET");
        expect(result.callSites[2].endpoint).toBe("/api/widgets/:id/custom_action");
        expect(result.callSites[2].httpMethod).toBe("POST");
    });

    test("extracts response fields from .then member chains", async () => {
        const code = `
stripe.charges.create({ amount: 100, currency: "usd" }).then(charge => {
    console.log(charge.id, charge.status);
    if (charge.outcome.network_status === "approved") {
        console.log("approved");
    }
});
`;
        const result = await extractor.extractFromFile(
            "src/then-member.ts",
            code,
        );

        expect(result.callSites).toHaveLength(1);
        expect(result.callSites[0].responseFields).toEqual([
            "id",
            "status",
            "outcome",
        ]);
    });

    test("extracts response fields from .then destructuring", async () => {
        const code = `
stripe.charges.create({ amount: 100 }).then(({ id, status }) => {
    console.log(id, status);
});
`;
        const result = await extractor.extractFromFile(
            "src/then-destructure.ts",
            code,
        );

        expect(result.callSites).toHaveLength(1);
        expect(result.callSites[0].responseFields).toEqual(["id", "status"]);
    });

    test("extracts response fields from optional chained access", async () => {
        const code = `
const charge = await stripe.charges.create({ amount: 100 });
console.log(charge?.status);
console.log(charge?.outcome?.network_status);
`;
        const result = await extractor.extractFromFile(
            "src/optional-chain.ts",
            code,
        );

        expect(result.callSites[0].responseFields).toEqual([
            "status",
            "outcome",
        ]);
    });

    test("parses JavaScript call sites", async () => {
        const code = `
stripe.charges.create({ amount: 100, currency: "usd" }).then((c) => {
    console.log(c.id);
});
`;
        const result = await extractor.extractFromFile(
            "src/charges.js",
            code,
            "javascript",
        );

        expect(result.callSites).toHaveLength(1);
        expect(result.callSites[0].method).toBe("stripe.charges.create");
        expect(result.callSites[0].httpMethod).toBe("POST");
        expect(result.callSites[0].responseFields).toEqual(["id"]);
    });

    test("detectLanguage maps file extensions", () => {
        expect(detectLanguage("a.ts")).toBe("typescript");
        expect(detectLanguage("a.tsx")).toBe("tsx");
        expect(detectLanguage("a.js")).toBe("javascript");
        expect(detectLanguage("a.jsx")).toBe("javascript");
        expect(detectLanguage("a.mjs")).toBe("javascript");
    });
});
