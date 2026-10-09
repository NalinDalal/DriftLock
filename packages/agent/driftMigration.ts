import type OpenAI from "openai";
import type { VendorConfig } from "@driftlock/core";
import { createSandboxCommandRunner, type CommandRunner } from "./commandRunner";
import {
    runMigrationAgent,
    type AgentEvent,
    type RunResult,
} from "./migrationAgent";
import type { PullRequestPublisher, PullRequestTarget } from "./publisher";
import {
    changePacketFromDrift,
    type ObservedDrift,
    type VendorContract,
} from "./vendorContract";

export interface DriftMigrationInput {
    /** Local checkout the agent edits and verifies in. */
    repoPath: string;
    /** Observed drift in the vendor's own words on the wire. */
    drift: ObservedDrift;
    /** Hybrid contract: existence from the spec when fetchable, removal from
     * the observation. Always required; without a known vendor it is a
     * sampled contract and the run degrades to a draft. */
    contract: VendorContract;
    /** Vendor config when known. Without it there is no receiver config, so
     * the publish gate opens a draft for human review instead of a
     * mergeable PR. */
    vendor?: VendorConfig;
    publisher: PullRequestPublisher;
    target: PullRequestTarget;
    /** OpenAI-compatible client for the agent loop. */
    client: OpenAI;
    model?: string;
    /** Override for tests. Defaults to Docker isolation: production edits a
     * real customer checkout, so verification must never run on the host. */
    commandRunner?: CommandRunner;
    /** Progress observer, forwarded to the agent loop. */
    onEvent?: (event: AgentEvent) => void;
}

export interface DriftMigrationResult {
    status: "opened" | "already_open" | "merged" | "needs_review" | "no_action";
    url?: string;
    number?: number;
    branch?: string;
    filesChanged: string[];
    outcome: RunResult["outcome"];
}

/**
 * The single agent-layer entrypoint every drift trigger uses.
 *
 * Webhook alerts and pipeline drifts differ only in evidence mapping (flat
 * schemas vs captured shapes); the loop — packet → locate → read → edit →
 * verify → contract gate → publish — is identical. Triggers build an
 * `ObservedDrift` and a contract and call this; nothing outside this package
 * invokes `runMigrationAgent` for drift work.
 */
export async function runDriftMigration(
    input: DriftMigrationInput,
): Promise<DriftMigrationResult> {
    const packet = changePacketFromDrift(input.drift);

    const result = await runMigrationAgent({
        root: input.repoPath,
        packet,
        contract: input.contract,
        ...(input.vendor ? { vendor: input.vendor } : {}),
        commandRunner: input.commandRunner ?? createSandboxCommandRunner(),
        publisher: input.publisher,
        target: input.target,
        client: input.client,
        ...(input.model ? { model: input.model } : {}),
        ...(input.onEvent ? { onEvent: input.onEvent } : {}),
    });

    const pr = result.state.pullRequest;
    if (pr) {
        return {
            status: pr.status,
            url: pr.url,
            number: pr.number,
            branch: pr.branch,
            filesChanged: result.filesChanged,
            outcome: result.outcome,
        };
    }
    return {
        status: result.filesChanged.length > 0 ? "needs_review" : "no_action",
        branch: undefined,
        filesChanged: result.filesChanged,
        outcome: result.outcome,
    };
}
