import type { VendorContract } from "@driftlock/agent";

/**
 * Where the last polled vendor contract lives.
 *
 * The watcher is a diff engine: today's spec means nothing until it is
 * compared against yesterday's. The store holds one contract per provider —
 * the last surface that was seen — so a poll can answer "what did the vendor
 * remove since I last looked" instead of "what does the vendor expose".
 */
export interface VendorBaselineStore {
    load(provider: string): Promise<VendorContract | null>;
    save(contract: VendorContract): Promise<void>;
}

/** In-memory store. Test seam and single-process default. */
export class MemoryVendorBaselineStore implements VendorBaselineStore {
    private contracts = new Map<string, VendorContract>();

    async load(provider: string): Promise<VendorContract | null> {
        return this.contracts.get(provider) ?? null;
    }

    async save(contract: VendorContract): Promise<void> {
        this.contracts.set(contract.provider, contract);
    }
}

function fileName(dir: string, provider: string): string {
    const safe = provider.replace(/[^A-Za-z0-9._-]/g, "_");
    return `${dir}/${safe}.json`;
}

/**
 * File store under a baselines directory (default
 * `.driftlock/vendor-baselines`). Survives process restarts and cron
 * invocations, which is the whole point: a watcher that forgets what it saw
 * reports every member as new on every poll.
 */
export class FileVendorBaselineStore implements VendorBaselineStore {
    constructor(private dir: string) {}

    async load(provider: string): Promise<VendorContract | null> {
        const file = Bun.file(fileName(this.dir, provider));
        if (!(await file.exists())) return null;
        try {
            return (await file.json()) as VendorContract;
        } catch {
            return null;
        }
    }

    async save(contract: VendorContract): Promise<void> {
        const { mkdir } = await import("node:fs/promises");
        await mkdir(this.dir, { recursive: true });
        await Bun.write(
            fileName(this.dir, contract.provider),
            JSON.stringify(contract, null, 2),
        );
    }
}
