import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type OpenAI from "openai";
import { STRIPE_VENDOR } from "@driftlock/core";
import { createAgentFixPR } from "../agentFix";
import type { DriftAlert } from "../driftDetector";
import type { PullRequestPublisher } from "@driftlock/agent";

let root: string;

const HANDLER = `function handle(event) {
  const paymentIntent = event.data.object;
  return { source: paymentIntent.source };
}
`;

function alert(): DriftAlert {
    return {
        endpointId: "stripe",
        eventType: "payment_intent.succeeded",
        diff: {
            added: ["data.object.payment_method"],
            removed: ["data.object.source"],
            typeChanged: [],
        },
        previous: {
            "data.object.id": "string",
            "data.object.amount": "number",
            "data.object.source": "string",
        },
        current: {
            "data.object.id": "string",
            "data.object.amount": "number",
            "data.object.payment_method": "string",
        },
        detectedAt: new Date("2026-09-01T00:00:00.000Z"),
        confidence: 75,
    };
}

function toolCall(name: string, args: Record<string, unknown>, id: string) {
    return {
        choices: [
            {
                message: {
                    content: null,
                    tool_calls: [{ id, function: { name, arguments: JSON.stringify(args) } }],
                },
            },
        ],
    };
}

function scriptedClient(script: unknown[]) {
    let index = 0;
    return {
        chat: {
            completions: {
                create: async () => {
                    const next = script[Math.min(index, script.length - 1)];
                    index += 1;
                    return next as never;
                },
            },
        },
    } as unknown as OpenAI;
}

function recordingPublisher() {
    const seen: Array<Record<string, unknown>> = [];
    const publisher: PullRequestPublisher = {
        publish: async (input) => {
            seen.push(input as unknown as Record<string, unknown>);
            return {
                status: "opened" as const,
                url: "https://github.com/acme/widgets/pull/7",
                number: 7,
                branch: input.branch,
            };
        },
    };
    return { publisher, seen };
}

const prArgs = {
    title: "Migrate payment_intent handler",
    body: "source is gone",
    branch: "driftlock/stripe-payment-method",
};

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "driftlock-agentfix-"));
    await writeFile(
        join(root, "package.json"),
        JSON.stringify({ name: "f", scripts: { build: 'node -e "process.exit(0)"' } }),
    );
    await writeFile(join(root, "webhook.js"), HANDLER);
    const init = Bun.spawn(["git", "init"], { cwd: root, stdout: "pipe" });
    await init.exited;
    const add = Bun.spawn(["git", "add", "-A"], { cwd: root, stdout: "pipe" });
    await add.exited;
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("createAgentFixPR runs a webhook drift through the migration agent", () => {
    test("migrates, verifies, clears the gate, and opens a mergeable PR", async () => {
        const { publisher, seen } = recordingPublisher();
        const result = await createAgentFixPR({
            owner: "acme",
            repo: "widgets",
            base: "main",
            repoPath: root,
            alert: alert(),
            token: "test-token",
            vendor: STRIPE_VENDOR,
            publisher,
            client: scriptedClient([
                toolCall(
                    "replaceInFile",
                    {
                        path: "webhook.js",
                        oldText: "return { source: paymentIntent.source };",
                        newText:
                            "return { payment_method: paymentIntent.payment_method };",
                    },
                    "c1",
                ),
                toolCall("runCommand", { command: "npm run build" }, "c2"),
                toolCall("createPullRequest", prArgs, "c3"),
            ]),
        });

        expect(result.outcome).toBe("auto_pr");
        expect(result.status).toBe("opened");
        expect(result.filesChanged).toEqual(["webhook.js"]);
        expect(result.branch).toBe("driftlock/stripe-payment-method");
        // A contract was built from the captured shapes, so the gate ran and
        // the PR is mergeable rather than a draft.
        expect(seen).toHaveLength(1);
        expect(seen[0].draft).toBe(false);

        const updated = await Bun.file(join(root, "webhook.js")).text();
        expect(updated).toContain("paymentIntent.payment_method");
        expect(updated).not.toContain("paymentIntent.source");
    });

    test("reports needs_review when the agent leaves a removed field behind", async () => {
        const { publisher, seen } = recordingPublisher();
        const result = await createAgentFixPR({
            owner: "acme",
            repo: "widgets",
            base: "main",
            repoPath: root,
            alert: alert(),
            token: "test-token",
            vendor: STRIPE_VENDOR,
            publisher,
            client: scriptedClient([
                toolCall(
                    "replaceInFile",
                    {
                        path: "webhook.js",
                        oldText: "return { source: paymentIntent.source };",
                        newText: "return { source: paymentIntent.source, extra: 1 };",
                    },
                    "c1",
                ),
                toolCall("runCommand", { command: "npm run build" }, "c2"),
                toolCall("createPullRequest", prArgs, "c3"),
            ]),
        });

        // The stale `source` read trips the contract gate, so nothing is
        // published and the caller learns the run needs a human.
        expect(seen).toHaveLength(0);
        expect(result.filesChanged).toEqual(["webhook.js"]);
        expect(result.status).toBe("needs_review");
        expect(result.outcome).toBe("review_pr");
    });
});
