import { describe, expect, test } from "bun:test";
import { STRIPE_VENDOR, TWILIO_VENDOR } from "@driftlock/core";
import {
    buildAgentClient,
    resolveAgentFixDeps,
    routeBySeverity,
    vendorForEndpoint,
} from "../agentRoute";

describe("buildAgentClient maps AI providers to OpenAI-compatible clients", () => {
    test("should build a default-endpoint client for openai", () => {
        const built = buildAgentClient({ provider: "openai", apiKey: "sk-test" });
        expect(built).not.toBeNull();
        expect(built?.client.baseURL).toBe("https://api.openai.com/v1");
        expect(built?.client.apiKey).toBe("sk-test");
    });

    test("should target the account Workers AI endpoint for cloudflare", () => {
        const built = buildAgentClient({
            provider: "cloudflare",
            apiKey: "cf-token",
            accountId: "acct-123",
            model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        });
        expect(built?.client.baseURL).toBe(
            "https://api.cloudflare.com/client/v4/accounts/acct-123/ai/v1",
        );
        expect(built?.model).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
    });

    test("should target the OpenAI-compatible endpoint for gemini", () => {
        const built = buildAgentClient({ provider: "gemini", apiKey: "g-key" });
        expect(built?.client.baseURL).toContain("generativelanguage.googleapis.com");
    });

    test("should return null for anthropic with no compat endpoint", () => {
        expect(buildAgentClient({ provider: "anthropic", apiKey: "sk-ant" })).toBeNull();
    });

    test("should return null when credentials are missing", () => {
        expect(buildAgentClient({ provider: "openai", apiKey: "" })).toBeNull();
        expect(
            buildAgentClient({ provider: "cloudflare", apiKey: "cf-token" }),
        ).toBeNull();
        expect(buildAgentClient({ provider: "unknown", apiKey: "x" })).toBeNull();
    });
});

describe("vendorForEndpoint resolves webhook endpoints to vendor configs", () => {
    test("should resolve seeded vendors case-insensitively", () => {
        expect(vendorForEndpoint("stripe")).toBe(STRIPE_VENDOR);
        expect(vendorForEndpoint("Stripe")).toBe(STRIPE_VENDOR);
        expect(vendorForEndpoint("twilio")).toBe(TWILIO_VENDOR);
    });

    test("should return undefined for unknown endpoints", () => {
        expect(vendorForEndpoint("acme")).toBeUndefined();
    });
});

describe("resolveAgentFixDeps gates the agent path on client and vendor", () => {
    test("should return deps when both resolve", () => {
        const deps = resolveAgentFixDeps(
            { provider: "openai", apiKey: "sk-test" },
            "stripe",
        );
        expect(deps?.vendor).toBe(STRIPE_VENDOR);
        expect(deps?.client.baseURL).toBe("https://api.openai.com/v1");
    });

    test("should return null when either side is missing", () => {
        expect(
            resolveAgentFixDeps({ provider: "openai", apiKey: "sk-test" }, "acme"),
        ).toBeNull();
        expect(
            resolveAgentFixDeps({ provider: "anthropic", apiKey: "sk-ant" }, "stripe"),
        ).toBeNull();
        expect(resolveAgentFixDeps(undefined, "stripe")).toBeNull();
    });
});

describe("routeBySeverity sends each drift class to its cheapest sufficient path", () => {
    test("should use the agent for breaking drift when deps resolve", () => {
        expect(routeBySeverity("breaking", true)).toBe("agent");
    });

    test("should fall back to deterministic fixes for breaking drift without deps", () => {
        expect(routeBySeverity("breaking", false)).toBe("deterministic");
    });

    test("should use deterministic fixes for warnings even with deps", () => {
        expect(routeBySeverity("warning", true)).toBe("deterministic");
        expect(routeBySeverity("warning", false)).toBe("deterministic");
    });

    test("should open nothing for info-only drift", () => {
        expect(routeBySeverity("info", true)).toBe("none");
        expect(routeBySeverity("info", false)).toBe("none");
    });
});
