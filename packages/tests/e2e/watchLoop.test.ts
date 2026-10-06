/**
 * Staged production-loop proof: a canned vendor spec change (source removed,
 * payment_method added) drives the REAL runVendorTriggeredMigration with a
 * scripted model client and a stub publisher. No network, no keys, no git
 * remote. Asserts the loop ends in an honest rename PR, not a snapshot-only
 * or comment-out diff.
 *
 * Run: bun test e2e/watchLoop.test.ts
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { STRIPE_VENDOR } from "@driftlock/core";
import {
    runVendorTriggeredMigration,
    type VendorChange,
} from "@driftlock/vendorWatch";
import { runMigrationAgent } from "@driftlock/agent";
import type { PublishInput } from "@driftlock/agent";

let root: string;
let apiCalls: unknown[];

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

function fakeClient() {
    let index = 0;
    return {
        chat: {
            completions: {
                create: async () => {
                    const next = apiCalls[Math.min(index, apiCalls.length - 1)];
                    index += 1;
                    if (!next) throw new Error("fakeClient out of scripted responses");
                    return next;
                },
            },
        },
    } as unknown as Parameters<typeof runMigrationAgent>[0]["client"];
}

const change: VendorChange = {
    provider: "stripe",
    fromVersion: "2024-01-01",
    toVersion: "2024-02-01",
    removed: ["data.object.source"],
    added: ["data.object.payment_method"],
    contract: {
        provider: "stripe",
        version: "2024-02-01",
        source: "spec",
        authority: "authoritative",
        origin: "staged-fixture",
        capturedAt: new Date().toISOString(),
        members: ["data.object.id", "data.object.amount", "data.object.payment_method"],
        removed: ["data.object.source"],
    },
    note: "staged: source removed, payment_method added",
};

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "driftlock-watchloop-"));
    apiCalls = [];
    await writeFile(
        join(root, "package.json"),
        JSON.stringify({
            name: "pay",
            scripts: { build: 'node -e "process.exit(0)"' },
        }),
    );
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(
        join(root, "src/payment.js"),
        'export function handlePayment(obj) {\n  return { chargeFrom: obj.source, cents: obj.amount };\n}\n',
    );
    const init = Bun.spawn(["git", "init"], { cwd: root, stdout: "pipe" });
    await init.exited;
    const add = Bun.spawn(["git", "add", "-A"], { cwd: root, stdout: "pipe" });
    await add.exited;
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("staged watch loop", () => {
    test("spec change becomes an honest rename PR through the real migration path", async () => {
        apiCalls = [
            toolCall("searchCode", { query: "data.object.source" }, "c1"),
            toolCall("readFile", { path: "src/payment.js" }, "c2"),
            toolCall(
                "editFile",
                {
                    path: "src/payment.js",
                    patch: [
                        "--- a/src/payment.js",
                        "+++ b/src/payment.js",
                        "@@ -1,3 +1,3 @@",
                        " export function handlePayment(obj) {",
                        "-  return { chargeFrom: obj.source, cents: obj.amount };",
                        "+  return { chargeFrom: obj.payment_method, cents: obj.amount };",
                        " }",
                    ].join("\n"),
                },
                "c3",
            ),
            toolCall("runCommand", { command: "npm run build" }, "c4"),
            toolCall(
                "createPullRequest",
                {
                    title: "driftlock: rename source to payment_method (payment_intent.succeeded)",
                    body: "Stripe removed data.object.source; replaced with data.object.payment_method.",
                    branch: "driftlock/stripe-source-rename",
                },
                "c5",
            ),
        ];

        let published: PublishInput | null = null;
        const result = await runVendorTriggeredMigration(STRIPE_VENDOR, change, {
            root,
            tier: "pro",
            docs: ["https://docs.stripe.com/api"],
            client: fakeClient(),
            commandRunner: { run: async () => ({ ok: true, output: "fake pass" }) },
            sandbox: false,
            publisher: {
                publish: async (input: PublishInput) => {
                    published = input;
                    return { status: "opened", url: "https://pr/staged-1", number: 1, branch: input.branch };
                },
            },
            target: { owner: "acme", repo: "pay", base: "main" },
        });

        expect(published).not.toBeNull();
        // The fix is a rename in source, not a comment-out and not snapshots.
        expect(published!.files.map((f) => f.path)).toEqual(["src/payment.js"]);
        const content = published!.files[0].content;
        expect(content).toContain("obj.payment_method");
        expect(content).not.toContain("obj.source");
        expect(content).not.toMatch(/^\/\/ /m);
        // The body carries the verified file list regardless of model prose.
        expect(published!.body).toContain("### Files changed (verified)");
        expect(published!.body).toContain("- `src/payment.js`");
        expect(result.state.pullRequest?.url).toBe("https://pr/staged-1");
    });
});
