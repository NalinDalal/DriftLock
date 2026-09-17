import { describe, expect, test, mock } from "bun:test";
import {
    Agent,
    InMemoryVendorStore,
    validateVendorConfig,
    deriveBasePath,
    methodKeyFromPath,
    vendorConfigFromOpenApi,
    type OpenApiSpec,
} from "@driftlock/agent";
import { TypeScriptExtractor } from "@driftlock/parser";

function stripeLikeSpec(): OpenApiSpec {
    return {
        info: { title: "Example", version: "1.0" },
        servers: [{ url: "https://api.example.com/v1" }],
        paths: {
            "/v1/charges": {
                get: { operationId: "listCharges" },
                post: { operationId: "createCharge" },
            },
            "/v1/charges/{charge}": {
                get: { operationId: "getCharge" },
                post: { operationId: "updateCharge" },
                delete: { operationId: "deleteCharge" },
            },
            "/v1/invoices/{invoice}/finalize": {
                post: { operationId: "finalizeInvoice" },
            },
            "/v1/customers/{customer}/sources": {
                get: { operationId: "listCustomerSources" },
            },
            "/v1/customers/{customer}/sources/{source}": {
                delete: { operationId: "deleteCustomerSource" },
            },
            "/v1/subscriptions/{subscription}": {
                put: { operationId: "updateSubscription" },
            },
        },
    };
}

describe("deriveBasePath", () => {
    test("reads the path from servers", () => {
        const spec = stripeLikeSpec();
        expect(deriveBasePath(spec)).toBe("/v1");
    });

    test("falls back to the longest common literal prefix", () => {
        const spec: OpenApiSpec = {
            paths: {
                "/api/widgets": { get: {} },
                "/api/widgets/{id}": { get: {} },
                "/api/gadgets": { get: {} },
            },
        };
        expect(deriveBasePath(spec)).toBe("/api");
    });

    test("returns empty string when paths share no literal prefix", () => {
        const spec: OpenApiSpec = {
            paths: {
                "/widgets/{id}": { get: {} },
                "/gadgets/{id}": { get: {} },
            },
        };
        expect(deriveBasePath(spec)).toBe("");
    });
});

describe("methodKeyFromPath", () => {
    test("maps collections", () => {
        expect(methodKeyFromPath("/checkout/sessions", "GET")).toEqual({
            resourcePath: "checkout.sessions",
            method: "list",
        });
        expect(methodKeyFromPath("/charges", "POST")).toEqual({
            resourcePath: "charges",
            method: "create",
        });
    });

    test("maps items", () => {
        expect(methodKeyFromPath("/charges/:id", "GET")).toEqual({
            resourcePath: "charges",
            method: "retrieve",
        });
        expect(methodKeyFromPath("/charges/:id", "DELETE")).toEqual({
            resourcePath: "charges",
            method: "delete",
        });
        expect(methodKeyFromPath("/charges/:id", "PATCH")).toEqual({
            resourcePath: "charges",
            method: "update",
        });
    });

    test("maps custom actions", () => {
        expect(methodKeyFromPath("/invoices/:id/send_email", "POST")).toEqual({
            resourcePath: "invoices",
            method: "sendEmail",
        });
    });

    test("maps nested collections and items", () => {
        expect(methodKeyFromPath("/customers/:id/sources", "GET")).toEqual({
            resourcePath: "customers.sources",
            method: "list",
        });
        expect(
            methodKeyFromPath("/customers/:id/sources/:id", "DELETE"),
        ).toEqual({
            resourcePath: "customers.sources",
            method: "delete",
        });
    });
});

describe("validateVendorConfig", () => {
    const valid = {
        name: "acme",
        sdk: "acme-sdk",
        clientNames: ["acme"],
        basePath: "/api",
    };

    test("accepts and normalizes a valid config", () => {
        expect(validateVendorConfig(valid)).toEqual(valid);
    });

    test("accepts a config with overrides and verb hints", () => {
        const result = validateVendorConfig({
            ...valid,
            resources: {
                subscriptions: {
                    overrides: { cancel: { endpoint: "/api/subscriptions/:id/cancel", httpMethod: "DELETE" } },
                    httpMethods: { cancel: "DELETE" },
                },
            },
            docs: { url: "https://docs.example.com" },
        });

        expect(result.resources?.subscriptions?.overrides).toEqual({
            cancel: { endpoint: "/api/subscriptions/:id/cancel", httpMethod: "DELETE" },
        });
        expect(result.resources?.subscriptions?.httpMethods).toEqual({
            cancel: "DELETE",
        });
    });

    test("rejects non-objects", () => {
        expect(() => validateVendorConfig(null)).toThrow("expected an object");
        expect(() => validateVendorConfig("nope")).toThrow("expected an object");
    });

    test("rejects missing or empty fields", () => {
        expect(() =>
            validateVendorConfig({ ...valid, name: "" }),
        ).toThrow("name");
        expect(() =>
            validateVendorConfig({ ...valid, clientNames: [] }),
        ).toThrow("clientNames");
        expect(() =>
            validateVendorConfig({ ...valid, basePath: "api" }),
        ).toThrow("basePath");
    });

    test("rejects invalid http verbs", () => {
        expect(() =>
            validateVendorConfig({
                ...valid,
                resources: { x: { httpMethods: { y: "FETCH" } } },
            }),
        ).toThrow("GET/POST/PUT/DELETE/PATCH");
    });

    test("rejects malformed overrides", () => {
        expect(() =>
            validateVendorConfig({
                ...valid,
                resources: { x: { overrides: { y: { endpoint: "no-slash" } } } },
            }),
        ).toThrow("must start with '/'");
    });
});

describe("vendorConfigFromOpenApi", () => {
    const options = {
        name: "example",
        sdk: "example-sdk",
        clientNames: ["example"],
    };

    test("derives basePath from servers", () => {
        const config = vendorConfigFromOpenApi(stripeLikeSpec(), options);
        expect(config.basePath).toBe("/v1");
    });

    test("omits overrides for standard CRUD", () => {
        const config = vendorConfigFromOpenApi(stripeLikeSpec(), options);
        // charges is pure CRUD and fully reproduces from inference.
        expect(config.resources?.charges).toBeUndefined();
    });

    test("emits an override for an action named via operationId", () => {
        const config = vendorConfigFromOpenApi(stripeLikeSpec(), options);
        // Naive inference from `finalizeInvoice` would yield `finalize_invoice`.
        expect(config.resources?.invoices?.overrides).toEqual({
            finalizeInvoice: { endpoint: "/v1/invoices/:id/finalize" },
        });
    });

    test("emits overrides for paths that break inference", () => {
        const config = vendorConfigFromOpenApi(stripeLikeSpec(), options);

        expect(config.resources?.["customers.sources"]?.overrides).toEqual({
            list: { endpoint: "/v1/customers/:id/sources" },
            delete: { endpoint: "/v1/customers/:id/sources/:id" },
        });
    });

    test("emits httpMethods hints when the verb differs from the default", () => {
        const config = vendorConfigFromOpenApi(stripeLikeSpec(), options);
        expect(config.resources?.subscriptions?.httpMethods).toEqual({
            update: "PUT",
        });
        // update's inferred endpoint is /v1/subscriptions/:id, matching the spec.
        expect(config.resources?.subscriptions?.overrides).toBeUndefined();
    });

    test("config emitted from a spec round-trips through the parser", async () => {
        const config = vendorConfigFromOpenApi(stripeLikeSpec(), {
            ...options,
            basePath: "/v1",
        });
        const extractor = new TypeScriptExtractor({ vendors: [config] });

        const code = `
await example.charges.list();
await example.charges.create({ amount: 100 });
await example.charges.retrieve("ch_1");
await example.charges.delete("ch_1");
await example.invoices.finalizeInvoice("in_1");
await example.customers.sources.list("cus_1");
await example.customers.sources.delete("cus_1", "src_1");
await example.subscriptions.update("sub_1", { plan: "pro" });
`;
        const result = await extractor.extractFromFile("src/api.ts", code);
        const endpoints = result.callSites.map((c) => c.endpoint);

        expect(endpoints).toEqual([
            "/v1/charges",
            "/v1/charges",
            "/v1/charges/:id",
            "/v1/charges/:id",
            "/v1/invoices/:id/finalize",
            "/v1/customers/:id/sources",
            "/v1/customers/:id/sources/:id",
            "/v1/subscriptions/:id",
        ]);

        const verbs = Object.fromEntries(
            result.callSites.map((c) => [c.endpoint + ":" + c.method, c.httpMethod]),
        );
        expect(verbs["/v1/charges:example.charges.list"]).toBe("GET");
        expect(verbs["/v1/charges:example.charges.create"]).toBe("POST");
        expect(verbs["/v1/charges/:id:example.charges.delete"]).toBe("DELETE");
        expect(
            verbs["/v1/customers/:id/sources/:id:example.customers.sources.delete"],
        ).toBe("DELETE");
        expect(
            verbs["/v1/subscriptions/:id:example.subscriptions.update"],
        ).toBe("PUT");
    });
});

describe("Agent.inferVendorConfig", () => {
    function createMockedAgent(content: string) {
        const agent = new Agent("test-key");
        const create = mock(async () => ({
            choices: [{ message: { content } }],
        }));
        const boundary = agent as unknown as {
            openai: { chat: { completions: { create: typeof create } } };
        };
        boundary.openai.chat.completions.create = create;
        return { agent, create };
    }

    test("parses and validates a model-generated config", async () => {
        const { agent, create } = createMockedAgent(
            JSON.stringify({
                name: "stripe",
                sdk: "stripe",
                clientNames: ["stripe"],
                basePath: "/v1",
                resources: {
                    invoices: {
                        overrides: {
                            finalizeInvoice: "/v1/invoices/:id/finalize",
                        },
                    },
                },
            }),
        );

        const config = await agent.inferVendorConfig(
            "Stripe API docs ...",
            { name: "stripe" },
        );

        expect(create).toHaveBeenCalledTimes(1);
        expect(config.basePath).toBe("/v1");
        expect(config.resources?.invoices?.overrides).toEqual({
            finalizeInvoice: "/v1/invoices/:id/finalize",
        });
    });

    test("throws when the model returns invalid JSON", async () => {
        const { agent } = createMockedAgent("not json");
        await expect(
            agent.inferVendorConfig("docs"),
        ).rejects.toThrow("valid JSON");
    });

    test("throws when the model returns an invalid config", async () => {
        const { agent } = createMockedAgent(
            JSON.stringify({ name: "x", sdk: "x", clientNames: [], basePath: "/v1" }),
        );
        await expect(agent.inferVendorConfig("docs")).rejects.toThrow(
            "clientNames",
        );
    });
});

describe("Agent.ensureVendorConfig (on-demand, per package)", () => {
    const postConfig = (): ReturnType<typeof vendorConfigFromOpenApi> =>
        vendorConfigFromOpenApi(
            {
                info: { title: "Acme Posts", version: "1.0" },
                servers: [{ url: "https://api.acmeposts.com/v2" }],
                paths: {
                    "/v2/posts": {
                        post: { operationId: "createPost" },
                    },
                },
            } satisfies OpenApiSpec,
            {
                name: "acme",
                sdk: "@acme/posts-sdk",
                clientNames: ["api"],
                basePath: "/v2",
            },
        );

    function createMockedAgent(content: string) {
        const agent = new Agent("test-key");
        const create = mock(async () => ({
            choices: [{ message: { content } }],
        }));
        const boundary = agent as unknown as {
            openai: { chat: { completions: { create: typeof create } } };
        };
        boundary.openai.chat.completions.create = create;
        return { agent, create };
    }

    test("returns a seeded config from the store without calling the model", async () => {
        const store = new InMemoryVendorStore();
        const config = postConfig();
        store.set(config);

        const { agent, create } = createMockedAgent("{}");
        const got = await agent.ensureVendorConfig("@acme/posts-sdk", null, {
            store,
        });

        expect(got).toEqual(config);
        expect(create).toHaveBeenCalledTimes(0);
    });

    test("derives from docs on a miss, caches, then serves from cache", async () => {
        const store = new InMemoryVendorStore();
        const { agent, create } = createMockedAgent(
            JSON.stringify({
                name: "acme",
                sdk: "@acme/posts-sdk",
                clientNames: ["api"],
                basePath: "/v2",
            }),
        );

        const first = await agent.ensureVendorConfig(
            "@acme/posts-sdk",
            "Acme Posts API docs: POST /v2/posts creates a post.",
            { store },
        );
        expect(first?.sdk).toBe("@acme/posts-sdk");
        expect(create).toHaveBeenCalledTimes(1);

        const second = await agent.ensureVendorConfig(
            "@acme/posts-sdk",
            null,
            { store },
        );
        expect(second).toEqual(first);
        expect(create).toHaveBeenCalledTimes(1);
    });

    test("returns null when there is no config and no docs", async () => {
        const { agent, create } = createMockedAgent("{}");
        const got = await agent.ensureVendorConfig("@unknown/pkg", null);
        expect(got).toBeNull();
        expect(create).toHaveBeenCalledTimes(0);
    });

    test("a docs-derived config resolves call sites for that package in the parser", async () => {
        const store = new InMemoryVendorStore();
        const { agent } = createMockedAgent(
            JSON.stringify({
                name: "acme",
                sdk: "@acme/posts-sdk",
                clientNames: ["api"],
                basePath: "/v2",
            }),
        );
        const config = await agent.ensureVendorConfig(
            "@acme/posts-sdk",
            "Acme Posts API docs.",
            { store },
        );

        const extractor = new TypeScriptExtractor({
            vendors: config ? [config] : [],
        });
        const result = await extractor.extractFromFile(
            "src/posts.ts",
            `import Acme from "@acme/posts-sdk";
const api = new Acme("sk");
await api.posts.create({ title: "hi" });`,
        );
        expect(result.callSites[0]!.endpoint).toBe("/v2/posts");
    });
});
