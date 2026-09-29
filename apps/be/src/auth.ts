import { config } from "./config";
import { getStore } from "./store";
import { sessionTokenFromCookies } from "./cookies";
import { decryptSecret } from "./secrets";
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
    createdAt: number;
    expiresAt: number;
}

/** Session lifetime. Overridable for tests via SESSION_TTL_DAYS. */
export function sessionTtlMs(): number {
    const days = Number(process.env.SESSION_TTL_DAYS ?? 7);
    return Number.isFinite(days) && days > 0 ? Math.floor(days) * 86_400_000 : 7 * 86_400_000;
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
 * resolved through the store (parameterized) — never string-interpolated —
 * and rejected past expiresAt. Expired rows are deleted best-effort.
 * Sessions written before expiry existed have no expiresAt and are treated
 * as expired (one re-login on upgrade).
 */
export async function findSession(raw: string): Promise<SessionValue | null> {
    if (!isSessionTokenFormat(raw)) return null;
    try {
        const stored = await getStore().getSetting<SessionValue>(`session:${raw}`);
        if (!stored) return null;
        // accessToken is AES-256-GCM when SESSION_ENC_KEY was set at login,
        // plaintext otherwise (dev / pre-encryption rows pass through).
        let accessToken: string;
        try {
            accessToken = decryptSecret(stored.accessToken ?? "");
        } catch {
            // Key lost or blob corrupt: force re-login, which re-encrypts
            // with the current key (self-healing).
            return null;
        }
        const session = { ...stored, accessToken };
        if (
            typeof session.expiresAt !== "number" ||
            !Number.isFinite(session.expiresAt) ||
            session.expiresAt <= Date.now()
        ) {
            try {
                await getStore().deleteSetting(`session:${raw}`);
            } catch {
                // Cleanup must not mask the rejection.
            }
            return null;
        }
        return session;
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

/**
 * IP-scoped rate limit for unauthenticated surfaces (OAuth login/callback).
 * Returns true when the request may proceed.
 */
export function checkIpRateLimit(req: Request, limitPerMin: number): boolean {
    return allow(`ip:${clientIp(req)}`, limitPerMin, Date.now());
}

/** Quota for the login redirect (cheap, but still bounded). */
export const LOGIN_RATE_LIMIT_PER_MIN = 60;
/** Quota for the OAuth callback (each hit calls GitHub's token endpoint). */
export const CALLBACK_RATE_LIMIT_PER_MIN = 10;

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
 * 4. `session` — dashboard session from the httpOnly cookie (browser users).
 *    Sessions are cookie-only: Bearer session tokens are no longer accepted,
 *    so exfiltrated pre-cookie tokens stop working.
 *
 * Returns an AuthContext, or a 401/429/503 Response to short-circuit.
 */
export async function authenticate(req: Request): Promise<AuthContext | Response> {
    const now = Date.now();

    // Operator token first: deploys and dashboards present it explicitly.
    const header = req.headers.get("authorization");
    const raw = header ? /^Bearer (.+)$/.exec(header.trim())?.[1] : undefined;
    if (raw && config.bearerToken && raw === config.bearerToken) {
        return { mode: "operator" };
    }

    // Workflow / user keys by hash lookup.
    if (raw?.startsWith("dlk_")) {
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

    // Dashboard sessions travel in the httpOnly cookie — browsers never send
    // an Authorization header, so this check must not depend on one.
    const cookieToken = sessionTokenFromCookies(req);
    if (cookieToken) {
        const session = await findSession(cookieToken);
        if (session) {
            return {
                mode: "session",
                session: { login: session.login, name: session.name },
            };
        }
    }

    if (!config.bearerToken) {
        return { mode: "open" };
    }
    return json({ error: "Unauthorized" }, 401);
}
