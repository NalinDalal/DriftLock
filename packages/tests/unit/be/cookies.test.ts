import { describe, expect, test } from "bun:test";
import {
    SESSION_COOKIE,
    clearSessionCookieHeader,
    parseCookies,
    sessionCookieHeader,
    sessionTokenFromCookies,
} from "@driftlock/be/src/cookies";

function req(cookie?: string): Request {
    return new Request("http://localhost/api/me", {
        headers: cookie ? { cookie } : {},
    });
}

describe("session cookies", () => {
    test("set header is httpOnly, Lax, and scoped", () => {
        const header = sessionCookieHeader("a".repeat(64));
        expect(header.startsWith(`${SESSION_COOKIE}=`)).toBe(true);
        for (const attr of ["HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=604800"]) {
            expect(header).toContain(attr);
        }
    });

    test("clear header expires immediately", () => {
        const header = clearSessionCookieHeader();
        expect(header).toContain("Max-Age=0");
        expect(header).toContain("HttpOnly");
    });

    test("round-trips through parse", () => {
        const token = "b".repeat(64);
        const parsed = parseCookies(
            req(`other=1; ${SESSION_COOKIE}=${token}; trailing=2`),
        );
        expect(parsed.get(SESSION_COOKIE)).toBe(token);
        expect(sessionTokenFromCookies(req(`other=1`))).toBeNull();
        expect(sessionTokenFromCookies(req())).toBeNull();
    });
});
