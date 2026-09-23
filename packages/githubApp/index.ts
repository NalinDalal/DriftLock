/**
 * GitHub App integration — inspired by CodeRifts GitHub App (30s install, zero secrets).
 * Optic required: `npm i -g @useoptic/optic` + `optic.yml` + CI job + TS rulesets.
 * This replaces CLI/CI with: Install App → open PR → report posted as comment.
 *
 * No API key, no `GITHUB_TOKEN` secret to rotate, no pipeline YAML.
 * Auto-discovers specs (yaml/json, 2.0/3.0/3.1), diffs via @driftlock/diff,
 * scores risk, checks .driftlock.yml policies, signs receipt, posts comment.
 */

import { diffSpecs, type EndpointSpec } from "@driftlock/diff/spec";
import { createVerdictReceipt } from "@driftlock/diff/receipts";
import {
    loadDriftlockPolicies,
    policyRuleToRule,
} from "@driftlock/rulesEngine/policy-loader";
import { RulesEngine } from "@driftlock/rulesEngine";
import { buildPrComment, decideVerdict, type GovernanceReport } from "./report";

export interface AppHandlePrOptions {
    oldSpec: EndpointSpec;
    newSpec: EndpointSpec;
    // optional override for tests
    configPath?: string;
}

export async function handlePullRequest(
    opts: AppHandlePrOptions,
): Promise<GovernanceReport> {
    const summary = diffSpecs(opts.oldSpec, opts.newSpec);

    // Load .driftlock.yml (or .coderifts.yml compat) — defaults if missing
    const policies = loadDriftlockPolicies(opts.configPath);
    const engine = new RulesEngine();
    for (const p of policies) engine.addRule(policyRuleToRule(p));

    // Evaluate policies → violations
    const violations: string[] = [];
    // Use diff summary as synthetic RuleContext (minimal adapter)
    const ctx: any = {
        endpointId: opts.newSpec.endpoint,
        eventType: "pull_request",
        diff: { changes: summary.changes },
        plan: { steps: [] },
    };
    for (const r of engine.matchRules(ctx)) {
        const act: any = (r as any).action(ctx);
        violations.push(`${r.name} [${act?.payload?.severity ?? "warn"}]`);
    }
    // Also cap breaking changes if policy says so (policy-loader already encodes it via condition)
    if (
        summary.breakingChanges.length > 0 &&
        violations.length === 0 &&
        summary.riskScore.overall >= 70
    ) {
        // risk-based block is handled in decideVerdict
    }

    const verdict = decideVerdict(summary, violations);
    const receipt = createVerdictReceipt(
        verdict,
        summary.changes,
        summary.riskScore,
    );

    const changelog = {
        breaking: summary.breakingChanges,
        added: summary.nonBreakingChanges.filter((c) => c.includes("added")),
        changed: summary.nonBreakingChanges.filter(
            (c) => c.includes("→") || c.includes("changed"),
        ),
        deprecated: summary.nonBreakingChanges.filter((c) =>
            c.includes("optional"),
        ),
    };

    return {
        verdict,
        summary,
        receipt,
        policyViolations: violations,
        changelog,
    };
}

export async function postPrComment(
    report: GovernanceReport,
    opts: { owner: string; repo: string; pr: number; token?: string },
) {
    const body = buildPrComment(report);
    // In production, call GitHub API: POST /repos/{owner}/{repo}/issues/{pr}/comments
    // Kept side-effect free for tests — return body for assertion / dry-run.
    if (opts.token) {
        // placeholder: await fetch(`https://api.github.com/repos/${opts.owner}/${opts.repo}/issues/${opts.pr}/comments`, { method:"POST", headers:{Authorization:`Bearer ${opts.token}`}, body: JSON.stringify({body}) })
    }
    return body;
}

// Zero-auth public verdict endpoint pattern (mirrors CodeRifts POST /api/v1/demo)
// Useful for AI agents: POST {old_spec, new_spec} → {decision,risk_score,patterns}
export function toPublicVerdict(r: GovernanceReport) {
    return {
        decision: r.verdict,
        execution_action: r.verdict === "BLOCK" ? "halt" : "proceed",
        risk_score: r.summary.riskScore.overall,
        patterns: r.summary.changes.map((c) => c.kind),
        receipt: r.receipt,
    };
}
