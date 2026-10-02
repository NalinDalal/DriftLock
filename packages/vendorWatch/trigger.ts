import type { VendorConfig } from "@driftlock/core";
import {
    changePacketFromDrift,
    createSandboxCommandRunner,
    runMigrationAgent,
    type AgentTier,
    type ModelProvider,
    type ObservedDrift,
    type RunResult,
} from "@driftlock/agent";
import type { VendorChange } from "./watcher";

export interface TriggerOptions {
    /** Working copy the agent edits. Clone before calling when remote. */
    root: string;
    /** Docs links to attach to the packet. */
    docs?: string[];
    /** Subscription tier. Free hides createPullRequest; defaults to pro. */
    tier?: AgentTier;
    /** Model the agent runs with. Defaults to the agent default. */
    model?: string;
    /** Model provider. Defaults to OpenAI wire protocol; "anthropic" uses tool_use blocks. */
    modelProvider?: ModelProvider;
    anthropicApiKey?: string;
    anthropicBaseURL?: string;
    /** API key when no `client` is supplied. */
    apiKey?: string;
    baseURL?: string;
    client?: Parameters<typeof runMigrationAgent>[0]["client"];
    publisher?: Parameters<typeof runMigrationAgent>[0]["publisher"];
    target?: Parameters<typeof runMigrationAgent>[0]["target"];
    commandRunner?: Parameters<typeof runMigrationAgent>[0]["commandRunner"];
    /**
     * Use Docker isolation for verification. Defaults to true; pass false
     * with `commandRunner` to substitute your own seam.
     */
    sandbox?: boolean;
}

/**
 * Turns a watched vendor change into the packet the migration agent consumes.
 *
 * The leaves matter, not the dotted paths: spec members arrive as full paths
 * (`payment_intents.payment_method`) while handler code reads leaves off a
 * receiver, and `changePacketFromDrift` already names leaves first with paths
 * as provenance.
 */
export function observedDriftFromChange(
    change: VendorChange,
    docs: string[] = [],
): ObservedDrift {
    return {
        provider: change.provider,
        fromVersion: change.fromVersion,
        toVersion: change.toVersion,
        removed: change.removed,
        added: change.added,
        typeChanged: [],
        docs,
    };
}

/**
 * Runs the migration agent against one working copy for one vendor change.
 *
 * This is the trigger half of the watch loop: the watcher proved the vendor
 * removed members, the packet names them, and the agent searches, edits,
 * verifies against the fresh contract, and opens the PR. A repository that
 * never reads the removed members ends as `no_action` — the trigger is
 * cheap to be wrong about, expensive to miss.
 */
export async function runVendorTriggeredMigration(
    vendor: VendorConfig,
    change: VendorChange,
    options: TriggerOptions,
): Promise<RunResult> {
    const packet = changePacketFromDrift(
        observedDriftFromChange(change, options.docs),
    );
    // Registry drift is advisory, never a trigger: the spec diff proved the
    // breakage, this tells the model whether the pin also lags the registry.
    const summary = change.registryDrift?.drift
        ? `${packet.summary} Registry signal: ${change.registryDrift.note}.`
        : packet.summary;
    return runMigrationAgent({
        root: options.root,
        ...(options.tier ? { tier: options.tier } : {}),
        packet: {
            provider: packet.provider,
            fromVersion: packet.fromVersion,
            toVersion: packet.toVersion,
            summary,
            migrationDocs: packet.migrationDocs,
        },
        contract: change.contract,
        vendor,
        ...(options.model ? { model: options.model } : {}),
        ...(options.modelProvider ? { provider: options.modelProvider } : {}),
        ...(options.anthropicApiKey ? { anthropicApiKey: options.anthropicApiKey } : {}),
        ...(options.anthropicBaseURL ? { anthropicBaseURL: options.anthropicBaseURL } : {}),
        ...(options.apiKey ? { apiKey: options.apiKey } : {}),
        ...(options.baseURL ? { baseURL: options.baseURL } : {}),
        ...(options.client ? { client: options.client } : {}),
        ...(options.publisher ? { publisher: options.publisher } : {}),
        ...(options.target ? { target: options.target } : {}),
        commandRunner:
            options.commandRunner ??
            (options.sandbox === false ? undefined : createSandboxCommandRunner()),
    });
}
