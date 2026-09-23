/**
 * Policy loader inspired by CodeRifts' .coderifts.yml config-as-code approach.
 * 
 * Loads policy configuration from .driftlock.yml (or .coderifts.yml for compatibility).
 * Default policies work with no config file - add policies only for rules you want
 * to override or enforce.
 * 
 * YAML format (CodeRifts-inspired):
 * ```
 * policies:
 *   - name: protect-payments
 *     rule: no_endpoint_removal
 *     match: "/payments/*"
 *     severity: block
 *   - name: cap-breaking-changes
 *     rule: max_breaking_changes
 *     value: 3
 *     severity: warn
 * ```
 */

import yaml from "js-yaml";
import type { DriftlockPolicy, PolicyRule } from "./policyTypes";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Default policies that work with no config file.
 * These map internal rule IDs to severities and constraints.
 */
const defaultPolicies: PolicyRule[] = [];

/**
 * Load policies from .driftlock.yml or .coderifts.yml
 */
export function loadDriftlockPolicies(
    configPath?: string
): PolicyRule[] {
    let pathToCheck = configPath;

    // Check for .driftlock.yml first, then .coderifts.yml
    if (!pathToCheck) {
        const possiblePaths = [
            resolve(process.cwd(), ".driftlock.yml"),
            resolve(process.cwd(), ".coderifts.yml"),
        ];

        for (const p of possiblePaths) {
            try {
                readFileSync(p, "utf-8");
                pathToCheck = p;
                break;
            } catch {
                // File doesn't exist, continue checking
            }
        }
    }

    // If no config file found, return default policies
    if (!pathToCheck) {
        return defaultPolicies;
    }

    try {
        const content = readFileSync(pathToCheck, "utf-8");
        const parsed = yaml.load(content) as DriftlockPolicy;

        if (!parsed || !Array.isArray(parsed.policies)) {
            console.warn(
                `.driftlock.yml found but no valid policies array. Using defaults.`
            );
            return defaultPolicies;
        }

        return parsed.policies;
    } catch (error) {
        console.warn(
            `Failed to parse .driftlock.yml: ${error instanceof Error ? error.message : error}. Using defaults.`
        );
        return defaultPolicies;
    }
}

/**
 * Convert a PolicyRule to a RulesEngine Rule
 */
export function policyRuleToRule(rule: PolicyRule): import("./index").Rule {
    const ruleMap: Record<string, import("./index").Rule> = {
        no_endpoint_removal: {
            id: "protect-endpoint-" + rule.match?.replace(/\//g, "") || "unknown",
            name: rule.name,
            description: rule.description || `Prevent ${rule.rule} changes`,
            vendor: rule.match ? rule.match.split("/")[1] : undefined,
            eventPattern: rule.match ? new RegExp(rule.match) : undefined,
            condition: (ctx: any) => {
                const changes = ctx.diff.changes as any[];
                return changes.some((c: any) => c.kind === rule.rule);
            },
            action: (ctx: any) => ({
                type: "skip",
                payload: { severity: rule.severity },
            }),
            priority: 10,
        },
        max_breaking_changes: {
            id: "cap-breaking-changes",
            name: rule.name,
            description: rule.description || "Limit breaking changes per PR",
            vendor: undefined,
            eventPattern: undefined,
            condition: (ctx: any) => {
                const max = rule.value ? Number(rule.value) : 3;
                const changes = ctx.diff.changes as any[];
                return changes.filter((c: any) => c.breaking).length > max;
            },
            action: (ctx: any) => ({
                type: "skip",
                payload: { severity: rule.severity },
            }),
            priority: 20,
        },
    };

    return ruleMap[rule.rule] || {
        id: rule.name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
        name: rule.name,
        description: rule.description || `Policy: ${rule.rule}`,
        vendor: rule.match ? rule.match.split("/")[1] : undefined,
        eventPattern: rule.match ? new RegExp(rule.match) : undefined,
        condition: (ctx: any) => true,
        action: (ctx: any) => ({
            type: "skip",
            payload: { severity: rule.severity },
        }),
        priority: 10,
    };
}

/**
 * Load policies and integrate with RulesEngine
 */
export function integratePoliciesWithEngine(
    engine: import("./index").RulesEngine,
    configPath?: string
): import("./index").RulesEngine {
    const policies = loadDriftlockPolicies(configPath);

    for (const policy of policies) {
        const rule = policyRuleToRule(policy);
        engine.addRule(rule);
    }

    return engine;
}

export default loadDriftlockPolicies;