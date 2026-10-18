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

/** Outbound drift in agent terms: what the vendor stopped/started sending. */
export interface OutboundDrift {
    /** SDK package the call site imports, e.g. "stripe". */
    provider: string;
    /** Call-site method, e.g. "stripe.charges.create". */
    method: string;
    fromVersion: string;
    toVersion: string;
    removed: string[];
    added: string[];
    typeChanged: Array<{ field: string; from: string; to: string }>;
    /** Keys of the currently captured request + response shapes. */
    currentMembers: string[];
}

export interface OutboundAgentFixInput {
    owner: string;
    repo: string;
    base: string;
    /** Local checkout the agent edits and verifies in. */
    repoPath: string;
    drift: OutboundDrift;
    token: string;
    /** Optional for the same reason as the inbound path: without it the run
     * degrades to a draft instead of being skipped. */
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

export type OutboundAgentFixResult = DriftMigrationResult;

/**
 * Outbound translator: pipeline evidence → agent layer.
 *
 * Same loop as the inbound path with different evidence: the pipeline's
 * request/response diff becomes the observed drift, the currently captured
 * shapes become the sampled half of the hybrid contract. The loop itself is
 * `runDriftMigration` in `@driftlock/agent`.
 */
export async function createOutboundAgentFixPR(
    input: OutboundAgentFixInput,
): Promise<OutboundAgentFixResult> {
    const { contract, note } = await resolveHybridContract({
        vendor: input.vendor,
        provider: input.drift.provider,
        origin: `outbound ${input.drift.method} captured shapes`,
        currentMembers: input.drift.currentMembers,
        removed: input.drift.removed,
    });
    if (input.onEvent) {
        console.log(`  [CONTRACT] ${note}`);
    }

    return runDriftMigration({
        repoPath: input.repoPath,
        drift: {
            provider: input.drift.provider,
            fromVersion: input.drift.fromVersion,
            toVersion: input.drift.toVersion,
            removed: input.drift.removed,
            added: input.drift.added,
            typeChanged: input.drift.typeChanged,
            direction: "outbound",
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
