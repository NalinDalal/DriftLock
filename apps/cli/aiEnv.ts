import type { AIFixConfig, AIProvider } from "@driftlock/aiFix";

const AI_PROVIDERS: ReadonlySet<string> = new Set([
    "openai",
    "anthropic",
    "gemini",
    "cloudflare",
]);

/**
 * Resolve model-fix config from the environment (same convention as the
 * webhook service). Returns undefined when no provider is configured or
 * credentials are incomplete — callers then stay deterministic.
 */
export function aiConfigFromEnv(
    env: Record<string, string | undefined> = process.env,
): AIFixConfig | undefined {
    const provider = (env.AI_PROVIDER ?? "").trim().toLowerCase();
    if (!AI_PROVIDERS.has(provider)) {
        return undefined;
    }
    const typed = provider as AIProvider;
    const apiKeyEnv =
        typed === "cloudflare"
            ? "CLOUDFLARE_API_TOKEN"
            : typed === "gemini"
              ? "GEMINI_API_KEY"
              : "AI_API_KEY";
    const apiKey = (env[apiKeyEnv] ?? "").trim();
    const modelEnv =
        typed === "cloudflare"
            ? "CLOUDFLARE_AI_MODEL"
            : typed === "gemini"
              ? "GEMINI_MODEL"
              : "AI_MODEL";
    const model = (env[modelEnv] ?? "").trim() || undefined;
    const accountId =
        typed === "cloudflare" ? (env.CLOUDFLARE_ACCOUNT_ID ?? "").trim() : undefined;

    if (!apiKey || (typed === "cloudflare" && !accountId)) {
        return undefined;
    }
    // Custom endpoints only make sense for the OpenAI-compatible path
    // (local Ollama, gateways, proxies); other providers have fixed
    // endpoints. Mirrors apps/webhook/capture.ts.
    const baseUrl =
        typed === "openai"
            ? (env.AI_BASE_URL ?? "").trim() ||
              (env.OPENAI_BASE_URL ?? "").trim() ||
              undefined
            : undefined;
    return { provider: typed, apiKey, accountId, model, baseUrl };
}
