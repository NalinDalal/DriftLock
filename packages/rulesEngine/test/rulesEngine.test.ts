import { describe, expect, test } from "bun:test";
import {
    createRulesEngine,
    createRulesEngineFor,
    defineRule,
    registerVendorRules,
    RulesEngine,
    rulesForVendor,
    type Rule,
    type RuleContext,
} from "../index";
import type { ShapeDiffResult } from "@driftlock/diff";
import type { MigrationPlan } from "@driftlock/migrations";

function makeDiff(overrides: Partial<ShapeDiffResult> = {}): ShapeDiffResult {
    return {
        addedFields: [],
        removedFields: [],
        typeChanges: [],
        optionalityChanges: [],
        breakingChanges: [],
        nonBreakingChanges: [],
        confidence: "high",
        changes: [],
        ...overrides,
    };
}

function makePlan(overrides: Partial<MigrationPlan> = {}): MigrationPlan {
    return {
        id: "test-plan",
        endpointId: "stripe",
        eventType: "charge.created",
        steps: [],
        createdAt: new Date(),
        status: "pending",
        ...overrides,
    };
}

function makeContext(overrides: Partial<RuleContext> = {}): RuleContext {
    return {
        endpointId: "stripe",
        eventType: "charge.created",
        diff: makeDiff(),
        plan: makePlan(),
        ...overrides,
    };
}

function stripeEngine(): RulesEngine {
    return createRulesEngine(rulesForVendor("stripe"));
}

describe("RulesEngine", () => {
    test("ships only vendor-neutral built-ins", () => {
        const engine = new RulesEngine();
        const rules = engine.getRules();
        expect(rules.length).toBeGreaterThan(0);
        // The generalization proof: no built-in names a vendor. Vendor
        // behaviour arrives per run via vendor packs, never with the engine.
        for (const rule of rules) {
            expect(rule.vendor).toBeUndefined();
        }
        expect(rules.map((rule) => rule.id).sort()).toEqual([
            "generic-deprecated-field",
            "generic-nullable-field",
        ]);
    });

    test("matches vendor pack rules loaded as data", () => {
        const ctx = makeContext({
            endpointId: "stripe",
            eventType: "charge.created",
            diff: makeDiff({
                changes: [
                    {
                        kind: "request_renamed",
                        field: "source",
                        from: "source",
                        to: "payment_method",
                    },
                ],
            }),
        });

        const matched = stripeEngine().matchRules(ctx);
        expect(matched.some((r) => r.id === "stripe-source-to-payment-method")).toBe(true);
    });

    test("does not match wrong vendor", () => {
        const ctx = makeContext({
            endpointId: "twilio",
            eventType: "charge.created",
            diff: makeDiff({
                changes: [
                    {
                        kind: "request_renamed",
                        field: "source",
                        from: "source",
                        to: "payment_method",
                    },
                ],
            }),
        });

        const matched = stripeEngine().matchRules(ctx);
        expect(matched.some((r) => r.id === "stripe-source-to-payment-method")).toBe(false);
    });

    test("matches event pattern", () => {
        const ctx = makeContext({
            endpointId: "stripe",
            eventType: "payment_intent.created",
            diff: makeDiff({
                changes: [
                    {
                        kind: "type_changed",
                        field: "amount",
                        oldType: "number",
                        newType: "integer",
                    },
                ],
            }),
        });

        const matched = stripeEngine().matchRules(ctx);
        expect(matched.some((r) => r.id === "stripe-amount-to-cents")).toBe(true);
    });

    test("adds step via rule action", () => {
        const ctx = makeContext({
            endpointId: "stripe",
            eventType: "charge.created",
            diff: makeDiff({
                changes: [
                    {
                        kind: "request_renamed",
                        field: "source",
                        from: "source",
                        to: "payment_method",
                    },
                ],
            }),
        });

        const result = stripeEngine().applyRules(ctx);
        expect(result.applied.length).toBeGreaterThan(0);
        expect(result.plan.steps.length).toBeGreaterThan(0);
        const step = result.plan.steps.find((s) => s.field === "billing_details");
        expect(step).toBeDefined();
        expect(step?.order).toBe(1);
    });

    test("interpolates the matched field into action templates", () => {
        const engine = new RulesEngine();
        const ctx = makeContext({
            diff: makeDiff({
                changes: [{ kind: "field_removed", field: "source", breaking: true }],
            }),
        });

        const result = engine.applyRules(ctx);
        const deprecated = result.applied.find((r) => r.id === "generic-deprecated-field");
        expect(deprecated).toBeDefined();
        const payload = deprecated
            ? (deprecated.action(ctx).payload as { template: string })
            : { template: "" };
        expect(payload.template).toContain("source");
    });

    test("sorts rules by priority", () => {
        const ctx = makeContext({
            endpointId: "stripe",
            eventType: "charge.created",
            diff: makeDiff({
                changes: [
                    {
                        kind: "request_renamed",
                        field: "source",
                        from: "source",
                        to: "payment_method",
                    },
                ],
            }),
        });

        const matched = stripeEngine().matchRules(ctx);
        for (let i = 1; i < matched.length; i++) {
            const prev = matched[i - 1].priority ?? 0;
            const curr = matched[i].priority ?? 0;
            expect(prev).toBeGreaterThanOrEqual(curr);
        }
    });
});

describe("vendor packs are data, not engine code", () => {
    test("onboards a brand-new vendor without touching the engine", () => {
        registerVendorRules("acme", [
            {
                id: "acme-widget-renamed",
                name: "Acme widget renamed",
                description: "When Acme renames widget to gadget, note it",
                vendor: "acme",
                eventPattern: "widget\\.(updated)",
                priority: 10,
                whenChange: { kind: "request_renamed", from: "widget", to: "gadget" },
                then: { type: "custom", payload: { note: "rename {from} to {to}" } },
            },
        ]);

        const engine = createRulesEngineFor(["acme"]);
        const ctx = makeContext({
            endpointId: "acme",
            eventType: "widget.updated",
            diff: makeDiff({
                changes: [
                    {
                        kind: "request_renamed",
                        field: "widget",
                        from: "widget",
                        to: "gadget",
                        breaking: true,
                    },
                ],
            }),
        });

        const matched = engine.matchRules(ctx);
        expect(matched.some((r) => r.id === "acme-widget-renamed")).toBe(true);
    });

    test("unknown vendors resolve to no rules", () => {
        expect(rulesForVendor("no-such-vendor")).toEqual([]);
    });

    test("defineRule compiles the event pattern once", () => {
        const rule = defineRule({
            id: "x",
            name: "x",
            description: "x",
            eventPattern: "charge\\.(created)",
            whenChange: { kind: "field_removed" },
            then: { type: "skip" },
        });
        expect(rule.eventPattern).toBeInstanceOf(RegExp);
    });
});

describe("createRulesEngine", () => {
    test("creates engine with custom rules", () => {
        const customRule: Rule = {
            id: "custom-rule",
            name: "Custom Rule",
            description: "Test rule",
            condition: () => true,
            action: () => ({ type: "skip" }),
        };

        const engine = createRulesEngine([customRule]);
        const rules = engine.getRules();
        expect(rules.some((r) => r.id === "custom-rule")).toBe(true);
    });

    test("preserves built-in rules", () => {
        const customRule: Rule = {
            id: "custom-rule",
            name: "Custom Rule",
            description: "Test rule",
            condition: () => true,
            action: () => ({ type: "skip" }),
        };

        const engine = createRulesEngine([customRule]);
        const rules = engine.getRules();
        expect(rules.length).toBeGreaterThan(1);
    });
});

describe("rule actions", () => {
    test("skip action adds to skipped list", () => {
        const engine = new RulesEngine();
        const skipRule: Rule = {
            id: "skip-rule",
            name: "Skip Rule",
            description: "Skip this",
            condition: () => true,
            action: () => ({ type: "skip" }),
            priority: 100,
        };
        engine.addRule(skipRule);

        const ctx = makeContext();
        const result = engine.applyRules(ctx);
        expect(result.skipped).toContain("skip-rule");
    });

    test("remove_step action removes step from plan", () => {
        const engine = new RulesEngine();
        const removeRule: Rule = {
            id: "remove-rule",
            name: "Remove Rule",
            description: "Remove step",
            condition: () => true,
            action: () => ({ type: "remove_step", target: "step-to-remove" }),
            priority: 100,
        };
        engine.addRule(removeRule);

        const ctx = makeContext({
            plan: makePlan({
                steps: [
                    {
                        id: "step-to-remove",
                        order: 1,
                        description: "Test",
                        type: "rename",
                        field: "source",
                        dependencies: [],
                        status: "pending",
                    },
                ],
            }),
        });

        const result = engine.applyRules(ctx);
        expect(result.plan.steps.length).toBe(0);
    });

    test("reorder action changes step order", () => {
        const engine = new RulesEngine();
        const reorderRule: Rule = {
            id: "reorder-rule",
            name: "Reorder Rule",
            description: "Reorder steps",
            condition: () => true,
            action: () => ({
                type: "reorder",
                payload: { "step-2": 1, "step-1": 2 },
            }),
            priority: 100,
        };
        engine.addRule(reorderRule);

        const ctx = makeContext({
            plan: makePlan({
                steps: [
                    {
                        id: "step-1",
                        order: 1,
                        description: "First",
                        type: "rename",
                        field: "source",
                        dependencies: [],
                        status: "pending",
                    },
                    {
                        id: "step-2",
                        order: 2,
                        description: "Second",
                        type: "type_change",
                        field: "amount",
                        dependencies: [],
                        status: "pending",
                    },
                ],
            }),
        });

        const result = engine.applyRules(ctx);
        expect(result.plan.steps[0].id).toBe("step-2");
        expect(result.plan.steps[1].id).toBe("step-1");
    });
});
