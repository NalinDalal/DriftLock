import { describe, expect, test } from "bun:test";
import { aiConfigFromEnv } from "@driftlock/cli/aiEnv";

describe("aiConfigFromEnv", () => {
    test("undefined when no provider is set", () => {
        expect(aiConfigFromEnv({})).toBeUndefined();
        expect(aiConfigFromEnv({ AI_PROVIDER: "watson" })).toBeUndefined();
    });

    test("openai resolves key and optional model", () => {
        expect(
            aiConfigFromEnv({ AI_PROVIDER: "openai", AI_API_KEY: "sk-x" }),
        ).toEqual({ provider: "openai", apiKey: "sk-x", accountId: undefined, model: undefined });
        expect(
            aiConfigFromEnv({ AI_PROVIDER: "openai", AI_API_KEY: "sk-x", AI_MODEL: "gpt-4o-mini" }),
        ).toMatchObject({ provider: "openai", model: "gpt-4o-mini" });
    });

    test("undefined when the key is missing", () => {
        expect(aiConfigFromEnv({ AI_PROVIDER: "openai", AI_API_KEY: "" })).toBeUndefined();
    });

    test("gemini uses its own key/model vars", () => {
        expect(
            aiConfigFromEnv({ AI_PROVIDER: "gemini", GEMINI_API_KEY: "g-x", GEMINI_MODEL: "gemini-2.5-flash" }),
        ).toMatchObject({ provider: "gemini", apiKey: "g-x", model: "gemini-2.5-flash" });
    });

    test("cloudflare requires an account id", () => {
        expect(
            aiConfigFromEnv({ AI_PROVIDER: "cloudflare", CLOUDFLARE_API_TOKEN: "t" }),
        ).toBeUndefined();
        expect(
            aiConfigFromEnv({
                AI_PROVIDER: "cloudflare",
                CLOUDFLARE_API_TOKEN: "t",
                CLOUDFLARE_ACCOUNT_ID: "a",
            }),
        ).toMatchObject({ provider: "cloudflare", apiKey: "t", accountId: "a" });
    });
});
