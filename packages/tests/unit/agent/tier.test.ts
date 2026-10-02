import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    buildSystemPrompt,
    isToolAllowed,
    runMigrationAgent,
    TIER_TOOLS,
    toolsForTier,
    validateToolArgs,
    type ChangePacket,
} from "@driftlock/agent";

let root: string;

type FakeCall = {
    choices: Array<{
        message: {
            content?: string | null;
            tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
        };
    }>;
};

let apiCalls: FakeCall[];

function toolCall(name: string, args: Record<string, unknown>, id = "call_1"): FakeCall {
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
                    if (!next) throw new Error("fakeClient called with no scripted responses");
                    return next;
                },
            },
        },
    } as unknown as Parameters<typeof runMigrationAgent>[0]["client"];
}

const packet: ChangePacket = {
    provider: "p5",
    fromVersion: "1.11",
    toVersion: "2.3",
    summary: "test packet",
    migrationDocs: [],
};

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "driftlock-tier-"));
    apiCalls = [];
    await writeFile(
        join(root, "package.json"),
        JSON.stringify({ name: "fixture", scripts: { build: "node -e \"process.exit(0)\"" } }),
    );
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/client.ts"), "createCanvas(1);\n");
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("tier tool gating", () => {
    test("free hides createPullRequest, pro exposes all ten tools", () => {
        const free = toolsForTier("free").map((t) => t.name);
        expect(free).not.toContain("createPullRequest");
        expect(free).toContain("readContract");
        expect(free).toHaveLength(9);
        expect(toolsForTier("pro")).toHaveLength(10);
    });

    test("unknown tiers fail closed to free", () => {
        expect(isToolAllowed("createPullRequest", "enterprise" as never)).toBe(false);
        expect(isToolAllowed("searchCode", "enterprise" as never)).toBe(true);
        expect(toolsForTier("enterprise" as never).map((t) => t.name)).not.toContain(
            "createPullRequest",
        );
    });

    test("tier tool lists are frozen", () => {
        expect(Object.isFrozen(TIER_TOOLS.free)).toBe(true);
        expect(Object.isFrozen(TIER_TOOLS.pro)).toBe(true);
    });

    test("prompts name the plan and its publish rule", () => {
        expect(buildSystemPrompt("free")).toContain("Do not call createPullRequest");
        expect(buildSystemPrompt("pro")).toContain("pull request");
        expect(buildSystemPrompt()).toContain("pro");
    });
});

describe("validateToolArgs", () => {
    test("missing required args name the field", () => {
        expect(validateToolArgs("readFile", {} as never)).toContain('"path"');
        expect(validateToolArgs("searchCode", { query: 42 } as never)).toContain("to be string");
    });

    test("valid args pass, including empty newText for deletes", () => {
        expect(validateToolArgs("readFile", { path: "src/a.ts" })).toBeNull();
        expect(
            validateToolArgs("replaceInFile", { path: "src/a.ts", oldText: "x", newText: "" }),
        ).toBeNull();
        expect(validateToolArgs("inspectRepo", {})).toBeNull();
    });
});

describe("free-tier enforcement in the loop", () => {
    test("createPullRequest is refused with a retryable message, no PR opens", async () => {
        apiCalls = [
            toolCall(
                "createPullRequest",
                { title: "x", body: "y", branch: "driftlock/x" },
                "c1",
            ),
        ];
        const result = await runMigrationAgent({
            root,
            packet,
            tier: "free",
            client: fakeClient(),
            commandRunner: { run: async () => ({ ok: true, output: "pass" }) },
        });
        const entry = result.state.transcript.find(
            (e) => e.role === "tool" && e.toolCallId === "c1",
        );
        expect(entry?.content).toContain("disabled on the free plan");
        expect(result.state.pullRequest).toBeUndefined();
    });

    test("malformed args fail with the field named, before the executor", async () => {
        apiCalls = [toolCall("readFile", {}, "c1")];
        const result = await runMigrationAgent({
            root,
            packet,
            client: fakeClient(),
            commandRunner: { run: async () => ({ ok: true, output: "pass" }) },
        });
        const entry = result.state.transcript.find(
            (e) => e.role === "tool" && e.toolCallId === "c1",
        );
        expect(entry?.content).toContain('"path"');
    });
});
