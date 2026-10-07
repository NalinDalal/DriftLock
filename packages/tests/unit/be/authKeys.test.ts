import { afterEach, describe, expect, mock, test } from "bun:test";

const findApiKey = mock(async (raw: string) =>
    raw === "dlk_valid"
        ? {
              id: "key-1",
              name: "ci",
              keyPrefix: "dlk_valid",
              keyHash: "hash",
              masked: "dlk_…lid",
              createdAt: new Date(),
          }
        : null,
);
const emitEvent = mock(() => {});

const SESSION_TOKEN = "a".repeat(64);
const EXPIRED_TOKEN = "e".repeat(64);
const sessionValue = (overrides: Record<string, unknown> = {}) => ({
    userId: 1,
    login: "octo",
    name: "Octo",
    avatarUrl: "https://x/y.png",
    accessToken: "gho_x",
    orgs: [],
    createdAt: Date.now() - 1000,
    expiresAt: Date.now() + 3600_000,
    ...overrides,
});
const getSetting = mock(async (key: string) => {
    if (key === `session:${SESSION_TOKEN}`) return sessionValue();
    if (key === `session:${EXPIRED_TOKEN}`) {
        return sessionValue({ expiresAt: Date.now() - 1000 });
    }
    return null;
});
const deleteSetting = mock(async (_key: string) => {});

mock.module("@driftlock/be/src/store", () => ({
    getStore: () => ({ findApiKey, emitEvent, getSetting, deleteSetting }),
}));

mock.module("@driftlock/be/src/config", () => ({
    config: { bearerToken: "op-token", port: 8787, corsOrigins: [] as string[] },
}));

import { authenticate, resetRateLimits, type AuthContext } from "@driftlock/be/src/auth";
import { config } from "@driftlock/be/src/config";

function request(auth?: string): Request {
    return new Request("http://localhost/api/runs", {
        method: "POST",
        headers: auth ? { authorization: auth } : {},
    });
}

function cookieRequest(token: string): Request {
    return new Request("http://localhost/api/runs", {
        method: "POST",
        headers: { cookie: `driftlock_session=${token}` },
    });
}

function ctxOf(value: AuthContext | Response): AuthContext {
    expect(value).not.toBeInstanceOf(Response);
    return value as AuthContext;
}

afterEach(() => {
    resetRateLimits();
    findApiKey.mockClear();
    emitEvent.mockClear();
    getSetting.mockClear();
    deleteSetting.mockClear();
    delete process.env.RATE_LIMIT_PER_MINUTE;
    (config as { bearerToken: string | null }).bearerToken = "op-token";
});

describe("authenticate", () => {
    test("no header with operator token configured is 401", async () => {
        const res = (await authenticate(request())) as Response;
        expect(res).toBeInstanceOf(Response);
        expect(res.status).toBe(401);
    });

    test("no header without operator token is open (dev default)", async () => {
        (config as { bearerToken: string | null }).bearerToken = null;
        expect(ctxOf(await authenticate(request()))).toEqual({ mode: "open" });
        expect(findApiKey).not.toHaveBeenCalled();
    });

    test("operator token still works", async () => {
        expect(ctxOf(await authenticate(request("Bearer op-token")))).toEqual({
            mode: "operator",
        });
        expect(findApiKey).not.toHaveBeenCalled();
    });

    test("non-key bearer is 401 without a DB lookup", async () => {
        const res = (await authenticate(request("Bearer garbage"))) as Response;
        expect(res.status).toBe(401);
        expect(findApiKey).not.toHaveBeenCalled();
    });

    test("valid dlk_ key verifies by hash and emits usage", async () => {
        const ctx = ctxOf(await authenticate(request("Bearer dlk_valid")));
        expect(ctx.mode).toBe("api-key");
        expect(ctx.key).toMatchObject({ id: "key-1", name: "ci" });
        expect(findApiKey).toHaveBeenCalledWith("dlk_valid");
        expect(emitEvent).toHaveBeenCalledTimes(1);
        const [type, detail] = emitEvent.mock.calls[0] as unknown as [
            string,
            Record<string, unknown>,
        ];
        expect(type).toBe("api_called");
        expect(detail).toMatchObject({ keyId: "key-1", path: "/api/runs" });
    });

    test("unknown dlk_ key is 401", async () => {
        const res = (await authenticate(request("Bearer dlk_nope"))) as Response;
        expect(res.status).toBe(401);
        expect(emitEvent).not.toHaveBeenCalled();
    });

    test("DB failure fails closed with 503", async () => {
        findApiKey.mockRejectedValueOnce(new Error("down"));
        const res = (await authenticate(request("Bearer dlk_valid"))) as Response;
        expect(res.status).toBe(503);
    });

     test("dashboard session cookie authenticates without a key lookup", async () => {
        const ctx = ctxOf(await authenticate(cookieRequest(SESSION_TOKEN)));
        expect(ctx.mode).toBe("session");
        expect(ctx.session).toMatchObject({ login: "octo" });
        expect(findApiKey).not.toHaveBeenCalled();
        expect(emitEvent).not.toHaveBeenCalled();
    });

     test("Bearer session tokens are retired even when valid", async () => {
        const res = (await authenticate(request(`Bearer ${SESSION_TOKEN}`))) as Response;
        expect(res.status).toBe(401);
    });

     test("unknown session cookie is 401", async () => {
        const res = (await authenticate(cookieRequest("b".repeat(64)))) as Response;
        expect(res.status).toBe(401);
    });

     test("encrypted session decrypts through the middleware", async () => {
        const { encryptSecret } = await import("@driftlock/be/src/secrets");
        process.env.SESSION_ENC_KEY = "3".repeat(64);
        const enc = encryptSecret("gho_live");
        getSetting.mockImplementationOnce(async () => ({
            ...sessionValue(),
            accessToken: enc,
        }));
        const ctx = ctxOf(await authenticate(cookieRequest(SESSION_TOKEN)));
        expect(ctx.mode).toBe("session");
        delete process.env.SESSION_ENC_KEY;
    });

     test("expired session is rejected and cleaned up", async () => {
        const res = (await authenticate(cookieRequest(EXPIRED_TOKEN))) as Response;
        expect(res.status).toBe(401);
        expect(deleteSetting).toHaveBeenCalledWith(`session:${EXPIRED_TOKEN}`);
        expect(emitEvent).not.toHaveBeenCalled();
    });

    test("non-hex bearer is 401 without touching the DB", async () => {
        const res = (await authenticate(request("Bearer not-a-real-token!"))) as Response;
        expect(res.status).toBe(401);
        expect(findApiKey).not.toHaveBeenCalled();
        expect(getSetting).not.toHaveBeenCalled();
    });

    test("per-key rate limit trips at the configured quota", async () => {
        process.env.RATE_LIMIT_PER_MINUTE = "2";
        expect((await authenticate(request("Bearer dlk_valid")) as AuthContext).mode).toBe("api-key");
        expect((await authenticate(request("Bearer dlk_valid")) as AuthContext).mode).toBe("api-key");
        const limited = (await authenticate(request("Bearer dlk_valid"))) as Response;
        expect(limited).toBeInstanceOf(Response);
        expect(limited.status).toBe(429);
    });
});
