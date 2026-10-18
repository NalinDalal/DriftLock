import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDriftMigration } from "@driftlock/agent";
import type { ObservedDrift, VendorContract } from "@driftlock/agent";
import type { PublishInput } from "@driftlock/agent";

let root: string;
let published: PublishInput[];

function finalTextClient(text: string) {
    return {
        chat: {
            completions: {
                create: async () => ({
                    choices: [{ message: { content: text } }],
                }),
            },
        },
    } as unknown as Parameters<typeof runDriftMigration>[0]["client"];
}

function stubRunner() {
    return { run: async () => ({ ok: true, output: "stub pass" }) };
}

function stubPublisher() {
    published = [];
    return {
        publish: async (input: PublishInput) => {
            published.push(input);
            return {
                status: "opened" as const,
                url: "https://github.com/o/r/pull/9",
                number: 9,
                branch: input.branch,
            };
        },
    };
}

const contract: VendorContract = {
    provider: "stripe",
    version: "2022-11-15",
    source: "recorded",
    authority: "sampled",
    origin: "test",
    capturedAt: new Date(0).toISOString(),
    members: ["data.object.payment_method"],
    removed: ["data.object.source"],
};

function drift(overrides: Partial<ObservedDrift> = {}): ObservedDrift {
    return {
        provider: "stripe",
        fromVersion: "2022-08-01",
        toVersion: "2022-11-15",
        removed: ["data.object.source"],
        added: ["data.object.payment_method"],
        typeChanged: [],
        direction: "inbound",
        ...overrides,
    };
}

const READER = `const p = paymentIntent.source;
console.log(paymentIntent.amount);
`;
const REQUEST_ARG = `await stripe.paymentIntents.create({
  amount,
  source: "tok_visa",
});
`;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "drift-fallback-"));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("unverified draft fallback", () => {
    test("certain inbound rename opens a draft, renames readers, spares request args", async () => {
        await writeFile(join(root, "handler.js"), READER);
        await writeFile(join(root, "charge.js"), REQUEST_ARG);
        const publisher = stubPublisher();

        const result = await runDriftMigration({
            repoPath: root,
            drift: drift(),
            contract,
            publisher,
            target: { owner: "o", repo: "r", base: "main" },
            client: finalTextClient("Nothing to change here."),
            commandRunner: stubRunner(),
        });

        expect(result.outcome).toBe("draft_pr");
        expect(result.status).toBe("opened");
        expect(result.draft).toBe(true);
        expect(result.url).toBe("https://github.com/o/r/pull/9");
        expect(result.filesChanged).toEqual(["handler.js"]);
        expect(published).toHaveLength(1);
        expect(published[0]!.draft).toBe(true);
        expect(published[0]!.branch.startsWith("driftlock/unverified-")).toBe(true);
        expect(published[0]!.body).toContain("UNVERIFIED DRAFT");
        expect(published[0]!.body).toContain("cannot merge until you mark it ready");

        // Reader renamed, request argument untouched.
        expect(await readFile(join(root, "handler.js"), "utf8")).toContain(
            "paymentIntent.payment_method",
        );
        expect(await readFile(join(root, "charge.js"), "utf8")).toContain(
            'source: "tok_visa"',
        );
    });

    test("outbound drift never falls back", async () => {
        await writeFile(join(root, "handler.js"), READER);
        const publisher = stubPublisher();

        const result = await runDriftMigration({
            repoPath: root,
            drift: drift({ direction: "outbound" }),
            contract,
            publisher,
            target: { owner: "o", repo: "r", base: "main" },
            client: finalTextClient("Nothing to change here."),
            commandRunner: stubRunner(),
        });

        expect(result.outcome).toBe("no_action");
        expect(published).toHaveLength(0);
        expect(await readFile(join(root, "handler.js"), "utf8")).toContain(
            "paymentIntent.source",
        );
    });

    test("multi-field drift stays silent", async () => {
        await writeFile(join(root, "handler.js"), READER);
        const publisher = stubPublisher();

        const result = await runDriftMigration({
            repoPath: root,
            drift: drift({
                removed: ["data.object.source", "data.object.old"],
                added: ["data.object.payment_method"],
            }),
            contract,
            publisher,
            target: { owner: "o", repo: "r", base: "main" },
            client: finalTextClient("Nothing to change here."),
            commandRunner: stubRunner(),
        });

        expect(result.outcome).toBe("no_action");
        expect(published).toHaveLength(0);
    });

    test("bare tokens without dotted reads stay silent", async () => {
        await writeFile(join(root, "charge.js"), REQUEST_ARG);
        const publisher = stubPublisher();

        const result = await runDriftMigration({
            repoPath: root,
            drift: drift(),
            contract,
            publisher,
            target: { owner: "o", repo: "r", base: "main" },
            client: finalTextClient("Nothing to change here."),
            commandRunner: stubRunner(),
        });

        expect(result.outcome).toBe("no_action");
        expect(published).toHaveLength(0);
        expect(await readFile(join(root, "charge.js"), "utf8")).toContain(
            'source: "tok_visa"',
        );
    });
});
