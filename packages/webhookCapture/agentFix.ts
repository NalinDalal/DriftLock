import type OpenAI from "openai";
import {
    createGitHubPublisher,
    resolveHybridContract,
    runDriftMigration,
    type AgentEvent,
    type CommandRunner,
    type DriftMigrationResult,
    type PullRequestPublisher,
} from "@driftlock/agent";
import type { VendorConfig } from "@driftlock/core";
import type { DriftAlert } from "./driftDetector";

export interface AgentFixInput {
    owner: string;
    repo: string;
    base: string;
    /** Local checkout the agent edits and verifies in. */
    repoPath: string;
    alert: DriftAlert;
    token: string;
    /** Vendor whose objects the handler reads. Optional: without it there is
     * no spec to check against and no receiver config, so the run degrades
     * to a draft PR for human review instead of being skipped. Supplied by
     * the caller, so this path stays vendor-neutral: Stripe is a config
     * entry, not a branch. */
    vendor?: VendorConfig;
    /** OpenAI-compatible client for the agent loop. */
    client: OpenAI;
    model?: string;
    /** Override for tests. Defaults to a GitHub publisher on `token`. */
    publisher?: PullRequestPublisher;
    /** Override for tests. Defaults to Docker isolation. */
    commandRunner?: CommandRunner;
    /** Progress observer, forwarded to the agent loop. */
    onEvent?: (event: AgentEvent) => void;
}

export type AgentFixResult = DriftMigrationResult;

/**
 * Inbound translator: webhook evidence → agent layer.
 *
 * Everything trigger-specific lives here: flat-schema keys become the
 * observed member lists, the endpoint id becomes the provider. The loop
 * itself is `runDriftMigration` in `@driftlock/agent`.
 */
export async function createAgentFixPR(input: AgentFixInput): Promise<AgentFixResult> {
    const { contract, note } = await resolveHybridContract({
        vendor: input.vendor,
        provider: input.alert.endpointId,
        origin: `webhook ${input.alert.eventType} observed payload`,
        currentMembers: Object.keys(input.alert.current),
        removed: input.alert.diff.removed,
    });
    if (input.onEvent) {
        // Logged by the caller's observer; kept out of the model transcript.
        console.log(`  [CONTRACT] ${note}`);
    }

    return runDriftMigration({
        repoPath: input.repoPath,
        drift: {
            provider: input.alert.endpointId,
            fromVersion: "previous baseline",
            toVersion: `observed ${input.alert.detectedAt.toISOString()}`,
            removed: input.alert.diff.removed,
            added: input.alert.diff.added,
            typeChanged: input.alert.diff.typeChanged,
            direction: "inbound",
        },
        contract,
        ...(input.vendor ? { vendor: input.vendor } : {}),
        publisher: input.publisher ?? createGitHubPublisher(input.token),
        target: { owner: input.owner, repo: input.repo, base: input.base },
        client: input.client,
        ...(input.model ? { model: input.model } : {}),
        ...(input.commandRunner ? { commandRunner: input.commandRunner } : {}),
        ...(input.onEvent ? { onEvent: input.onEvent } : {}),
    });
}
