import { describe, expect, test } from "bun:test";
import type { CallSite } from "@driftlock/core";
import {
    matchesCapture,
    resolveCapturedEndpoints,
    type CaptureLike,
} from "@driftlock/diff";

function makeCallSite(overrides: Partial<CallSite> = {}): CallSite {
    return {
        id: "cs-1",
        repositoryId: "",
        filePath: "src/email.ts",
        line: 12,
        method: "client.mail.send",
        packageName: "@sendgrid/mail",
        requestShape: {},
        responseFields: [],
        testFiles: [],
        lastCheckedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

describe("matchesCapture", () => {
    test("matches path literals with the same HTTP verb", () => {
        const site = makeCallSite({
            endpoint: "/v1/charges",
            httpMethod: "POST",
        });
        const capture: CaptureLike = {
            method: "POST",
            url: "https://api.stripe.com/v1/charges",
        };
        expect(matchesCapture(capture, site)).toBe(true);
    });

    test("treats colon segments as wildcards", () => {
        const site = makeCallSite({
            endpoint: "/v2/posts/:id",
            httpMethod: "GET",
        });
        const capture: CaptureLike = {
            method: "GET",
            url: "https://acme.example.com/v2/posts/42",
        };
        expect(matchesCapture(capture, site)).toBe(true);
    });

    test("rejects unresolved and mismatched sites", () => {
        const unresolved = makeCallSite();
        const wrongVerb = makeCallSite({
            endpoint: "/v1/charges",
            httpMethod: "GET",
        });
        const capture: CaptureLike = {
            method: "POST",
            url: "https://api.stripe.com/v1/charges",
        };
        expect(matchesCapture(capture, unresolved)).toBe(false);
        expect(matchesCapture(capture, wrongVerb)).toBe(false);
    });
});

describe("resolveCapturedEndpoints", () => {
    test("resolves an unknown vendor endpoint from payload overlap", () => {
        const site = makeCallSite({
            id: "cs-sendgrid",
            method: "client.mail.send",
            requestShape: { to: [], from: "a@b.c", subject: "Hi" },
            responseFields: ["messageId"],
        });
        const captures: CaptureLike[] = [
            {
                method: "POST",
                url: "https://api.sendgrid.com/v3/mail/send",
                body: { to: ["a@b.c"], from: "a@b.c", subject: "Hi" },
                response: { body: { messageId: "m1", status: "202" } },
            },
        ];

        const fills = resolveCapturedEndpoints([site], captures);

        const fill = fills.get("cs-sendgrid");
        expect(fill?.endpoint).toBe("/v3/mail/send");
        expect(fill?.httpMethod).toBe("POST");
        expect(fill?.requestFields.sort()).toEqual(["from", "subject", "to"]);
        expect(fill?.responseFields.sort()).toEqual(["messageId", "status"]);
    });

    test("derives a placeholder when the path segment varies in the group", () => {
        const site = makeCallSite({
            id: "cs-posts",
            method: "client.posts.publish",
            requestShape: { title: "x", author: "y" },
            responseFields: ["id", "title"],
        });
        const captures: CaptureLike[] = [
            {
                method: "POST",
                url: "https://acme.example.com/v2/posts/1",
                body: { title: "one", author: "a" },
                response: { body: { id: 1, title: "one" } },
            },
            {
                method: "POST",
                url: "https://acme.example.com/v2/posts/42",
                body: { title: "two", author: "b" },
                response: { body: { id: 42, title: "two" } },
            },
        ];

        const fills = resolveCapturedEndpoints([site], captures);

        expect(fills.get("cs-posts")?.endpoint).toBe("/v2/posts/:id");
        expect(fills.get("cs-posts")?.httpMethod).toBe("POST");
    });

    test("leaves a site unresolved when nothing overlaps", () => {
        const site = makeCallSite({
            id: "cs-empty",
            requestShape: {},
            responseFields: [],
        });
        const captures: CaptureLike[] = [
            {
                method: "POST",
                url: "https://acme.example.com/x",
                body: { unrelated: 1 },
                response: { body: { other: 2 } },
            },
        ];

        const fills = resolveCapturedEndpoints([site], captures);

        expect(fills.size).toBe(0);
    });

    test("does not steal a capture already claimed by a known endpoint", () => {
        const known = makeCallSite({
            id: "cs-known",
            packageName: "stripe",
            method: "client.charges.create",
            endpoint: "/v1/charges",
            httpMethod: "POST",
            requestShape: {},
            responseFields: [],
        });
        const ghost = makeCallSite({
            id: "cs-ghost",
            requestShape: { amount: 1000 },
            responseFields: [],
        });
        const captures: CaptureLike[] = [
            {
                method: "POST",
                url: "https://api.stripe.com/v1/charges",
                body: { amount: 1000, currency: "usd" },
                response: { body: { id: "ch_1" } },
            },
        ];

        const fills = resolveCapturedEndpoints([known, ghost], captures);

        expect(fills.size).toBe(0);
    });

    test("ignores captures with verbs outside the claimable set", () => {
        const site = makeCallSite({
            id: "cs-options",
            requestShape: { a: 1 },
            responseFields: ["b"],
        });
        const captures: CaptureLike[] = [
            {
                method: "OPTIONS",
                url: "https://acme.example.com/a",
                body: { a: 1 },
                response: { body: { b: 2 } },
            },
        ];

        const fills = resolveCapturedEndpoints([site], captures);

        expect(fills.size).toBe(0);
    });
});