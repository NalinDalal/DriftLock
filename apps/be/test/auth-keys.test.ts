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

mock.module("../src/store", () => ({
    getStore: () => ({ findApiKey, emitEvent }),
}));

mock.module("../src/config", () => ({
    config: { bearerToken: "op-token", port: 8787, corsOrigins: [] as string[] },
}));

import { authenticate, resetRateLimits, type AuthContext } from "../src/auth";
import { config } from "../src/config";

function request(auth?: string): Request {
    return new Request("http://localhost/api/runs", {
        method: "POST",
        headers: auth ? { authorization: auth } : {},
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
        const [type, detail] = emitEvent.mock.calls[0] as [string, Record<string, unknown>];
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

    test("per-key rate limit trips at the configured quota", async () => {
        process.env.RATE_LIMIT_PER_MINUTE = "2";
        expect((await authenticate(request("Bearer dlk_valid")) as AuthContext).mode).toBe("api-key");
        expect((await authenticate(request("Bearer dlk_valid")) as AuthContext).mode).toBe("api-key");
        const limited = (await authenticate(request("Bearer dlk_valid"))) as Response;
        expect(limited).toBeInstanceOf(Response);
        expect(limited.status).toBe(429);
    });
});
