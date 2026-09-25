import type { OptionalityChange, SemanticChange } from "@driftlock/diff";
import type { Rule, RuleAction, RuleContext } from "./index";

/**
 * A declarative, JSON-serializable condition on one semantic change.
 *
 * Every specified field must match (strict equality, except `fieldContains`
 * which is a substring test). Unspecified fields are wildcards. This is what
 * makes a vendor rule data instead of code: adding a vendor means writing one
 * of these, not a closure in the engine.
 */
export interface ChangeMatcher {
    kind?: string;
    field?: string;
    fieldContains?: string;
    from?: string;
    to?: string;
    oldType?: string;
    newType?: string;
    breaking?: boolean;
}

/**
 * The same idea for optionality changes, which live on
 * `diff.optionalityChanges` rather than `diff.changes`.
 */
export interface OptionalityMatcher {
    field?: string;
    fieldContains?: string;
    wasRequired?: boolean;
    nowRequired?: boolean;
}

/**
 * A whole rule as data. No functions, no RegExp objects, so a vendor pack can
 * live in JSON, a YAML file, or a `VendorConfig` — anywhere code cannot go.
 *
 * Placeholders in action strings (`{field}`, `{from}`, `{to}`, `{oldType}`,
 * `{newType}`) are filled from the first matching change when the rule fires.
 * Placeholders with no source (e.g. `{replacement}`) are left intact for a
 * downstream step to resolve. An `add_step` payload may use
 * `"order": "append"` to land after the plan's current last step.
 */
export interface RuleDefinition {
    id: string;
    name: string;
    description: string;
    vendor?: string;
    /** String form of the event regex; compiled once by `defineRule`. */
    eventPattern?: string;
    priority?: number;
    /** Fires when any change in `diff.changes` satisfies every set field. */
    whenChange?: ChangeMatcher;
    /** Fires when any change in `diff.optionalityChanges` satisfies it. */
    whenOptionality?: OptionalityMatcher;
    then: RuleAction;
}

export function matchesChange(change: SemanticChange, matcher: ChangeMatcher): boolean {
    if (matcher.kind !== undefined && change.kind !== matcher.kind) return false;
    if (matcher.field !== undefined && change.field !== matcher.field) return false;
    if (matcher.fieldContains !== undefined && !change.field.includes(matcher.fieldContains)) {
        return false;
    }
    if (matcher.from !== undefined && change.from !== matcher.from) return false;
    if (matcher.to !== undefined && change.to !== matcher.to) return false;
    if (matcher.oldType !== undefined && change.oldType !== matcher.oldType) return false;
    if (matcher.newType !== undefined && change.newType !== matcher.newType) return false;
    if (matcher.breaking !== undefined && change.breaking !== matcher.breaking) return false;
    return true;
}

export function matchesOptionality(
    change: OptionalityChange,
    matcher: OptionalityMatcher,
): boolean {
    if (matcher.field !== undefined && change.field !== matcher.field) return false;
    if (matcher.fieldContains !== undefined && !change.field.includes(matcher.fieldContains)) {
        return false;
    }
    if (matcher.wasRequired !== undefined && change.wasRequired !== matcher.wasRequired) {
        return false;
    }
    if (matcher.nowRequired !== undefined && change.nowRequired !== matcher.nowRequired) {
        return false;
    }
    return true;
}

type InterpolationSource = Record<string, unknown>;

function firstMatchSource(ctx: RuleContext, def: RuleDefinition): InterpolationSource {
    if (def.whenChange) {
        const hit = ctx.diff.changes.find((change) => matchesChange(change, def.whenChange!));
        if (hit) return hit as unknown as InterpolationSource;
    }
    if (def.whenOptionality) {
        const hit = ctx.diff.optionalityChanges.find((change) =>
            matchesOptionality(change, def.whenOptionality!),
        );
        if (hit) return hit as unknown as InterpolationSource;
    }
    return {};
}

function interpolateString(template: string, source: InterpolationSource): string {
    return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
        const value = source[key];
        return value === undefined || value === null ? whole : String(value);
    });
}

function interpolatePayload(payload: unknown, source: InterpolationSource): unknown {
    if (typeof payload === "string") return interpolateString(payload, source);
    if (Array.isArray(payload)) {
        return payload.map((entry) => interpolatePayload(entry, source));
    }
    if (payload && typeof payload === "object") {
        const out: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(payload)) {
            out[key] = interpolatePayload(value, source);
        }
        return out;
    }
    return payload;
}

/**
 * Compiles a serializable definition into the live `Rule` the engine runs.
 * The only compile-time work is the event regex; everything else is a data
 * comparison per change, so a bad definition fails to match rather than
 * throwing.
 */
export function defineRule(def: RuleDefinition): Rule {
    const eventPattern = def.eventPattern ? new RegExp(def.eventPattern) : undefined;
    return {
        id: def.id,
        name: def.name,
        description: def.description,
        vendor: def.vendor,
        eventPattern,
        priority: def.priority,
        condition: (ctx) => {
            const changeHit =
                !def.whenChange ||
                ctx.diff.changes.some((change) => matchesChange(change, def.whenChange!));
            const optionalityHit =
                !def.whenOptionality ||
                ctx.diff.optionalityChanges.some((change) =>
                    matchesOptionality(change, def.whenOptionality!),
                );
            return changeHit && optionalityHit;
        },
        action: (ctx) => {
            const source = firstMatchSource(ctx, def);
            const action = interpolatePayload(def.then, source) as RuleAction;
            if (
                action.type === "add_step" &&
                action.payload &&
                typeof action.payload === "object" &&
                (action.payload as Record<string, unknown>).order === "append"
            ) {
                return {
                    ...action,
                    payload: {
                        ...(action.payload as Record<string, unknown>),
                        order: ctx.plan.steps.length + 1,
                    },
                };
            }
            return action;
        },
    };
}
