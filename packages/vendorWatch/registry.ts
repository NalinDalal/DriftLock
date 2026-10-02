import type { RepoFacts } from "@driftlock/agent";
import type { VendorConfig } from "@driftlock/core";

/**
 * Pinned-vs-latest check for a package registry.
 *
 * `fingerprintRepo` already answers "what is pinned" (lockfile wins over the
 * manifest via `versionOf`). This module answers "what is latest" by asking
 * the registry directly, so the watch loop can say "stripe@17.4.0 is pinned,
 * 18.1.0 is latest, drift: true" before it ever fetches a spec.
 *
 * Network is narrow on purpose, mirroring `probeLiveContract`: https only,
 * host allowlist, no redirects, one request, short timeout. Tests inject
 * `fetchFn` so no network is needed to prove the compare logic.
 */

export class RegistryError extends Error {}

const REGISTRY_ALLOWLIST = [
    "registry.npmjs.org",
    "crates.io",
    "pypi.org",
    "proxy.golang.org",
];

export type RegistryEcosystem = "npm" | "rust" | "python" | "go";

export interface RegistryOptions {
    timeoutMs?: number;
    fetchFn?: typeof fetch;
    /** TTL cache for latest-version lookups. Absent means no caching. */
    cache?: RegistryCache;
}

export interface RegistryCacheEntry {
    latest: string;
    origin: string;
    checkedAt: number;
}

export interface RegistryCache {
    load(key: string): RegistryCacheEntry | null;
    /** Implementations stamp `checkedAt` with their own clock. */
    save(key: string, entry: Omit<RegistryCacheEntry, "checkedAt">): void;
}

/**
 * In-memory TTL cache so one cron run with several vendors (or retries)
 * does not hammer public registries. Cron processes are short-lived, so
 * this bounds calls within a run, not across runs; cross-run caching
 * belongs next to the file baseline store if rate limits ever bite.
 */
export class MemoryRegistryCache implements RegistryCache {
    private entries = new Map<string, RegistryCacheEntry>();
    constructor(
        private ttlMs = 6 * 60 * 60 * 1000,
        private clock: () => number = Date.now,
    ) {}
    load(key: string): RegistryCacheEntry | null {
        const entry = this.entries.get(key);
        if (!entry) return null;
        if (this.clock() - entry.checkedAt > this.ttlMs) {
            this.entries.delete(key);
            return null;
        }
        return entry;
    }
    save(key: string, entry: Omit<RegistryCacheEntry, "checkedAt">): void {
        this.entries.set(key, { ...entry, checkedAt: this.clock() });
    }
}

export interface PackageDrift {
    package: string;
    ecosystem: RegistryEcosystem;
    /** Version pinned in the repo (lockfile wins). Undefined when not installed. */
    pinned?: string;
    /** Latest stable reported by the registry. */
    latest: string;
    /** True when latest is newer than pinned. */
    drift: boolean;
    note: string;
}

function registryUrl(packageName: string, ecosystem: RegistryEcosystem): string {
    // Encode segments separately: a scoped npm name like `@acme/sdk` must
    // keep its `@` bare and only encode the separator (`@acme%2fsdk`),
    // which is the registry's canonical form. A blanket encodeURIComponent
    // turns `@` into `%40`, which some registry endpoints reject.
    const encoded = packageName
        .split("/")
        .map((segment) => encodeURIComponent(segment).replace(/^%40/, "@"))
        .join("%2f");
    switch (ecosystem) {
        case "npm":
            return `https://registry.npmjs.org/${encoded}/latest`;
        case "rust":
            return `https://crates.io/api/v1/crates/${encoded}`;
        case "python":
            return `https://pypi.org/pypi/${encoded}/json`;
        case "go":
            return `https://proxy.golang.org/${encoded}/@latest`;
    }
}

function parseLatest(ecosystem: RegistryEcosystem, payload: unknown): string {
    const record = payload as Record<string, unknown>;
    switch (ecosystem) {
        case "npm": {
            const version = (record as { version?: unknown }).version;
            if (typeof version === "string" && version) return version;
            break;
        }
        case "rust": {
            const crate = (record as { crate?: { max_stable_version?: unknown } }).crate;
            if (crate && typeof crate.max_stable_version === "string" && crate.max_stable_version) {
                return crate.max_stable_version;
            }
            // Fallback for stubs that return {version} directly.
            if (typeof record.version === "string" && record.version) return record.version;
            break;
        }
        case "python": {
            const info = (record as { info?: { version?: unknown } }).info;
            if (info && typeof info.version === "string" && info.version) return info.version;
            break;
        }
        case "go": {
            const version = (record as { Version?: unknown }).Version;
            if (typeof version === "string" && version) return version.replace(/^v/, "");
            break;
        }
    }
    throw new RegistryError(`Registry response has no usable version field`);
}

/**
 * Latest stable version for a package, from its public registry.
 *
 * Throws `RegistryError` on refusal (non-https, off-allowlist, redirect,
 * non-200, non-JSON, empty version) rather than returning a guess.
 */
export async function fetchLatestVersion(
    packageName: string,
    ecosystem: RegistryEcosystem,
    options: RegistryOptions = {},
): Promise<{ latest: string; origin: string }> {
    if (!packageName.trim()) throw new RegistryError("fetchLatestVersion requires a package name");
    const cacheKey = `${ecosystem}:${packageName}`;
    const cached = options.cache?.load(cacheKey);
    if (cached) return { latest: cached.latest, origin: cached.origin };
    const url = registryUrl(packageName, ecosystem);
    const target = new URL(url);
    const host = target.hostname.toLowerCase();
    const trusted = REGISTRY_ALLOWLIST.some(
        (entry) => host === entry || host.endsWith(`.${entry}`),
    );
    if (!trusted) {
        throw new RegistryError(`Registry refused: ${host} is not in the allowlist`);
    }

    const fetchFn = options.fetchFn ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
    let response: Response;
    try {
        response = await fetchFn(url, {
            method: "GET",
            redirect: "manual",
            signal: controller.signal,
            headers: { accept: "application/json", "user-agent": "driftlock/0.1" },
        });
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new RegistryError(`Registry fetch failed: ${reason}`);
    } finally {
        clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
        throw new RegistryError(`Registry refused: ${host} returned a redirect, which is not followed`);
    }
    if (!response.ok) {
        throw new RegistryError(`Registry fetch failed: ${host} returned ${response.status}`);
    }
    let payload: unknown;
    try {
        payload = await response.json();
    } catch {
        throw new RegistryError(`Registry fetch failed: ${host} returned a body that is not JSON`);
    }
    const latest = parseLatest(ecosystem, payload);
    options.cache?.save(cacheKey, { latest, origin: url });
    return { latest, origin: url };
}

/** Strips range prefixes (`^`, `~`, `>=`, `=`, `v`) to the base version. */
export function stripRange(pinned: string): string {
    return pinned.trim().replace(/^[v^~<>=|\s]+/, "").split(" ")[0];
}

/**
 * Numeric dot-compare ignoring a `-prerelease` suffix for ordering the core.
 * Returns negative when a < b, 0 when equal, positive when a > b.
 * A stable release beats its own prerelease (`2.0.0` > `2.0.0-beta.1`).
 */
export function compareVersions(a: string, b: string): number {
    const core = (v: string): { parts: number[]; pre: string | null } => {
        const [head, ...rest] = stripRange(v).split("-");
        const parts = head.split(".").map((n) => {
            const parsed = Number.parseInt(n, 10);
            return Number.isNaN(parsed) ? 0 : parsed;
        });
        return { parts, pre: rest.length > 0 ? rest.join("-") : null };
    };
    const left = core(a);
    const right = core(b);
    const width = Math.max(left.parts.length, right.parts.length);
    for (let i = 0; i < width; i += 1) {
        const diff = (left.parts[i] ?? 0) - (right.parts[i] ?? 0);
        if (diff !== 0) return diff;
    }
    if (left.pre === right.pre) return 0;
    if (left.pre === null) return 1;
    if (right.pre === null) return -1;
    return left.pre < right.pre ? -1 : 1;
}

function ecosystemOf(facts: RepoFacts): RegistryEcosystem | null {
    switch (facts.ecosystem) {
        case "npm":
            return "npm";
        case "rust":
            return "rust";
        case "python":
            return "python";
        case "go":
            return "go";
        default:
            return null;
    }
}

/**
 * Pinned (from lockfile via the fingerprint) vs latest (from the registry)
 * for the SDK behind a vendor.
 *
 * Returns `{ pinned: undefined, drift: false }`-style "not installed" when
 * the repo does not declare the SDK, so callers can skip rather than treat
 * absence as drift. Throws `RegistryError` when the ecosystem has no
 * registry mapping or the fetch is refused.
 */
export async function checkVendorPackageDrift(
    facts: RepoFacts,
    vendor: VendorConfig,
    options: RegistryOptions = {},
): Promise<PackageDrift> {
    const ecosystem = ecosystemOf(facts);
    if (!ecosystem) {
        throw new RegistryError(
            `No registry mapping for ecosystem "${facts.ecosystem}": pinned version is known, latest is not`,
        );
    }
    const pinned = facts.resolvedVersions[vendor.sdk] ?? facts.dependencies[vendor.sdk];
    const { latest, origin } = await fetchLatestVersion(vendor.sdk, ecosystem, options);
    if (!pinned) {
        return {
            package: vendor.sdk,
            ecosystem,
            latest,
            drift: false,
            note: `${vendor.sdk} is not declared in this repo; latest is ${latest} at ${origin}`,
        };
    }
    const drift = compareVersions(latest, stripRange(pinned)) > 0;
    return {
        package: vendor.sdk,
        ecosystem,
        pinned: stripRange(pinned),
        latest,
        drift,
        note: drift
            ? `${vendor.sdk}@${stripRange(pinned)} is pinned, ${latest} is latest at ${origin}`
            : `${vendor.sdk}@${stripRange(pinned)} is current (latest ${latest})`,
    };
}
