import type {
    Account,
    ApiKey,
    CallSiteSummary,
    DriftEvent,
    Permission,
    Pull,
    Repo,
    RepoDetail,
    Settings,
    User,
} from "./types";

const BASE = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
    constructor(
        public status: number,
        message: string,
    ) {
        super(message);
    }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        headers: { "content-type": "application/json" },
        ...init,
    });
    if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new ApiError(
            res.status,
            (body as { error?: string } | null)?.error ?? res.statusText,
        );
    }
    return res.json() as Promise<T>;
}

export function getMe(): Promise<{ user: User }> {
    return request("/api/me");
}

export function getAccounts(): Promise<{ accounts: Account[] }> {
    return request("/api/accounts");
}

export function getAccountRepos(owner: string): Promise<{ repos: Repo[] }> {
    return request(`/api/accounts/${encodeURIComponent(owner)}/repos`);
}

export function getRepo(o: string, n: string): Promise<RepoDetail> {
    return request(
        `/api/repos/${encodeURIComponent(o)}/${encodeURIComponent(n)}`,
    );
}

export function getRepoDrifts(o: string, n: string): Promise<{ drifts: DriftEvent[] }> {
    return request(
        `/api/repos/${encodeURIComponent(o)}/${encodeURIComponent(n)}/drifts`,
    );
}

export function getRepoPulls(o: string, n: string): Promise<{ pulls: Pull[] }> {
    return request(
        `/api/repos/${encodeURIComponent(o)}/${encodeURIComponent(n)}/pulls`,
    );
}

export function getRepoCallSites(
    o: string,
    n: string,
): Promise<{ callsites: CallSiteSummary[] }> {
    return request(
        `/api/repos/${encodeURIComponent(o)}/${encodeURIComponent(n)}/callsites`,
    );
}

export function getSettings(): Promise<{ settings: Settings }> {
    return request("/api/settings");
}

export function updateSettings(
    patch: Partial<Pick<Settings, "autoProbe" | "forwardWhitelist">>,
): Promise<{ settings: Settings }> {
    return request("/api/settings", {
        method: "PUT",
        body: JSON.stringify(patch),
    });
}

export function updateRepoPolicy(
    o: string,
    n: string,
    patch: Partial<{ watched: boolean; permission: Permission; schedule: string }>,
): Promise<{ repo: Repo }> {
    return request(
        `/api/repos/${encodeURIComponent(o)}/${encodeURIComponent(n)}/policy`,
        {
            method: "PUT",
            body: JSON.stringify(patch),
        },
    );
}

export function rotateApiKey(name: string): Promise<{ key: ApiKey }> {
    return request(`/api/settings/rotate?name=${encodeURIComponent(name)}`, {
        method: "POST",
    });
}