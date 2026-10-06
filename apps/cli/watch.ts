import { execFileSync } from "child_process";
import { rm } from "fs/promises";
import { STRIPE_VENDOR, TWILIO_VENDOR, P5_VENDOR } from "@driftlock/core";
import type { VendorConfig } from "@driftlock/core";
import { createGitHubPublisher, fingerprintRepo, modelProviderEnvKey, resolveAgentTier, type AgentTier, type ModelProvider } from "@driftlock/agent";
import {
    checkVendor,
    checkVendorPackageDrift,
    FileVendorBaselineStore,
    MemoryRegistryCache,
    runVendorTriggeredMigration,
    type CheckOptions,
} from "@driftlock/vendorWatch";
import { isRemoteRef } from "./migrate";

const KNOWN_VENDORS: Record<string, VendorConfig> = {
    stripe: STRIPE_VENDOR,
    twilio: TWILIO_VENDOR,
    p5: P5_VENDOR,
};

export interface WatchOptions {
    provider: string;
    version?: string;
    baselinesDir?: string;
    repo?: string;
    trigger?: boolean;
    base?: string;
    model?: string;
    /** Subscription tier. Explicit flag wins, then DRIFTLOCK_PLAN, then pro. */
    tier?: string;
    /** Model provider: "openai" (default) or "anthropic". Flag wins, then DRIFTLOCK_MODEL_PROVIDER. */
    modelProvider?: string;
    /** Test seam for the spec poll. Production always fetches the vendor spec. */
    poll?: CheckOptions["poll"];
}

/**
 * Resolves the agent tier at the process edge (shared helper in
 * `@driftlock/agent`: unknown values fail closed to free, so a typo must
 * never grant publishing rights).
 */
export function resolveTier(explicit?: string): AgentTier {
    return resolveAgentTier(explicit ?? process.env.DRIFTLOCK_PLAN ?? "pro");
}

/**
 * Resolves the model provider at the process edge. Empty means OpenAI wire
 * protocol; anything else passes through to the agent's provider registry,
 * which fails fast naming the known providers. Provider is not a privilege,
 * so there is nothing to fail closed over here.
 */
export function resolveModelProvider(explicit?: string): ModelProvider {
    const raw = (explicit ?? process.env.DRIFTLOCK_MODEL_PROVIDER ?? "openai").trim().toLowerCase();
    return raw === "" ? "openai" : raw;
}

/**
 * Provider key from the environment, resolved through the registry so new
 * providers need no per-vendor branches here: GEMINI_API_KEY,
 * ANTHROPIC_API_KEY, and whatever comes next all flow the same way.
 */
export function lookupProviderKey(provider: ModelProvider): string | undefined {
    if (provider === "openai") return process.env.OPENAI_API_KEY;
    const envKey = modelProviderEnvKey(provider);
    return envKey ? process.env[envKey] : undefined;
}

function resolveVendor(provider: string): VendorConfig {
    const vendor = KNOWN_VENDORS[provider.toLowerCase()];
    if (!vendor) {
        throw new Error(
            `Unknown provider "${provider}". Known: ${Object.keys(KNOWN_VENDORS).join(", ")}.`,
        );
    }
    return vendor;
}

async function resolveRoot(repo: string): Promise<{ root: string; cleanup: () => Promise<void> }> {
    if (!isRemoteRef(repo)) return { root: repo, cleanup: async () => {} };
    const tmp = `/tmp/driftlock-watch-${Date.now()}`;
    console.log(`[CLONE] ${repo} → ${tmp}`);
    execFileSync(
        "git",
        ["clone", "--depth", "1", `https://github.com/${repo}.git`, tmp],
        { stdio: "inherit" },
    );
    return { root: tmp, cleanup: async () => rm(tmp, { recursive: true, force: true }) };
}

/**
 * Polls a vendor's published spec, diffs it against the stored baseline, and
 * optionally triggers the migration agent on a repository.
 *
 * Exit codes are cron-friendly: 0 means no breaking change (or a first poll
 * that recorded the baseline), 1 means the vendor removed members, 2 means
 * the poll itself failed.
 */
export async function runWatch(opts: WatchOptions): Promise<number> {
    const vendor = resolveVendor(opts.provider);
    const version = opts.version ?? "latest";
    const tier = resolveTier(opts.tier);
    const modelProvider = resolveModelProvider(opts.modelProvider);
    const store = new FileVendorBaselineStore(
        opts.baselinesDir ?? ".driftlock/vendor-baselines",
    );
    // One cache per run bounds registry calls when watching several vendors.
    const registryCache = new MemoryRegistryCache();

    // Local repos can be fingerprinted before the poll so the change carries
    // the pinned-vs-latest signal. Remote repos are cloned after the poll,
    // so their registry check happens post-clone below.
    const localRoot = opts.repo && !isRemoteRef(opts.repo) ? opts.repo : undefined;
    const localFacts = localRoot
        ? await fingerprintRepo(localRoot).catch(() => null)
        : null;

    let change;
    try {
        change = await checkVendor(vendor, version, store, {
            poll: opts.poll,
            ...(localFacts
                ? { registry: { facts: localFacts, fetch: { cache: registryCache } } }
                : {}),
        });
    } catch (e) {
        console.error(`[WATCH] poll failed for ${vendor.name}:`, (e as Error).message);
        return 2;
    }

    if (!change) {
        console.log(`[WATCH] ${vendor.name}: no removed members since baseline.`);
        return 0;
    }

    console.log(`[WATCH] BREAKING: ${vendor.name} removed ${change.removed.length} member(s):`);
    for (const member of change.removed) console.log(`  - ${member}`);
    if (change.added.length > 0) {
        console.log(`[WATCH] added (candidate replacements):`);
        for (const member of change.added.slice(0, 20)) console.log(`  + ${member}`);
    }
    console.log(`[WATCH] ${change.note}`);
    if (change.registryDrift?.drift) {
        console.log(`[WATCH] registry: ${change.registryDrift.note}`);
    }

    if (!opts.trigger) {
        console.log(`[WATCH] pass --trigger --repo <owner/repo|path> to migrate.`);
        return 1;
    }
    if (!opts.repo) {
        console.error(`[WATCH] --trigger needs --repo <owner/repo|path>.`);
        return 2;
    }

    const { root, cleanup } = await resolveRoot(opts.repo);
    try {
        // Remote roots did not exist at poll time: attach the registry
        // signal now so the triggered packet carries it. Advisory only;
        // a registry failure never blocks the migration.
        if (!localFacts && !change.registryDrift) {
            const facts = await fingerprintRepo(root).catch(() => null);
            if (facts) {
                const drift = await checkVendorPackageDrift(facts, vendor, {
                    cache: registryCache,
                }).catch(() => null);
                if (drift) {
                    change.registryDrift = drift;
                    if (drift.drift) console.log(`[WATCH] registry: ${drift.note}`);
                }
            }
        }
        const remote = isRemoteRef(opts.repo);
        const [owner, name] = remote ? opts.repo.split("/") : [];
        const token = process.env.GITHUB_TOKEN;
        const result = await runVendorTriggeredMigration(vendor, change, {
            root,
            tier,
            modelProvider,
            docs: vendor.docs?.url ? [vendor.docs.url] : [],
            model: opts.model ?? process.env.DRIFTLOCK_MODEL,
            apiKey: process.env.OPENAI_API_KEY,
            providerApiKey: lookupProviderKey(modelProvider),
            baseURL: process.env.OPENAI_BASE_URL,
            ...(remote && owner && name
                ? {
                      target: { owner, repo: name, base: opts.base ?? "main" },
                      ...(token ? { publisher: createGitHubPublisher(token) } : {}),
                  }
                : {}),
        });
        console.log(
            `[WATCH] outcome=${result.outcome} files=${result.filesChanged.join(", ") || "(none)"} ` +
                `confidence=${result.receipt.confidence} findings=${result.receipt.findingCount}`,
        );
        if (result.state.pullRequest) {
            console.log(`[WATCH] PR: ${result.state.pullRequest.url}`);
        } else if (remote && !token) {
            console.log(`[WATCH] set GITHUB_TOKEN to open a real PR; preview only without it.`);
        }
        return 1;
    } finally {
        await cleanup();
    }
}
