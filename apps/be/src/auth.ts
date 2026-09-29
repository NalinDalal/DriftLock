import { config } from "./config";
import { getStore } from "./store";
import { json } from "./utils";

export interface ApiKeyIdentity {
    id: string;
    name: string;
    keyPrefix: string;
    masked: string;
}

export type AuthMode = "open" | "operator" | "api-key" | "session";

export interface AuthContext {
    mode: AuthMode;
    key?: ApiKeyIdentity;
    session?: SessionIdentity;
}

export interface SessionValue {
    userId: number;
    login: string;
    name: string;
    avatarUrl: string;
    accessToken: string;
    orgs: Array<{ login: string; id: number }>;
}

export interface SessionIdentity {
    login: string;
    name: string;
}

/** Session tokens are 64 lowercase hex chars. Anything else is not a session. */
export function isSessionTokenFormat(raw: string): boolean {
    return /^[0-9a-f]{64}$/.test(raw);
}

/**
 * Look up a dashboard session by token. Format-checked before any DB touch,
 * and resolved through the store (parameterized) — never string-interpolated.
 */
export async function findSession(raw: string): Promise<SessionValue | null> {
    if (!isSessionTokenFormat(raw)) return null;
    try {
        return await getStore().getSetting<SessionValue>(`session:${raw}`);
    } catch {
        return null;
    }
}

function rateLimitPerMin(): number {
    const raw = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 600);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 600;
}

function openRateLimitPerMin(): number {
    const raw = Number(process.env.RATE_LIMIT_OPEN_PER_MINUTE ?? 120);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 120;
}

// In-memory sliding window, per instance. Correct for a single instance;
// a multi-instance deploy needs this in Redis/Postgres (follow-up).
const buckets = new Map<string, { count: number; resetAt: number }>();

function allow(bucket: string, limitPerMin: number, now: number): boolean {
    const windowMs = 60_000;
    const entry = buckets.get(bucket);
    if (!entry || now >= entry.resetAt) {
        buckets.set(bucket, { count: 1, resetAt: now + windowMs });
        return true;
    }
    entry.count += 1;
    return entry.count <= limitPerMin;
}

/** Test seam: clear all rate-limit buckets. */
export function resetRateLimits(): void {
    buckets.clear();
}

function clientIp(req: Request): string {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    return "unknown";
}

function emitApiCalled(keyId: string, req: Request): void {
    try {
        const path = new URL(req.url).pathname;
        getStore().emitEvent?.("api_called", {
            keyId,
            method: req.method,
            path,
        });
    } catch {
        // Usage telemetry must never break serving.
    }
}

/**
 * Authenticate one request. Four modes, in order:
 * 1. `open` — no credentials presented and no BEARER_TOKEN configured
 *    (dev default; preserved behavior).
 * 2. `operator` — matches the static BEARER_TOKEN (us, dashboards, deploys).
 * 3. `api-key` — `dlk_...` key verified by hash lookup (workflows, users).
 * 4. `session` — dashboard session token from GitHub OAuth (browser users).
 *
 * Returns an AuthContext, or a 401/429/503 Response to short-circuit.
 */
export async function authenticate(req: Request): Promise<AuthContext | Response> {
    const header = req.headers.get("authorization");
    const now = Date.now();

    if (!header) {
        if (!config.bearerToken) {
            return { mode: "open" };
        }
        return json({ error: "Unauthorized" }, 401);
    }

    const match = /^Bearer (.+)$/.exec(header.trim());
    if (!match) {
        return json({ error: "Unauthorized" }, 401);
    }
    const raw = match[1];

    if (config.bearerToken && raw === config.bearerToken) {
        return { mode: "operator" };
    }

    if (!raw.startsWith("dlk_")) {
        const session = await findSession(raw);
        if (session) {
            return {
                mode: "session",
                session: { login: session.login, name: session.name },
            };
        }
        return json({ error: "Unauthorized" }, 401);
    }

    let row;
    try {
        row = await getStore().findApiKey(raw);
    } catch {
        return json({ error: "Auth unavailable" }, 503);
    }
    if (!row) {
        if (!allow(`ip:${clientIp(req)}`, openRateLimitPerMin(), now)) {
            console.warn(`[RATE_LIMIT] bucket=ip scope=auth-fail`);
            return json({ error: "Rate limit exceeded" }, 429);
        }
        return json({ error: "Unauthorized" }, 401);
    }

    if (!allow(`key:${row.id}`, rateLimitPerMin(), now)) {
        console.warn(`[RATE_LIMIT] bucket=key:${row.id} name=${row.name}`);
        return json({ error: "Rate limit exceeded" }, 429);
    }

    emitApiCalled(row.id, req);
    return {
        mode: "api-key",
        key: { id: row.id, name: row.name, keyPrefix: row.keyPrefix, masked: row.masked },
    };
}
