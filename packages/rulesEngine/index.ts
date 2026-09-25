import type { ShapeDiffResult } from "@driftlock/diff";
import type { MigrationPlan, MigrationStep } from "@driftlock/migrations";
import { defineRule, type RuleDefinition } from "./ruleDefinition";
import { rulesForVendor } from "./vendorRules";

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

/**
 * The only rules the engine ships with. They are vendor-neutral on purpose:
 * anything naming a vendor lives in a `vendorRules` pack and is loaded per
 * run, so onboarding a vendor never edits this file. Each entry is a plain
 * `RuleDefinition` to prove the declarative schema covers everything the
 * engine needs — including the two patterns below.
 */
const genericRuleDefinitions: RuleDefinition[] = [
    {
        id: "generic-deprecated-field",
        name: "Generic deprecated field",
        description: "Add deprecation warning when field is removed",
        priority: 5,
        whenChange: { kind: "field_removed" },
        then: {
            type: "custom",
            payload: {
                description: "Add console.warn for deprecated field usage",
                template: "console.warn('{field} is deprecated, use {replacement} instead')",
            },
        },
    },
    {
        id: "generic-nullable-field",
        name: "Generic nullable field",
        description: "Add null check when field becomes nullable",
        priority: 5,
        whenOptionality: { wasRequired: true, nowRequired: false },
        then: {
            type: "transform",
            payload: {
                description: "Add null check for nullable field",
                template: "{field} ?? {default}",
            },
        },
    },
];

const builtInRules: Rule[] = genericRuleDefinitions.map(defineRule);

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

/**
 * An engine with the generic built-ins plus the data packs for the given
 * vendors. This is the call every entry point should reach for: the vendor
 * list is an argument, so supporting a new vendor never touches this file.
 */
export function createRulesEngineFor(vendors: string[], customRules?: Rule[]): RulesEngine {
    const engine = new RulesEngine();
    for (const vendor of vendors) {
        for (const rule of rulesForVendor(vendor)) {
            engine.addRule(rule);
        }
    }
    if (customRules) {
        for (const rule of customRules) {
            engine.addRule(rule);
        }
    }
    return engine;
}

// Barrel for policy config — keeps imports clean: from "@driftlock/rulesEngine"
export type { PolicyRule, DriftlockPolicy } from "./policyTypes";
export { loadDriftlockPolicies, policyRuleToRule, integratePoliciesWithEngine } from "./policyLoader";

// Declarative rules: vendor packs as data, compiled to live rules on load.
export type {
    ChangeMatcher,
    OptionalityMatcher,
    RuleDefinition,
} from "./ruleDefinition";
export { defineRule } from "./ruleDefinition";
export {
    registerVendorRules,
    rulesForVendor,
    stripeRules,
    twilioRules,
    vendorRuleDefinitions,
} from "./vendorRules";
