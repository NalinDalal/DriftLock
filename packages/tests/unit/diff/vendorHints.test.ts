import { describe, expect, test } from "bun:test";
import {
    applyFixWork,
    applyVendorHints,
    diffShapes,
    fixWorksForDiff,
    inferShape,
    type Shape,
} from "@driftlock/diff";

const PAYMENT_JS = `const Stripe = require('stripe');
const stripe = Stripe('sk_test_123');

async function createPayment(amount, currency) {
  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency,
  });

  return {
    id: paymentIntent.id,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    status: paymentIntent.status,
    source: paymentIntent.source,
    client_secret: paymentIntent.client_secret,
  };
}

module.exports = { createPayment };
`;

function shapeOf(payload: unknown): Shape {
    const node = inferShape(payload);
    if (node.kind !== "object" || !node.properties) {
        throw new Error("shapeOf expects an object payload");
    }
    return node.properties;
}

describe("applyVendorHints", () => {
    test("upgrades a removal work into a rename when the vendor declares one", () => {
        // Pure removal (no paired addition): the rename heuristic stays out,
        // leaving a `custom` work for the vendor hint to upgrade.
        const result = diffShapes(
            shapeOf({ id: "pi_1", source: "tok_visa" }),
            shapeOf({ id: "pi_1" }),
        );
        const works = fixWorksForDiff(result);
        expect(works.some((w) => w.kind === "custom")).toBe(true);

        const upgraded = applyVendorHints(works, [
            { from: "payment_intents.source", to: "payment_intents.payment_method" },
        ]);
        const rename = upgraded.find((w) => w.kind === "field_rename");
        expect(rename).toMatchObject({ from: "source", to: "payment_method" });
        expect(upgraded.some((w) => w.kind === "custom")).toBe(false);
    });

    test("leaves works untouched without a matching hint", () => {
        const result = diffShapes(
            shapeOf({ id: "pi_1", source: "tok_visa" }),
            shapeOf({ id: "pi_1" }),
        );
        const works = fixWorksForDiff(result);
        expect(applyVendorHints(works, [])).toBe(works);
        expect(
            applyVendorHints(works, [{ from: "other_thing", to: "new_thing" }]),
        ).toEqual(works);
    });

    test("vendor-declared rename fixes payment.js deterministically", () => {
        const result = diffShapes(
            shapeOf({ id: "pi_1", source: "tok_visa" }),
            shapeOf({ id: "pi_1", payment_method: "pm_1" }),
        );
        const [upgraded] = applyVendorHints(fixWorksForDiff(result), [
            { from: "source", to: "payment_method" },
        ]);
        const fixed = applyFixWork(upgraded, PAYMENT_JS);
        expect(fixed).toContain("payment_method: paymentIntent.payment_method,");
        expect(fixed).not.toContain("source");
    });
});
