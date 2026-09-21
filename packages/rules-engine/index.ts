import type { ShapeDiffResult } from "@driftlock/diff";
import type { MigrationPlan, MigrationStep } from "@driftlock/migrations";

export interface RuleContext {
    endpointId: string;
    eventType: string;
    diff: ShapeDiffResult;
    plan: MigrationPlan;
}

export interface RuleAction {
    type: "skip" | "transform" | "add_step" | "remove_step" | "reorder" | "custom";
    target?: string;
    payload?: unknown;
}

export interface Rule {
    id: string;
    name: string;
    description: string;
    vendor?: string;
    eventPattern?: string | RegExp;
    condition: (ctx: RuleContext) => boolean;
    action: (ctx: RuleContext) => RuleAction;
    priority?: number;
}

export interface RuleResult {
    applied: Rule[];
    skipped: string[];
    plan: MigrationPlan;
}

const builtInRules: Rule[] = [
    {
        id: "stripe-source-to-payment-method",
        name: "Stripe source to payment_method",
        description: "When Stripe renames source to payment_method, add billing_details",
        vendor: "stripe",
        eventPattern: /charge\.(created|updated)/,
        condition: (ctx) =>
            ctx.diff.changes.some(
                (c) =>
                    c.kind === "request_renamed" &&
                    c.from === "source" &&
                    c.to === "payment_method",
            ),
        action: (ctx) => ({
            type: "add_step",
            payload: {
                id: "add-billing-details",
                order: ctx.plan.steps.length + 1,
                description: "Add billing_details for payment_method",
                type: "add_field" as const,
                field: "billing_details",
                dependencies: [],
                status: "pending" as const,
            },
        }),
        priority: 10,
    },
    {
        id: "stripe-amount-to-cents",
        name: "Stripe amount to cents",
        description: "When Stripe changes amount from dollars to cents, add conversion",
        vendor: "stripe",
        eventPattern: /payment_intent\.(created|updated)/,
        condition: (ctx) =>
            ctx.diff.changes.some(
                (c) =>
                    c.kind === "type_changed" &&
                    c.field.includes("amount") &&
                    c.oldType === "number" &&
                    c.newType === "integer",
            ),
        action: (ctx) => ({
            type: "transform",
            payload: {
                description: "Convert amount from dollars to cents (multiply by 100)",
                template: "Math.round({field} * 100)",
            },
        }),
        priority: 20,
    },
    {
        id: "twilio-sid-prefix",
        name: "Twilio SID prefix",
        description: "When Twilio changes SID format, validate prefix",
        vendor: "twilio",
        eventPattern: /message\.(sent|received)/,
        condition: (ctx) =>
            ctx.diff.changes.some(
                (c) =>
                    c.kind === "type_changed" &&
                    c.field.includes("sid"),
            ),
        action: (ctx) => ({
            type: "custom",
            payload: {
                description: "Validate Twilio SID prefix (AC, SM, MM, etc.)",
                validation: "startsWith",
                validPrefixes: ["AC", "SM", "MM", "CA", "PN"],
            },
        }),
        priority: 15,
    },
    {
        id: "generic-deprecated-field",
        name: "Generic deprecated field",
        description: "Add deprecation warning when field is removed",
        condition: (ctx) =>
            ctx.diff.changes.some((c) => c.kind === "field_removed"),
        action: (ctx) => ({
            type: "custom",
            payload: {
                description: "Add console.warn for deprecated field usage",
                template: "console.warn('{field} is deprecated, use {replacement} instead')",
            },
        }),
        priority: 5,
    },
    {
        id: "generic-nullable-field",
        name: "Generic nullable field",
        description: "Add null check when field becomes nullable",
        condition: (ctx) =>
            ctx.diff.optionalityChanges.some(
                (c) => c.wasRequired && !c.nowRequired,
            ),
        action: (ctx) => ({
            type: "transform",
            payload: {
                description: "Add null check for nullable field",
                template: "{field} ?? {default}",
            },
        }),
        priority: 5,
    },
];

export class RulesEngine {
    private rules: Rule[] = [...builtInRules];

    addRule(rule: Rule): void {
        this.rules.push(rule);
    }

    removeRule(ruleId: string): void {
        this.rules = this.rules.filter((r) => r.id !== ruleId);
    }

    getRules(): Rule[] {
        return [...this.rules];
    }

    matchRules(ctx: RuleContext): Rule[] {
        return this.rules
            .filter((rule) => {
                if (rule.vendor && rule.vendor !== ctx.endpointId) {
                    return false;
                }

                if (rule.eventPattern) {
                    const pattern = rule.eventPattern instanceof RegExp
                        ? rule.eventPattern
                        : new RegExp(rule.eventPattern);
                    if (!pattern.test(ctx.eventType)) {
                        return false;
                    }
                }

                return rule.condition(ctx);
            })
            .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    }

    applyRules(ctx: RuleContext): RuleResult {
        const matched = this.matchRules(ctx);
        const applied: Rule[] = [];
        const skipped: string[] = [];
        let plan = { ...ctx.plan, steps: [...ctx.plan.steps] };

        for (const rule of matched) {
            const action = rule.action(ctx);

            switch (action.type) {
                case "skip":
                    skipped.push(rule.id);
                    break;

                case "add_step":
                    if (action.payload && typeof action.payload === "object") {
                        const step = action.payload as unknown as MigrationStep;
                        plan.steps.push(step);
                    }
                    applied.push(rule);
                    break;

                case "remove_step":
                    if (action.target) {
                        plan.steps = plan.steps.filter(
                            (s) => s.id !== action.target,
                        );
                    }
                    applied.push(rule);
                    break;

                case "reorder":
                    if (action.payload && typeof action.payload === "object") {
                        const order = action.payload as Record<string, number>;
                        for (const step of plan.steps) {
                            if (order[step.id] !== undefined) {
                                step.order = order[step.id];
                            }
                        }
                        plan.steps.sort((a, b) => a.order - b.order);
                    }
                    applied.push(rule);
                    break;

                case "transform":
                case "custom":
                    applied.push(rule);
                    break;
            }
        }

        return { applied, skipped, plan };
    }
}

export function createRulesEngine(customRules?: Rule[]): RulesEngine {
    const engine = new RulesEngine();
    if (customRules) {
        for (const rule of customRules) {
            engine.addRule(rule);
        }
    }
    return engine;
}
