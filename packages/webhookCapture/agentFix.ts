import type OpenAI from "openai";
import {
    changePacketFromDrift,
    contractFromWebhookAlert,
    createGitHubPublisher,
    createSandboxCommandRunner,
    runMigrationAgent,
    type CommandRunner,
    type PullRequestPublisher,
    type RunResult,
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
    /** Vendor whose objects the handler reads. Supplied by the caller, so this
     * path stays vendor-neutral: Stripe is a config entry, not a branch. */
    vendor: VendorConfig;
    /** OpenAI-compatible client for the agent loop. */
    client: OpenAI;
    model?: string;
    /** Override for tests. Defaults to a GitHub publisher on `token`. */
    publisher?: PullRequestPublisher;
    /** Override for tests. Defaults to Docker isolation. */
    commandRunner?: CommandRunner;
}

export interface AgentFixResult {
    status: "opened" | "already_open" | "merged" | "needs_review" | "no_action";
    url?: string;
    number?: number;
    branch?: string;
    filesChanged: string[];
    outcome: RunResult["outcome"];
}

/**
 * The webhook drift path through the migration agent, replacing the bespoke
 * regex fix-up with the agent's locate/edit/verify loop and publish gate.
 *
 * Captured evidence becomes both grounding artifacts: the schema diff turns
 * into a `ChangePacket` (what changed, in the vendor's own words on the
 * wire) and the baseline/current shapes turn into a sampled `VendorContract`
 * (what exists now, and what was removed). The agent edits the checkout,
 * must pass a verification command, must clear the contract gate, and only
 * then publishes — a full PR when the contract gate ran, a draft otherwise.
 */
export async function createAgentFixPR(input: AgentFixInput): Promise<AgentFixResult> {
    const packet = changePacketFromDrift({
        provider: input.alert.endpointId,
        fromVersion: "previous baseline",
        toVersion: `observed ${input.alert.detectedAt.toISOString()}`,
        removed: input.alert.diff.removed,
        added: input.alert.diff.added,
        typeChanged: input.alert.diff.typeChanged,
    });
    const contract = contractFromWebhookAlert({
        provider: input.alert.endpointId,
        eventType: input.alert.eventType,
        previous: input.alert.previous,
        current: input.alert.current,
    });

    const result = await runMigrationAgent({
        root: input.repoPath,
        packet,
        contract,
        vendor: input.vendor,
        // Production path edits a real customer checkout: verification must run
        // in Docker isolation, never on the DriftLock host.
        commandRunner: input.commandRunner ?? createSandboxCommandRunner(),
        publisher: input.publisher ?? createGitHubPublisher(input.token),
        target: { owner: input.owner, repo: input.repo, base: input.base },
        client: input.client,
        model: input.model,
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
