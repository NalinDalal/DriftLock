import { defineRule, type RuleDefinition } from "./ruleDefinition";
import type { Rule } from "./index";

/**
 * Vendor migration hints as data, not engine code.
 *
 * Each pack is a list of serializable `RuleDefinition`s: no closures, no
 * RegExp literals. Onboarding a new vendor means adding an entry here (or
 * registering one at runtime with `registerVendorRules`), then asking for it
 * with `rulesForVendor`. Nothing in the engine changes.
 */

export const stripeRules: RuleDefinition[] = [
    {
        id: "stripe-source-to-payment-method",
        name: "Stripe source to payment_method",
        description: "When Stripe renames source to payment_method, add billing_details",
        vendor: "stripe",
        eventPattern: "charge\\.(created|updated)",
        priority: 10,
        whenChange: { kind: "request_renamed", from: "source", to: "payment_method" },
        then: {
            type: "add_step",
            payload: {
                id: "add-billing-details",
                order: "append",
                description: "Add billing_details for payment_method",
                type: "add_field",
                field: "billing_details",
                dependencies: [],
                status: "pending",
            },
        },
    },
    {
        id: "stripe-amount-to-cents",
        name: "Stripe amount to cents",
        description: "When Stripe changes amount from dollars to cents, add conversion",
        vendor: "stripe",
        eventPattern: "payment_intent\\.(created|updated)",
        priority: 20,
        whenChange: {
            kind: "type_changed",
            fieldContains: "amount",
            oldType: "number",
            newType: "integer",
        },
        then: {
            type: "transform",
            payload: {
                description: "Convert amount from dollars to cents (multiply by 100)",
                template: "Math.round({field} * 100)",
            },
        },
    },
];

export const twilioRules: RuleDefinition[] = [
    {
        id: "twilio-sid-prefix",
        name: "Twilio SID prefix",
        description: "When Twilio changes SID format, validate prefix",
        vendor: "twilio",
        eventPattern: "message\\.(sent|received)",
        priority: 15,
        whenChange: { kind: "type_changed", fieldContains: "sid" },
        then: {
            type: "custom",
            payload: {
                description: "Validate Twilio SID prefix (AC, SM, MM, etc.)",
                validation: "startsWith",
                validPrefixes: ["AC", "SM", "MM", "CA", "PN"],
            },
        },
    },
];

/**
 * The registry. Seed packs live here; anyone can add a vendor at runtime
 * without touching the engine or this file.
 */
const vendorRulePacks: Record<string, RuleDefinition[]> = {
    stripe: stripeRules,
    twilio: twilioRules,
};

export function registerVendorRules(vendor: string, definitions: RuleDefinition[]): void {
    const existing = vendorRulePacks[vendor] ?? [];
    vendorRulePacks[vendor] = [...existing, ...definitions];
}

/** Vendor pack definitions, uncompiled. Empty for unknown vendors. */
export function vendorRuleDefinitions(vendor: string): RuleDefinition[] {
    return [...(vendorRulePacks[vendor] ?? [])];
}

/** Vendor pack compiled into live rules. Empty for unknown vendors. */
export function rulesForVendor(vendor: string): Rule[] {
    return vendorRuleDefinitions(vendor).map(defineRule);
}
