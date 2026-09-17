import { describe, expect, test } from "bun:test";
import { TypeScriptExtractor, createImportResolver } from "@driftlock/parser";
import { STRIPE_VENDOR, TWILIO_VENDOR } from "@driftlock/core";
import { vendorConfigFromOpenApi, type OpenApiSpec } from "@driftlock/agent";

function parseImportResolver(code: string) {
    return createImportResolver(code);
}

const extractor = new TypeScriptExtractor({
    vendors: [STRIPE_VENDOR, TWILIO_VENDOR],
});

describe("ImportResolver", () => {
    test("binds default, named, aliased and namespace imports", () => {
        const resolver = parseImportResolver(`
import Stripe from "stripe";
import { twilio, MessagingResponse as Resp } from "twilio";
import * as FlatC from "@flatfile/listener";
`);
        expect(resolver.resolve("Stripe")).toBe("stripe");
        expect(resolver.resolve("twilio")).toBe("twilio");
        expect(resolver.resolve("Resp")).toBe("twilio");
        expect(resolver.resolve("FlatC")).toBe("@flatfile/listener");
    });

    test("binds constructor, factory and require re-bindings to their package", () => {
        const resolver = parseImportResolver(`
import Stripe from "stripe";
import { twilio } from "twilio";

const stripe = new Stripe("sk");
const client = twilio(sid, token);
const sdk = require("some-pkg");
`);
        expect(resolver.resolve("stripe")).toBe("stripe");
        expect(resolver.resolve("client")).toBe("twilio");
        expect(resolver.resolve("sdk")).toBe("some-pkg");
    });

    test("does not bind local relative imports", () => {
        const resolver = parseImportResolver(`
import { helper } from "./utils";
import config from "../config";
`);
        expect(resolver.resolve("helper")).toBeNull();
        expect(resolver.resolve("config")).toBeNull();
    });
});

describe("import-driven detection", () => {
    test("captures a call on an aliased, re-bound stripe client", async () => {
        const result = await extractor.extract(
            "src/s.ts",
            `import Sdk from "stripe";
const s = new Sdk("sk_test");
await s.charges.create({ amount: 100, currency: "usd" });`,
        );
        expect(result.callSites).toHaveLength(1);
        const site = result.callSites[0]!;
        expect(site.method).toBe("s.charges.create");
        expect(site.packageName).toBe("stripe");
        expect(site.endpoint).toBe("/v1/charges");
        expect(site.httpMethod).toBe("POST");
    });

    test("captures twilio factory client with basePath endpoint", async () => {
        const result = await extractor.extract(
            "src/t.ts",
            `import { twilio } from "twilio";
const client = twilio(sid, token);
await client.messages.create({ to, from, body });`,
        );
        expect(result.callSites).toHaveLength(1);
        const site = result.callSites[0]!;
        expect(site.packageName).toBe("twilio");
        expect(site.endpoint).toBe("/2010-04-01/messages");
        expect(site.httpMethod).toBe("POST");
    });

    test("captures an UNKNOWN package with no endpoint (sandbox fills in)", async () => {
        const result = await extractor.extract(
            "src/sg.ts",
            `import SendGrid from "@sendgrid/mail";
const sg = new SendGrid("key");
await sg.mail.send({ to, from });`,
        );
        expect(result.callSites).toHaveLength(1);
        const site = result.callSites[0]!;
        expect(site.packageName).toBe("@sendgrid/mail");
        expect(site.endpoint).toBeUndefined();
        expect(site.httpMethod).toBeUndefined();
    });

    test("suppresses unconfigured packages when captureUnknownPackages is false", async () => {
        const strict = new TypeScriptExtractor({
            vendors: [STRIPE_VENDOR],
            captureUnknownPackages: false,
        });
        const result = await strict.extract(
            "src/sg.ts",
            `import SendGrid from "@sendgrid/mail";
const sg = new SendGrid("key");
await sg.mail.send({ to, from });`,
        );
        expect(result.callSites).toHaveLength(0);
    });

    test("still captures known vendor via clientName fallback (no imports)", async () => {
        const result = await extractor.extract(
            "src/legacy.ts",
            `await stripe.charges.create({ amount: 100 });`,
        );
        expect(result.callSites).toHaveLength(1);
        expect(result.callSites[0]!.packageName).toBe("stripe");
        expect(result.callSites[0]!.endpoint).toBe("/v1/charges");
    });

    test("require()-based client is captured with correct package metadata", async () => {
        const result = await extractor.extract(
            "src/cjs.ts",
            `const stripe = require("stripe");
await stripe.payment_intents.create({ amount: 100 });`,
            "javascript",
        );
        expect(result.callSites).toHaveLength(1);
        expect(result.callSites[0]!.packageName).toBe("stripe");
        expect(result.callSites[0]!.endpoint).toBe("/v1/payment_intents");
    });
});

// An SDK this codebase has never heard of, with its docs as an OpenAPI spec.
function acmePostsSpec(): OpenApiSpec {
    return {
        info: { title: "Acme Posts", version: "1.0" },
        servers: [{ url: "https://api.acmeposts.com/v2" }],
        paths: {
            "/v2/posts": {
                post: { operationId: "createPost" },
                get: { operationId: "listPosts" },
            },
            "/v2/posts/{id}": {
                get: { operationId: "getPost" },
                patch: { operationId: "updatePost" },
                delete: { operationId: "deletePost" },
            },
            "/v2/posts/{id}/like": {
                post: { operationId: "likePost" },
            },
        },
    };
}

describe("generic vendor support (zero hardcoding)", () => {
    test("never-seen package gets endpoint precision from docs-derived config", async () => {
        const config = vendorConfigFromOpenApi(acmePostsSpec(), {
            name: "acme",
            sdk: "@acme/posts-sdk",
            clientNames: ["api"],
            basePath: "/v2",
        });
        const generic = new TypeScriptExtractor({ vendors: [config] });

        const result = await generic.extract(
            "src/posts.ts",
            `import Acme from "@acme/posts-sdk";
const api = new Acme("sk");
const created = await api.posts.create({ title: "hi" });
const list = await api.posts.list();
const one = await api.posts.retrieve("p_1");
await api.posts.update("p_1", { title: "updated" });
await api.posts.delete("p_1");
await api.posts.like("p_1");`,
        );

        const endpoints = result.callSites.map((s) => s.endpoint);
        expect(endpoints).toEqual([
            "/v2/posts",
            "/v2/posts",
            "/v2/posts/:id",
            "/v2/posts/:id",
            "/v2/posts/:id",
            "/v2/posts/:id/like",
        ]);
        expect(result.callSites[0]!.packageName).toBe("@acme/posts-sdk");
        expect(result.callSites[0]!.httpMethod).toBe("POST");
        expect(result.callSites[5]!.httpMethod).toBe("POST");
    });

    test("without a derived config the same call sites still capture, endpoint pending", async () => {
        const bare = new TypeScriptExtractor();
        const result = await bare.extract(
            "src/posts.ts",
            `import Acme from "@acme/posts-sdk";
const api = new Acme("sk");
await api.posts.create({ title: "hi" });`,
        );
        expect(result.callSites).toHaveLength(1);
        expect(result.callSites[0]!.packageName).toBe("@acme/posts-sdk");
        expect(result.callSites[0]!.endpoint).toBeUndefined();
    });
});
