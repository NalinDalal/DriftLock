import { describe, expect, mock, test } from "bun:test";

mock.module("@driftlock/be/src/config", () => ({
    config: {
        bearerToken: null,
        port: 8787,
        corsOrigins: ["http://localhost:5173"],
    },
}));

import {
    allowedOrigin,
    corsHeaders,
    corsResponse,
} from "@driftlock/be/src/utils";

function req(origin?: string): Request {
    return new Request("http://localhost:8787/api/me", {
        headers: origin ? { origin } : {},
    });
}

describe("credentialed CORS", () => {
    test("echoes an allowlisted origin with credentials", () => {
        expect(allowedOrigin(req("http://localhost:5173"))).toBe(
            "http://localhost:5173",
        );
        const headers = corsHeaders(req("http://localhost:5173"));
        expect(headers["access-control-allow-origin"]).toBe(
            "http://localhost:5173",
        );
        expect(headers["access-control-allow-credentials"]).toBe("true");
        expect(headers.vary).toBe("Origin");
    });

    test("unlisted origins get no allow-origin header", () => {
        expect(allowedOrigin(req("https://evil.example"))).toBeNull();
        expect(
            corsHeaders(req("https://evil.example"))[
                "access-control-allow-origin"
            ],
        ).toBeUndefined();
    });

    test("preflight carries methods and credentials", () => {
        const res = corsResponse(req("http://localhost:5173"));
        expect(res.status).toBe(204);
        expect(res.headers.get("access-control-allow-origin")).toBe(
            "http://localhost:5173",
        );
        expect(res.headers.get("access-control-allow-credentials")).toBe("true");
        expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    });
});
