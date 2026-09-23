/**
 * Policy configuration format inspired by CodeRifts' .coderifts.yml
 * Config-as-code for API governance policies.
 * 
 * This file is optional - default policies work with no file present.
 * Add policies only for rules you want to override or enforce.
 */
export interface PolicyRule {
    name: string;
    rule: string;
    match?: string;
    value?: number | string;
    severity: "warn" | "block" | "allow";
    description?: string;
}

export interface DriftlockPolicy {
    policies: PolicyRule[];
    /** Global settings for the policy engine */
    global?: {
        /** Default severity if not specified per-policy */
        defaultSeverity?: "warn" | "block" | "allow";
        /** Max breaking changes allowed per PR before blocking */
        maxBreakingChanges?: number;
    };
}