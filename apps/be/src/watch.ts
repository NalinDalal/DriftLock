import { STRIPE_VENDOR, TWILIO_VENDOR, type VendorConfig } from "@driftlock/core";
import {
    checkVendor,
    FileVendorBaselineStore,
    runVendorTriggeredMigration,
    type VendorChange,
} from "@driftlock/vendorWatch";
import {
    createGitHubPublisher,
    type AgentTier,
    type PullRequestPublisher,
} from "@driftlock/agent";
import { getStore } from "./store";
import { cloneRepo } from "./clone";

const KNOWN_VENDORS: Record<string, VendorConfig> = {
    stripe: STRIPE_VENDOR,
    twilio: TWILIO_VENDOR,
};

export interface WatchConfig {
    enabled: boolean;
    intervalMs: number;
    vendors: VendorConfig[];
    baselinesDir: string;
    tier: AgentTier;
    model?: string;
    apiKey?: string;
    baseURL?: string;
    githubToken?: string;
}

/**
 * Read scheduler config from the environment. Disabled by default: the
 * operator opts in with WATCH_ENABLED=true once baselines and a token are
 * in place. Rollback is unsetting the variable.
 */
export function readWatchConfig(
    env: Record<string, string | undefined> = process.env,
): WatchConfig {
    const rawInterval = parseInt(env.WATCH_INTERVAL_MS ?? "", 10);
    const vendors = (env.WATCH_VENDORS ?? "stripe")
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean)
        .map((v) => KNOWN_VENDORS[v])
        .filter((v): v is VendorConfig => !!v);
    const plan = (env.DRIFTLOCK_PLAN ?? "pro").trim().toLowerCase();
    return {
        enabled: (env.WATCH_ENABLED ?? "false").trim().toLowerCase() === "true",
        intervalMs: Math.max(
            60_000,
            Number.isFinite(rawInterval) ? rawInterval : 6 * 3_600_000,
        ),
        vendors,
        baselinesDir: env.WATCH_BASELINES_DIR ?? ".driftlock/vendor-baselines",
        tier: plan === "free" ? "free" : "pro",
        model: env.DRIFTLOCK_MODEL || undefined,
        apiKey: env.OPENAI_API_KEY || undefined,
        baseURL: env.OPENAI_BASE_URL || undefined,
        githubToken: env.GITHUB_TOKEN || undefined,
    };
}

export interface WatchedRepo {
    owner: string;
    name: string;
    base: string;
}

export interface WatchTickDeps {
    poll?: typeof checkVendor;
    listWatchedRepos?: () => Promise<WatchedRepo[]>;
    migrate?: typeof runVendorTriggeredMigration;
    makePublisher?: (token: string) => PullRequestPublisher;
    clone?: typeof cloneRepo;
}

export interface WatchTickResult {
    vendorsChecked: string[];
    breakingVendors: string[];
    migrations: Array<{
        vendor: string;
        repo: string;
        outcome: string;
        prUrl?: string;
    }>;
}

async function defaultListWatchedRepos(): Promise<WatchedRepo[]> {
    const store = getStore();
    const repos = await store.listRepositories();
    return repos
        .filter((r) => r.watched !== false && r.owner && r.name)
        .map((r) => ({
            owner: r.owner,
            name: r.name,
            base: r.defaultBranch ?? "main",
        }));
}

/**
 * One scheduler pass: poll each vendor spec, and on a breaking change run
 * the migration agent against every watched repo. Seams are injectable so
 * tests prove the loop without network, models, or git.
 */
export async function runWatchTick(
    config: WatchConfig,
    deps: WatchTickDeps = {},
): Promise<WatchTickResult> {
    const poll = deps.poll ?? checkVendor;
    const listWatchedRepos = deps.listWatchedRepos ?? defaultListWatchedRepos;
    const migrate = deps.migrate ?? runVendorTriggeredMigration;
    const makePublisher = deps.makePublisher ?? createGitHubPublisher;
    const clone = deps.clone ?? cloneRepo;
    const result: WatchTickResult = {
        vendorsChecked: [],
        breakingVendors: [],
        migrations: [],
    };
    const store = new FileVendorBaselineStore(config.baselinesDir);

    for (const vendor of config.vendors) {
        result.vendorsChecked.push(vendor.name);
        let change: VendorChange | null;
        try {
            change = await poll(vendor, "latest", store);
        } catch (error) {
            console.error(
                `[WATCH] poll failed for ${vendor.name}:`,
                (error as Error).message,
            );
            continue;
        }
        if (!change) {
            console.log(`[WATCH] ${vendor.name}: no removed members since baseline.`);
            continue;
        }
        result.breakingVendors.push(vendor.name);
        console.log(
            `[WATCH] BREAKING: ${vendor.name} removed ${change.removed.length} member(s), added ${change.added.length} candidate(s).`,
        );

        const repos = await listWatchedRepos();
        if (repos.length === 0) {
            console.log(`[WATCH] ${vendor.name}: breaking change but no watched repos.`);
            continue;
        }
        const publisher = config.githubToken
            ? makePublisher(config.githubToken)
            : undefined;
        if (!publisher) {
            console.log(`[WATCH] no GITHUB_TOKEN: migrations run in preview mode (no PRs).`);
        }
        for (const repo of repos) {
            const { path, cleanup } = await clone(repo.owner, repo.name, repo.base);
            try {
                const migration = await migrate(vendor, change, {
                    root: path,
                    tier: config.tier,
                    ...(config.model ? { model: config.model } : {}),
                    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
                    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
                    docs: vendor.docs?.url ? [vendor.docs.url] : [],
                    ...(publisher
                        ? {
                              publisher,
                              target: { owner: repo.owner, repo: repo.name, base: repo.base },
                          }
                        : {}),
                });
                console.log(
                    `[WATCH] outcome=${migration.outcome} vendor=${vendor.name} repo=${repo.owner}/${repo.name} ` +
                        `files=${migration.filesChanged.join(", ") || "(none)"}` +
                        (migration.state.pullRequest
                            ? ` pr=${migration.state.pullRequest.url}`
                            : ""),
                );
                result.migrations.push({
                    vendor: vendor.name,
                    repo: `${repo.owner}/${repo.name}`,
                    outcome: migration.outcome,
                    ...(migration.state.pullRequest
                        ? { prUrl: migration.state.pullRequest.url }
                        : {}),
                });
            } finally {
                await cleanup();
            }
        }
    }
    return result;
}

/**
 * Start the always-on vendor watch loop. No-ops unless WATCH_ENABLED=true.
 * Overlap guard: a slow tick never piles up behind itself. Returns stop().
 */
export function startWatchScheduler(
    env: Record<string, string | undefined> = process.env,
    deps: WatchTickDeps = {},
): () => void {
    const config = readWatchConfig(env);
    if (!config.enabled) {
        return () => {};
    }
    if (config.vendors.length === 0) {
        console.log("[WATCH] enabled but no known vendors in WATCH_VENDORS; idle.");
        return () => {};
    }
    console.log(
        `[WATCH] enabled: vendors=${config.vendors.map((v) => v.name).join(",")} ` +
            `interval=${Math.round(config.intervalMs / 60000)}m tier=${config.tier} ` +
            `baselines=${config.baselinesDir} prs=${config.githubToken ? "on" : "preview-only"}`,
    );
    let running = false;
    const tick = async () => {
        if (running) {
            console.log("[WATCH] previous tick still running; skipping.");
            return;
        }
        running = true;
        try {
            await runWatchTick(config, deps);
        } catch (error) {
            console.error("[WATCH] tick failed:", (error as Error).message);
        } finally {
            running = false;
        }
    };
    void tick();
    const timer = setInterval(tick, config.intervalMs);
    return () => clearInterval(timer);
}
