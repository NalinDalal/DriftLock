import { describe, expect, test } from "bun:test";
import { RulesEngine, createRulesEngine, type Rule, type RuleContext } from "../index";
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

describe("RulesEngine", () => {
    test("has built-in rules", () => {
        const engine = new RulesEngine();
        const rules = engine.getRules();
        expect(rules.length).toBeGreaterThan(0);
    });

    test("matches vendor-specific rules", () => {
        const engine = new RulesEngine();
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

        const matched = engine.matchRules(ctx);
        expect(matched.length).toBeGreaterThan(0);
        expect(matched.some((r) => r.id === "stripe-source-to-payment-method")).toBe(true);
    });

    test("does not match wrong vendor", () => {
        const engine = new RulesEngine();
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

        const matched = engine.matchRules(ctx);
        expect(matched.some((r) => r.id === "stripe-source-to-payment-method")).toBe(false);
    });

    test("matches event pattern", () => {
        const engine = new RulesEngine();
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

        const matched = engine.matchRules(ctx);
        expect(matched.some((r) => r.id === "stripe-amount-to-cents")).toBe(true);
    });

    test("adds step via rule action", () => {
        const engine = new RulesEngine();
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

        const result = engine.applyRules(ctx);
        expect(result.applied.length).toBeGreaterThan(0);
        expect(result.plan.steps.length).toBeGreaterThan(0);
        expect(result.plan.steps.some((s) => s.field === "billing_details")).toBe(true);
    });

    test("sorts rules by priority", () => {
        const engine = new RulesEngine();
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

        const matched = engine.matchRules(ctx);
        for (let i = 1; i < matched.length; i++) {
            const prev = matched[i - 1].priority ?? 0;
            const curr = matched[i].priority ?? 0;
            expect(prev).toBeGreaterThanOrEqual(curr);
        }
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
