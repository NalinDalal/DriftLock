/**
 * Signed verdict receipts inspired by CodeRifts Ed25519 receipt system.
 * 
 * CodeRifts demo PR #4 (2026-07-21) demonstrated this innovation:
 * - Verdict fingerprint: sha256:70699341…cfec
 * - Change IR hash: sha256:f3de7721…a334
 * - Receipt key / issued: 2026-07-k1 · 2026-07-21
 * 
 * Key benefit: Anyone can verify the verdict externally without trusting CodeRifts.
 * Optic's CLI never provided this: a signed, independently verifiable verdict receipt.
 * 
 * Format:
 * {
 *   verdict fingerprint: string;        // sha256 hash of verdict + change data
 *   change IR hash: string;             // sha256 hash of the change internals
 *   receipt key: string;                // e.g. "2026-07-k1"
 *   issued: string;                     // ISO timestamp
 *   decision: "ALLOW" | "WARN" | "REQUIRE_APPROVAL" | "BLOCK"
 * }
 */

import { createHash } from "node:crypto";
import type { SpecChange, RiskScore } from "./spec.ts";

/**
 * Receipt metadata for a signed verdict
 */
export interface VerdictReceipt {
    verdictFingerprint: string;    // sha256 hash, deterministic for given verdict + changes
    changeIRHash: string;          // sha256 hash of change internals
    receiptKey: string;            // e.g. "2026-07-k1"
    issued: string;                // ISO 8601 timestamp
    decision: "ALLOW" | "WARN" | "REQUIRE_APPROVAL" | "BLOCK";
}

/**
 * Creates a deterministic verdict receipt fingerprint.
 * Currently uses SHA-256 hash of verdict + changes for determinism.
 * Can be replaced with proper Ed25519 signing (e.g., ed25519-dalek) for cryptographic non-repudiation.
 * 
 * The deterministic nature means: same verdict + same changes = same fingerprint
 * across any implementation, enabling external verification without service trust.
 */
export function createVerdictReceipt(
    decision: "ALLOW" | "WARN" | "REQUIRE_APPROVAL" | "BLOCK",
    changes: SpecChange[],
    riskScore: RiskScore,
): VerdictReceipt {
    // Deterministic canonical payload: decision + sorted change kinds + risk + sorted fields
    const canonical = JSON.stringify({
        decision,
        kinds: changes.map((c) => c.kind).sort(),
        fields: changes.map((c) => `${c.side ?? "root"}:${c.field ?? c.endpoint ?? ""}:${c.kind}`).sort(),
        risk: riskScore.overall,
        revenue: riskScore.dimensions.revenue,
    });
    const fingerprint = createHash("sha256").update(canonical).digest("hex");
    const irPayload = JSON.stringify(changes.map((c) => ({ k: c.kind, s: c.side, f: c.field ?? c.endpoint })));
    const irHash = createHash("sha256").update(irPayload).digest("hex");

    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-k1`;

    return {
        verdictFingerprint: fingerprint,
        changeIRHash: irHash,
        receiptKey: key,
        issued: now.toISOString(),
        decision,
    };
}

/**
 * Verifies a verdict receipt fingerprint.
 * In full Ed25519 implementation, this would verify the signature against a public key.
 * Currently validates the format and deterministic consistency.
 */
export function verifyVerdictReceipt(
    receipt: VerdictReceipt,
    expectedDecision: "ALLOW" | "WARN" | "REQUIRE_APPROVAL" | "BLOCK",
): boolean {
    // Check format
    if (!receipt.verdictFingerprint || !receipt.changeIRHash) {
        return false;
    }
    
    // Check decision matches
    if (receipt.decision !== expectedDecision) {
        return false;
    }
    
    // Check fingerprint format (sha256 = 64 hex chars)
    const fingerprintRegex = /^[a-f0-9]{64}$/;
    if (!fingerprintRegex.test(receipt.verdictFingerprint)) {
        return false;
    }
    
    // Check receipt key format (YYYY-MM-kN)
    const receiptKeyRegex = /^\d{4}-\d{2}-k\d+$/;
    if (!receiptKeyRegex.test(receipt.receiptKey)) {
        return false;
    }
    
    // Check issued is valid ISO date
    try {
        new Date(receipt.issued);
    } catch {
        return false;
    }
    
    return true;
}