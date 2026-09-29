import { afterEach, describe, expect, mock, test } from "bun:test";

// OAuth env must be set before the routes module is first evaluated.
process.env.GITHUB_CLIENT_ID = "test-client-id";
process.env.GITHUB_CLIENT_SECRET = "test-client-secret";
process.env.BACKEND_URL = "http://localhost:8787";
process.env.FRONTEND_URL = "http://localhost:5173";

type FetchStub = { json: () => Promise<unknown> };
const fetchMock = mock(
    async (_url: string, _init?: RequestInit): Promise<FetchStub> => {
        throw new Error("fetch must be stubbed per test");
    },
);

mock.module("@driftlock/db", () => ({
    getDb: () => ({
        execute: async () => [],
        insert: () => ({ values: async () => {} }),
    }),
    settings: {},
}));

const storeDeleteSetting = mock(async (_key: string) => {});
mock.module("@driftlock/be/src/store", () => ({
    getStore: () => ({ deleteSetting: storeDeleteSetting }),
}));

const realFetch = globalThis.fetch;

const {
    handleGitHubLogin,
    handleGitHubCallback,
    handleLogout,
} = await import("@driftlock/be/src/routes/auth");

function stateFromRedirect(res: Response): { state: string | null; cookie: string | null } {
    const location = res.headers.get("location") ?? "";
    const state = new URL(location).searchParams.get("state");
    const setCookie = res.headers.get("set-cookie");
    const cookie = setCookie?.match(/driftlock_oauth_state=([^;]*)/)?.[1] ?? null;
    return { state, cookie };
}

afterEach(() => {
    storeDeleteSetting.mockClear();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => {
        throw new Error("fetch must be stubbed per test");
    });
    globalThis.fetch = realFetch;
});

describe("OAuth login state", () => {
    test("issues an unguessable state in both URL and httpOnly cookie", async () => {
        const res = await handleGitHubLogin(
            new Request("http://localhost:8787/api/auth/github"),
        );
        expect(res.status).toBe(302);
        const { state, cookie } = stateFromRedirect(res);
        expect(state).toMatch(/^[0-9a-f]{32}$/);
        expect(cookie).toBe(state);
        const setCookie = res.headers.get("set-cookie") ?? "";
        expect(setCookie).toContain("HttpOnly");
        expect(setCookie).toContain("SameSite=Lax");
    });

    test("two logins produce different states", async () => {
        const loginReq = () =>
            new Request("http://localhost:8787/api/auth/github");
        const a = stateFromRedirect(await handleGitHubLogin(loginReq()));
        const b = stateFromRedirect(await handleGitHubLogin(loginReq()));
        expect(a.state).not.toBe(b.state);
    });
});

describe("OAuth callback state verification", () => {
    const CALLBACK = "http://localhost:8787/api/auth/github/callback?code=abc&state=";

    function githubStubs() {
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        fetchMock.mockImplementation(async (url: string) => {
            const urlStr = String(url);
            if (urlStr.includes("access_token")) {
                return { json: async () => ({ access_token: "gho_x" }) };
            }
            if (urlStr.includes("/user/orgs")) {
                return { json: async () => [] };
            }
            if (urlStr.includes("/user")) {
                return {
                    json: async () => ({
                        login: "octo",
                        name: "Octo",
                        avatar_url: "https://x/y.png",
                        id: 1,
                    }),
                };
            }
            throw new Error(`unexpected fetch ${urlStr}`);
        });
    }

    test("missing state cookie is rejected before any GitHub call", async () => {
        let fetched = false;
        globalThis.fetch = (async () => {
            fetched = true;
            throw new Error("must not fetch");
        }) as unknown as typeof fetch;
        const res = await handleGitHubCallback(new Request(`${CALLBACK}abc`));
        expect(res.status).toBe(400);
        expect(fetched).toBe(false);
        expect(res.headers.get("set-cookie") ?? "").toContain("Max-Age=0");
    });

    test("mismatched state is rejected", async () => {
        let fetched = false;
        globalThis.fetch = (async () => {
            fetched = true;
            throw new Error("must not fetch");
        }) as unknown as typeof fetch;
        const res = await handleGitHubCallback(
            new Request(`${CALLBACK}abc`, {
                headers: { cookie: "driftlock_oauth_state=def".replace("def", "0".repeat(32)) },
            }),
        );
        expect(res.status).toBe(400);
        expect(fetched).toBe(false);
    });

    test("matching state completes login and clears the cookie", async () => {
        githubStubs();
        const login = await handleGitHubLogin(
            new Request("http://localhost:8787/api/auth/github"),
        );
        const { state, cookie } = stateFromRedirect(login);
        expect(state).not.toBeNull();
        const res = await handleGitHubCallback(
            new Request(`${CALLBACK}${state}`, {
                headers: { cookie: `driftlock_oauth_state=${cookie}` },
            }),
        );
        expect(res.status).toBe(302);
        const location = res.headers.get("location") ?? "";
        expect(location).toContain("/auth/callback");
        expect(location).not.toContain("token=");
        const cookies = res.headers.getSetCookie?.() ?? [
            res.headers.get("set-cookie") ?? "",
        ];
        expect(cookies.some((c) => c.startsWith("driftlock_session="))).toBe(true);
        expect(cookies.some((c) => c.includes("HttpOnly"))).toBe(true);
        expect(cookies.some((c) => c.includes("Max-Age=0"))).toBe(true);
    });
});

describe("logout revocation", () => {
    const TOKEN = "c".repeat(64);

    test("deletes the session row, clears the cookie, answers ok", async () => {
        const res = await handleLogout(
            new Request("http://localhost/api/auth/logout", {
                method: "POST",
                headers: { cookie: `driftlock_session=${TOKEN}` },
            }),
        );
        expect(res.status).toBe(200);
        expect(storeDeleteSetting).toHaveBeenCalledWith(`session:${TOKEN}`);
        expect(res.headers.get("set-cookie") ?? "").toContain("Max-Age=0");
    });

    test("no cookie still answers ok without deleting", async () => {
        const res = await handleLogout(
            new Request("http://localhost/api/auth/logout", { method: "POST" }),
        );
        expect(res.status).toBe(200);
        expect(storeDeleteSetting).not.toHaveBeenCalled();
    });
});
