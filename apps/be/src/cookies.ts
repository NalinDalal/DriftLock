export const SESSION_COOKIE = "driftlock_session";

/**
 * Session cookie lifetime. Kept equal to the default server session TTL;
 * either side expiring first self-heals via re-login, so drift here is safe.
 */
const SESSION_COOKIE_MAX_AGE_SEC = 7 * 86_400;

function secureCookies(): boolean {
    return (process.env.BACKEND_URL ?? "").startsWith("https://");
}

function baseAttrs(maxAgeSec: number): string {
    return (
        `HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}` +
        (secureCookies() ? "; Secure" : "")
    );
}

/**
 * CSRF note: SameSite=Lax is sufficient because the dashboard and the API
 * are always same-site (localhost:* in dev, *.driftlock.dev in prod).
 * Cross-site POSTs never carry the cookie, so no separate CSRF token is
 * needed. If the frontend ever moves off-domain, add Origin checks.
 */
export function sessionCookieHeader(token: string): string {
    return `${SESSION_COOKIE}=${token}; ${baseAttrs(SESSION_COOKIE_MAX_AGE_SEC)}`;
}

export function clearSessionCookieHeader(): string {
    return `${SESSION_COOKIE}=; ${baseAttrs(0)}`;
}

export function parseCookies(req: Request): Map<string, string> {
    const out = new Map<string, string>();
    const header = req.headers.get("cookie");
    if (!header) return out;
    for (const part of header.split(";")) {
        const idx = part.indexOf("=");
        if (idx <= 0) continue;
        out.set(part.slice(0, idx).trim(), decodeURIComponent(part.slice(idx + 1).trim()));
    }
    return out;
}

export function sessionTokenFromCookies(req: Request): string | null {
    return parseCookies(req).get(SESSION_COOKIE) ?? null;
}
