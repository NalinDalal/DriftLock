import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type OpenAI from "openai";
import { P5_VENDOR, STRIPE_VENDOR, TWILIO_VENDOR } from "@driftlock/core";
import {
    clearSpecCache,
    vendorForPackage,
    type CommandRunner,
    type PullRequestPublisher,
} from "@driftlock/agent";
import { createOutboundAgentFixPR } from "@driftlock/webhookCapture";

const realFetch = globalThis.fetch;

function rejectFetch(): void {
    globalThis.fetch = (() => Promise.reject(new Error("no network in tests"))) as unknown as typeof fetch;
}

function fakeOkRunner(): CommandRunner {
    return { run: async () => ({ ok: true, output: "fake pass" }) };
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
                url: "https://github.com/acme/widgets/pull/8",
                number: 8,
                branch: input.branch,
            };
        },
    };
    return { publisher, seen };
}

const SOURCE = `const stripe = require("stripe")(process.env.STRIPE_KEY);
async function charge(customer) {
  return stripe.charges.create({ amount: 100, source: customer.card });
}
`;

const prArgs = {
    title: "Migrate charges.create off source",
    body: "source is gone",
    branch: "driftlock/charges-source",
};

let root: string;

beforeEach(async () => {
    rejectFetch();
    clearSpecCache();
    root = await mkdtemp(join(tmpdir(), "driftlock-outbound-"));
    await writeFile(
        join(root, "package.json"),
        JSON.stringify({ name: "f", scripts: { build: 'node -e "process.exit(0)"' } }),
    );
    await writeFile(join(root, "payments.js"), SOURCE);
    const init = Bun.spawn(["git", "init"], { cwd: root, stdout: "pipe" });
    await init.exited;
    const add = Bun.spawn(["git", "add", "-A"], { cwd: root, stdout: "pipe" });
    await add.exited;
});

afterEach(async () => {
    globalThis.fetch = realFetch;
    await rm(root, { recursive: true, force: true });
});

function drift(provider = "stripe") {
    return {
        provider,
        method: "stripe.charges.create",
        fromVersion: "captured baseline",
        toVersion: "observed now",
        removed: ["source"],
        added: ["payment_method"],
        typeChanged: [],
        currentMembers: ["amount", "payment_method"],
    };
}

function editScript() {
    return [
        toolCall(
            "replaceInFile",
            {
                path: "payments.js",
                oldText: "return stripe.charges.create({ amount: 100, source: customer.card });",
                newText:
                    "return stripe.charges.create({ amount: 100, payment_method: customer.card });",
            },
            "c1",
        ),
        toolCall("runCommand", { command: "npm run build" }, "c2"),
        toolCall("createPullRequest", prArgs, "c3"),
    ];
}

describe("vendorForPackage", () => {
    test("resolves known SDK packages case-insensitively", () => {
        expect(vendorForPackage("stripe")).toEqual(STRIPE_VENDOR);
        expect(vendorForPackage(" Stripe ")).toEqual(STRIPE_VENDOR);
        expect(vendorForPackage("twilio")).toEqual(TWILIO_VENDOR);
        expect(vendorForPackage("p5")).toEqual(P5_VENDOR);
    });

    test("returns undefined for unknown packages", () => {
        expect(vendorForPackage("acme-sdk")).toBeUndefined();
    });
});

describe("createOutboundAgentFixPR", () => {
    test("migrates, verifies, clears the gate, and opens a mergeable PR", async () => {
        const { publisher, seen } = recordingPublisher();
        const result = await createOutboundAgentFixPR({
            owner: "acme",
            repo: "widgets",
            base: "main",
            repoPath: root,
            drift: drift(),
            token: "test-token",
            vendor: STRIPE_VENDOR,
            publisher,
            commandRunner: fakeOkRunner(),
            client: scriptedClient(editScript()),
        });

        expect(result.outcome).toBe("auto_pr");
        expect(result.status).toBe("opened");
        expect(result.filesChanged).toEqual(["payments.js"]);
        expect(seen).toHaveLength(1);
        expect(seen[0].draft).toBe(false);

        const updated = await Bun.file(join(root, "payments.js")).text();
        expect(updated).toContain("payment_method: customer.card");
        expect(updated).not.toContain("source: customer.card");
    });

    test("opens a draft when the vendor is unknown", async () => {
        const { publisher, seen } = recordingPublisher();
        const result = await createOutboundAgentFixPR({
            owner: "acme",
            repo: "widgets",
            base: "main",
            repoPath: root,
            drift: drift("acme-sdk"),
            token: "test-token",
            publisher,
            commandRunner: fakeOkRunner(),
            client: scriptedClient(editScript()),
        });

        expect(result.status).toBe("opened");
        expect(result.outcome).toBe("draft_pr");
        expect(seen).toHaveLength(1);
        expect(seen[0].draft).toBe(true);
    });
});
