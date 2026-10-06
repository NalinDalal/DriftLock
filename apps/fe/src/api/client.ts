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
    WebhookEndpoint,
    WebhookSchema,
    WebhookDrift,
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
    let res: Response;
    try {
        res = await fetch(`${BASE}${path}`, {
            // Sessions travel in the httpOnly cookie: every call carries it.
            credentials: "include",
            headers: { "content-type": "application/json" },
            ...init,
        });
    } catch (err) {
        // Network failure (backend down, DNS, refused). Reads and writes
        // alike surface "Backend offline" so the dashboard shows its error
        // state instead of rendering empty data as "healthy, 0 drift".
        // useFetch picks this up as `error`; every route renders it.
        throw new ApiError(0, "Backend offline");
    }
    if (!res.ok) {
        // 502/503/504 from a proxy when the backend is not running get the
        // same treatment as a network failure: a failed read must never look
        // like an empty-but-healthy account.
        const offline = res.status === 502 || res.status === 503 || res.status === 504;
        if (offline) {
            throw new ApiError(0, "Backend offline");
        }
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
    patch: Partial<Pick<Settings, "autoProbe" | "forwardWhitelist">> & {
        webhookConfig?: Partial<Settings["webhookConfig"]>;
    },
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

export function rotateApiKey(name: string): Promise<{ key: ApiKey & { raw: string } }> {
    return request(`/api/settings/rotate?name=${encodeURIComponent(name)}`, {
        method: "POST",
    });
}

export function getWebhookEndpoints(): Promise<{ endpoints: WebhookEndpoint[] }> {
    return request("/api/webhooks/endpoints");
}

export function getWebhookSchemas(
    endpointId: string,
): Promise<{ schemas: WebhookSchema[] }> {
    return request(
        `/api/webhooks/endpoints/${encodeURIComponent(endpointId)}/schemas`,
    );
}

export function getWebhookDrifts(
    endpointId?: string,
): Promise<{ drifts: WebhookDrift[] }> {
    const params = endpointId ? `?endpointId=${encodeURIComponent(endpointId)}` : "";
    return request(`/api/webhooks/drifts${params}`);
}