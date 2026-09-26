import OpenAI from "openai";
import { STRIPE_VENDOR, TWILIO_VENDOR, type VendorConfig } from "@driftlock/core";
import type { DriftSeverity } from "./schemaDiff";

export interface AgentAIConfig {
    provider: string;
    apiKey: string;
    accountId?: string;
    model?: string;
}

export interface AgentClient {
    client: OpenAI;
    model?: string;
}

const OPENAI_BASE_URL = "https://api.openai.com/v1";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
const cloudflareBaseURL = (accountId: string): string =>
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`;

/**
 * Maps an AI provider config to an OpenAI-compatible model client for the
 * migration agent. Returns null when the provider cannot serve the agent loop:
 * anthropic exposes no OpenAI-compatible chat-completions endpoint, and
 * anything without credentials cannot authenticate.
 */
export function buildAgentClient(config: AgentAIConfig): AgentClient | null {
    if (!config.apiKey) return null;
    switch (config.provider) {
        case "openai":
            return {
                client: new OpenAI({ apiKey: config.apiKey }),
                model: config.model,
            };
        case "gemini":
            return {
                client: new OpenAI({
                    apiKey: config.apiKey,
                    baseURL: GEMINI_BASE_URL,
                }),
                model: config.model,
            };
        case "cloudflare": {
            if (!config.accountId) return null;
            return {
                client: new OpenAI({
                    apiKey: config.apiKey,
                    baseURL: cloudflareBaseURL(config.accountId),
                }),
                model: config.model,
            };
        }
        default:
            return null;
    }
}

const KNOWN_VENDORS: Record<string, VendorConfig> = {
    stripe: STRIPE_VENDOR,
    twilio: TWILIO_VENDOR,
};

/** Webhook endpoint id → vendor config. Unknown endpoints stay unknown. */
export function vendorForEndpoint(endpointId: string): VendorConfig | undefined {
    return KNOWN_VENDORS[endpointId.trim().toLowerCase()];
}

/**
 * The single seam for the live path: both a model client and a vendor config
 * must resolve, otherwise the caller falls back to the deterministic fixer.
 */
export function resolveAgentFixDeps(
    ai: AgentAIConfig | undefined,
    endpointId: string,
): (AgentClient & { vendor: VendorConfig }) | null {
    if (!ai) return null;
    const built = buildAgentClient(ai);
    const vendor = vendorForEndpoint(endpointId);
    if (!built || !vendor) return null;
    return { ...built, vendor };
}

export type FixRoute = "agent" | "deterministic" | "none";

/**
 * Cheapest sufficient path per severity: breaking drift gets the agent when
 * its deps resolve (deterministic fallback otherwise), warnings take the
 * deterministic fixer without spending a model loop, and pure additions open
 * nothing — no reader can break on a field that did not exist before.
 */
export function routeBySeverity(
    severity: DriftSeverity,
    agentDepsResolve: boolean,
): FixRoute {
    if (severity === "info") return "none";
    if (severity === "breaking" && agentDepsResolve) return "agent";
    return "deterministic";
}
