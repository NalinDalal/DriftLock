import { timingSafeEqual } from "crypto";
import { getDb, settings } from "@driftlock/db";
import {
    CALLBACK_RATE_LIMIT_PER_MIN,
    LOGIN_RATE_LIMIT_PER_MIN,
    checkIpRateLimit,
    findSession,
    sessionTtlMs,
} from "../auth";
import {
    clearSessionCookieHeader,
    parseCookies,
    sessionCookieHeader,
    sessionTokenFromCookies,
} from "../cookies";
import { encryptSecret } from "../secrets";
import { getStore } from "../store";

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function redirect(url: string): Response {
    return Response.redirect(url);
}

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";
const GITHUB_APP_SLUG = process.env.GITHUB_APP_SLUG || "";
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8787";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

function randomHex(bytes: number): string {
    const buf = new Uint8Array(bytes);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function generateSessionToken(): string {
    return randomHex(32);
}

const OAUTH_STATE_COOKIE = "driftlock_oauth_state";

function isSecureContext(): boolean {
    return BACKEND_URL.startsWith("https://");
}

function setStateCookie(state: string): string {
    return (
        `${OAUTH_STATE_COOKIE}=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600` +
        (isSecureContext() ? "; Secure" : "")
    );
}

function clearStateCookie(): string {
    return (
        `${OAUTH_STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0` +
        (isSecureContext() ? "; Secure" : "")
    );
}

function validState(provided: string | null, expected: string | undefined): boolean {
    if (!provided || !expected || provided.length !== expected.length) {
        return false;
    }
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

export async function handleGitHubLogin(req: Request): Promise<Response> {
    if (!GITHUB_CLIENT_ID) {
        return json({ error: "GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET." }, 500);
    }
    if (!checkIpRateLimit(req, LOGIN_RATE_LIMIT_PER_MIN)) {
        return json({ error: "Rate limit exceeded" }, 429);
    }

    const redirectUri = `${BACKEND_URL}/api/auth/github/callback`;

    // CSRF defense: unguessable state, verified and single-used on callback.
    const state = randomHex(16);
    const params = new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        redirect_uri: redirectUri,
        scope: "read:user user:email read:org repo",
        state,
    });

    const res = redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
    res.headers.set("Set-Cookie", setStateCookie(state));
    return res;
}

export async function handleGitHubCallback(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");

    if (!code) {
        return json({ error: "Missing code parameter" }, 400);
    }

    if (!checkIpRateLimit(req, CALLBACK_RATE_LIMIT_PER_MIN)) {
        return json({ error: "Rate limit exceeded" }, 429);
    }

    // Reject login-CSRF: the state returned by GitHub must match the cookie
    // set at login time. The cookie is cleared either way (single-use).
    const cookies = parseCookies(req);
    if (!validState(url.searchParams.get("state"), cookies.get(OAUTH_STATE_COOKIE))) {
        const denied = json({ error: "Invalid OAuth state" }, 400);
        denied.headers.set("Set-Cookie", clearStateCookie());
        return denied;
    }

    // Exchange code for access token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify({
            client_id: GITHUB_CLIENT_ID,
            client_secret: GITHUB_CLIENT_SECRET,
            code,
        }),
    });

    const tokenData = await tokenRes.json() as { access_token?: string; error?: string };

    if (!tokenData.access_token) {
        return json({ error: "Failed to get access token", details: tokenData }, 400);
    }

    // Get user info
    const userRes = await fetch("https://api.github.com/user", {
        headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            Accept: "application/vnd.github.v3+json",
        },
    });

    const user = await userRes.json() as {
        login: string;
        name: string;
        avatar_url: string;
        id: number;
    };

    // Get user's orgs
    const orgsRes = await fetch("https://api.github.com/user/orgs", {
        headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            Accept: "application/vnd.github.v3+json",
        },
    });

    const orgs = await orgsRes.json() as Array<{ login: string; id: number }>;

    // Store session (simplified - use proper session store in production)
    const sessionToken = generateSessionToken();
    const db = getDb();

    // Store user data in settings for now. The GitHub access token is
    // encrypted at rest when SESSION_ENC_KEY is set (plaintext dev fallback).
    await db.execute(`DELETE FROM settings WHERE key = 'session:${sessionToken}'`);
    await db.insert(settings).values({
        key: `session:${sessionToken}`,
        value: {
            userId: user.id,
            login: user.login,
            name: user.name,
            avatarUrl: user.avatar_url,
            accessToken: encryptSecret(tokenData.access_token),
            orgs: orgs.map((o) => ({ login: o.login, id: o.id })),
            createdAt: Date.now(),
            expiresAt: Date.now() + sessionTtlMs(),
        },
    });

    // Session travels in an httpOnly cookie only — no token in the URL, so
    // it never lands in history or logs. The state cookie is single-use.
    const done = redirect(`${FRONTEND_URL}/auth/callback`);
    done.headers.append("Set-Cookie", sessionCookieHeader(sessionToken));
    done.headers.append("Set-Cookie", clearStateCookie());
    return done;
}

export async function handleGetSession(req: Request): Promise<Response> {
    const token = sessionTokenFromCookies(req);
    if (!token) {
        return json({ user: null });
    }

    const session = await findSession(token);
    if (!session) {
        return json({ user: null });
    }
    return json({
        user: {
            login: session.login,
            name: session.name,
            avatarUrl: session.avatarUrl,
        },
    });
}

export async function handleGitHubRepos(req: Request): Promise<Response> {
    const token = sessionTokenFromCookies(req);
    if (!token) {
        return json({ error: "Unauthorized" }, 401);
    }

    const session = await findSession(token);
    if (!session) {
        return json({ error: "Invalid session" }, 401);
    }

    try {
        const accessToken = session.accessToken;

        // Fetch user's repos
        const reposRes = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github.v3+json",
            },
        });

        const repos = await reposRes.json() as Array<{
            id: number;
            name: string;
            full_name: string;
            owner: { login: string };
            private: boolean;
            default_branch: string;
            description: string | null;
        }>;

        // Fetch repos from user's orgs
        const orgRepos: typeof repos = [];
        for (const org of session.orgs || []) {
            const orgReposRes = await fetch(`https://api.github.com/orgs/${org.login}/repos?per_page=100&sort=updated`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Accept: "application/vnd.github.v3+json",
                },
            });

            const orgReposData = await orgReposRes.json() as typeof repos;
            orgRepos.push(...orgReposData);
        }

        return json({
            repos: [
                ...repos.map((r) => ({
                    id: r.id,
                    name: r.name,
                    fullName: r.full_name,
                    owner: r.owner.login,
                    private: r.private,
                    defaultBranch: r.default_branch,
                    description: r.description,
                })),
                ...orgRepos.map((r) => ({
                    id: r.id,
                    name: r.name,
                    fullName: r.full_name,
                    owner: r.owner.login,
                    private: r.private,
                    defaultBranch: r.default_branch,
                    description: r.description,
                })),
            ],
            user: {
                login: session.login,
                name: session.name,
                avatarUrl: session.avatarUrl,
            },
        });
    } catch (_error) {
        return json({ error: "Failed to fetch repos" }, 500);
    }
}

export function handleInstallUrl(req: Request): Response {
    if (!GITHUB_APP_SLUG) {
        return json({ error: "GitHub App not configured. Set GITHUB_APP_SLUG." }, 500);
    }

    const url = new URL(req.url);
    const repos = url.searchParams.get("repos"); // comma-separated repo IDs
    const returnTo = url.searchParams.get("returnTo") || "/";

    let installUrl = `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`;

    const params = new URLSearchParams();
    if (repos) {
        params.set("repositories", repos);
    }
    // state carries where to redirect after install — now points to our success page
    const successPath = "/install/success";
    params.set("state", encodeURIComponent(returnTo === "/" ? successPath : returnTo));

    const queryString = params.toString();
    if (queryString) {
        installUrl += `?${queryString}`;
    }

    return redirect(installUrl);
}

export async function handleLogout(req: Request): Promise<Response> {
    const token = sessionTokenFromCookies(req);
    if (token) {
        try {
            await getStore().deleteSetting(`session:${token}`);
        } catch {
            // Revocation is best-effort; the response stays the same either way.
        }
    }
    const res = json({ ok: true });
    res.headers.append("Set-Cookie", clearSessionCookieHeader());
    return res;
}
