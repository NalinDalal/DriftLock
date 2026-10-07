import {
    contractFromObservedMembers,
    contractFromSpec,
    fetchSpec,
    uniqueSorted,
    type VendorContract,
} from "./vendorContract";
import type { VendorConfig } from "@driftlock/core";

/**
 * Spec-member cache per spec URL. A vendor spec (e.g. Stripe's OpenAPI) is
 * megabytes; refetching and re-walking it on every drift in one process is
 * pure waste. The observed `removed` list is attached per call, never cached,
 * because it differs per drift.
 */
const specMemberCache = new Map<string, { members: string[]; origin: string }>();

/** Test seam: drops cached spec members. */
export function clearSpecCache(): void {
    specMemberCache.clear();
}

export interface HybridContractInput {
    /** Vendor config when known. Without one there is no specUrl, so the
     * sampled contract is the whole answer and the run stays a draft. */
    vendor?: VendorConfig;
    provider: string;
    version?: string;
    /** Provenance for the observation, e.g. `webhook payment_intent.succeeded observed payload`. */
    origin: string;
    /** Member paths known to exist right now (flat schema keys, shape keys). */
    currentMembers: string[];
    /** Member paths the vendor stopped sending. */
    removed: string[];
}

/**
 * Existence ⟸ spec, removal ⟸ observation.
 *
 * A sampled contract alone can prove a field was removed (explicit `removed`)
 * but cannot prove an invented replacement exists: absence from a sample
 * means nothing. A spec alone proves existence but carries no `removed`
 * list, so it cannot catch the missed third call site. The hybrid keeps the
 * observed `removed` (the completeness signal) and unions spec members in,
 * flipping existence checks to authoritative. Spec fetch failure degrades to
 * the sampled contract, never throws: a vendor outage must not block a
 * migration, it just lowers the guarantee to draft-grade.
 */
export async function resolveHybridContract(
    input: HybridContractInput,
): Promise<{ contract: VendorContract; note: string }> {
    const sampled = contractFromObservedMembers({
        provider: input.provider,
        version: input.version,
        origin: input.origin,
        currentMembers: input.currentMembers,
        removed: input.removed,
    });
    const specUrl = input.vendor?.docs?.specUrl;
    if (!specUrl) {
        return {
            contract: sampled,
            note: `no specUrl for ${input.provider}; sampled observation only`,
        };
    }
    try {
        let cached = specMemberCache.get(specUrl);
        if (!cached) {
            const { spec, origin } = await fetchSpec(specUrl);
            const base = contractFromSpec(
                input.provider,
                input.version ?? "unversioned",
                spec,
                origin,
            );
            cached = { members: [...base.members], origin };
            specMemberCache.set(specUrl, cached);
        }
        return {
            contract: {
                ...sampled,
                members: uniqueSorted([...sampled.members, ...cached.members]),
                source: "spec",
                authority: "authoritative",
                origin: `${cached.origin} + observed removals (${input.origin})`,
            },
            note: `spec members from ${cached.origin} with observed removals`,
        };
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return {
            contract: sampled,
            note: `spec fetch failed (${reason}); sampled fallback`,
        };
    }
}
