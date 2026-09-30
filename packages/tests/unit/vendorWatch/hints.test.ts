import { describe, expect, test } from "bun:test";
import { replacementHints } from "@driftlock/vendorWatch";

describe("replacementHints", () => {
    test("pairs one removal with one addition under the same parent", () => {
        expect(
            replacementHints(
                ["payment_intents.source"],
                ["payment_intents.payment_method"],
            ),
        ).toEqual([
            { from: "payment_intents.source", to: "payment_intents.payment_method" },
        ]);
    });

    test("pairs top-level members with an empty parent", () => {
        expect(replacementHints(["source"], ["payment_method"])).toEqual([
            { from: "source", to: "payment_method" },
        ]);
    });

    test("ambiguous parents do not pair", () => {
        expect(
            replacementHints(
                ["payment_intents.source", "payment_intents.bitcoin"],
                ["payment_intents.payment_method"],
            ),
        ).toEqual([]);
    });

    test("different parents do not pair", () => {
        expect(
            replacementHints(["charges.source"], ["payment_intents.payment_method"]),
        ).toEqual([]);
    });

    test("empty inputs pair nothing", () => {
        expect(replacementHints([], [])).toEqual([]);
        expect(replacementHints(["a.b"], [])).toEqual([]);
        expect(replacementHints([], ["a.c"])).toEqual([]);
    });
});
