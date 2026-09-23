import { describe, expect, test } from "bun:test";
import {
    generateAIFixSync,
    type FixContext,
    type AIFixConfig,
} from "../index";
import type { FixWork, ShapeDiffResult } from "@driftlock/diff";

function makeContext(
    overrides: Partial<FixContext> = {},
): FixContext {
    const diff: ShapeDiffResult = {
        addedFields: ["payment_method"],
        removedFields: ["source"],
        typeChanges: [],
        optionalityChanges: [],
        breakingChanges: [],
        nonBreakingChanges: [],
        confidence: "high",
        changes: [],
    };

    const works: FixWork[] = [
        {
            kind: "field_rename",
            field: "source",
            from: "source",
            to: "payment_method",
            description: "Rename source to payment_method",
            template: "rename",
            confidence: "high",
        },
    ];

    const sourceCode = `
import Stripe from "stripe";
const stripe = new Stripe("sk_test");

export async function createCharge(amount: number) {
    const result = await stripe.charges.create({
        amount,
        source: "tok_visa",
    });
    return result.source;
}
`;

    return {
        diff,
        works,
        sourceCode,
        filePath: "src/stripe-handler.ts",
        eventType: "charge.created",
        ...overrides,
    };
}

describe("generateAIFixSync", () => {
    test("extracts code from markdown block", () => {
        const mockResponse = `\`\`\`typescript
import Stripe from "stripe";
const stripe = new Stripe("sk_test");

export async function createCharge(amount: number) {
    const result = await stripe.charges.create({
        amount,
        payment_method: "pm_123",
    });
    return result.payment_method;
}
\`\`\`

Changed \`source\` to \`payment_method\` to match the new schema.
Confidence: 95`;

        const result = generateAIFixSync(makeContext(), mockResponse);

        expect(result.fixedCode).toContain("payment_method");
        expect(result.fixedCode).not.toContain('source: "tok_visa"');
        expect(result.confidence).toBe(95);
        expect(result.explanation).toContain("Changed");
    });

    test("extracts confidence from response", () => {
        const mockResponse = `\`\`\`typescript
const x = 1;
\`\`\`

Confidence: 80`;

        const result = generateAIFixSync(makeContext(), mockResponse);
        expect(result.confidence).toBe(80);
    });

    test("defaults confidence to 70 when not specified", () => {
        const mockResponse = `\`\`\`typescript
const x = 1;
\`\`\`

No confidence mentioned.`;

        const result = generateAIFixSync(makeContext(), mockResponse);
        expect(result.confidence).toBe(70);
    });

    test("throws when no code block found", () => {
        const mockResponse = "I cannot fix this code.";

        expect(() => generateAIFixSync(makeContext(), mockResponse)).toThrow(
            "AI returned no code",
        );
    });

    test("handles multiline code with imports", () => {
        const mockResponse = `\`\`\`typescript
import Stripe from "stripe";
import { logger } from "./utils";

const stripe = new Stripe("sk_test");

export async function createCharge(amount: number) {
    logger.info("Creating charge");
    const result = await stripe.charges.create({
        amount,
        payment_method: process.env.PAYMENT_METHOD ?? "pm_default",
    });
    return result.payment_method;
}
\`\`\`

Added null check for payment_method.
Confidence: 90`;

        const result = generateAIFixSync(makeContext(), mockResponse);

        expect(result.fixedCode).toContain("import Stripe");
        expect(result.fixedCode).toContain("import { logger }");
        expect(result.fixedCode).toContain("payment_method");
        expect(result.confidence).toBe(90);
    });

    test("builds correct prompt context", () => {
        const ctx = makeContext({
            filePath: "src/payments/checkout.ts",
            eventType: "checkout.session.completed",
        });

        expect(ctx.filePath).toBe("src/payments/checkout.ts");
        expect(ctx.eventType).toBe("checkout.session.completed");
        expect(ctx.diff.addedFields).toContain("payment_method");
        expect(ctx.diff.removedFields).toContain("source");
    });
});
