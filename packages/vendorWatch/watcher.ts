import type { VendorConfig } from "@driftlock/core";
import {
    diffContracts,
    resolveVendorContract,
    type RepoFacts,
    type VendorContract,
} from "@driftlock/agent";
import type { VendorBaselineStore } from "./baselineStore";
import {
    checkVendorPackageDrift,
    type PackageDrift,
    type RegistryOptions,
} from "./registry";

export interface VendorChange {
    provider: string;
    /** Version the baseline was captured at. Empty on first poll. */
    fromVersion: string;
    /** Version polled now. */
    toVersion: string;
    removed: string[];
    added: string[];
    contract: VendorContract;
    note: string;
    /**
     * Advisory pinned-vs-latest signal for the vendor's SDK. Present only
     * when the caller supplied `registry.facts`; never triggers a migration
     * on its own. A registry failure resolves to null rather than failing
     * the poll: the spec diff is the trigger, this is context.
     */
    registryDrift?: PackageDrift | null;
}

export interface CheckOptions {
    /**
     * Override for the poll itself. Production passes nothing and the
     * vendor's published spec is fetched; tests inject a stub so no network
     * is needed to prove the diff logic.
     */
    poll?: (
        vendor: VendorConfig,
        version: string,
    ) => Promise<{ contract: VendorContract; note: string }>;
    /**
     * Optional registry backstop: fingerprint facts of the customer repo so
     * the change also reports whether the SDK pin lags the registry.
     */
    registry?: {
        facts: RepoFacts;
        fetch?: RegistryOptions;
    };
}

/**
 * Polls the vendor's published spec and diffs it against the stored baseline.
 *
 * Spec-first on purpose: it is free, deterministic, and needs no credentials,
 * which is what a cron job wants. A vendor with no `docs.specUrl` cannot be
 * watched this way — the poll throws a message saying so rather than
 * pretending an empty contract is a signal.
 *
 * Returns a `VendorChange` only when the vendor removed members, because only
 * removals break call sites. Pure additions are recorded (the baseline moves
 * forward) but trigger nothing: there is nothing to migrate to.
 */
export async function checkVendor(
    vendor: VendorConfig,
    version: string,
    store: VendorBaselineStore,
    options: CheckOptions = {},
): Promise<VendorChange | null> {
    const poll =
        options.poll ??
        ((v, ver) => resolveVendorContract({ vendor: v, version: ver, useSpec: true }));
    const { contract, note } = await poll(vendor, version);

    const baseline = await store.load(vendor.name);
    if (!baseline) {
        await store.save(contract);
        return null;
    }

    const { removed, members } = diffContracts(baseline, contract);
    const added = members.filter(
        (member) => !baseline.members.includes(member),
    );
    const current: VendorContract = { ...contract, removed };
    await store.save(current);

    let registryDrift: PackageDrift | null = null;
    if (options.registry) {
        try {
            registryDrift = await checkVendorPackageDrift(
                options.registry.facts,
                vendor,
                options.registry.fetch,
            );
        } catch {
            registryDrift = null;
        }
    }

    if (removed.length === 0) return null;
    return {
        provider: vendor.name,
        fromVersion: baseline.version,
        toVersion: version,
        removed,
        added,
        contract: current,
        note,
        ...(options.registry ? { registryDrift } : {}),
    };
}
