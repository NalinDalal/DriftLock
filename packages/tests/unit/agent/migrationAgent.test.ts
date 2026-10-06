import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    parseTextToolCall,
    runMigrationAgent,
    type AgentEvent,
    type ChangePacket,
    type CommandRunner,
} from "@driftlock/agent";

function fakeFailRunner(): CommandRunner {
    return { run: async () => ({ ok: false, output: "fake fail" }) };
}

type FakeCall = {
    choices: Array<{
        message: {
            content?: string | null;
            tool_calls?: Array<{
                id: string;
                function: { name: string; arguments: string };
            }>;
        };
    }>;
};

let root: string;
let apiCalls: FakeCall[];

function toolCall(name: string, args: Record<string, unknown>, id = "call_1") {
    return {
        choices: [
            {
                message: {
                    content: null,
                    tool_calls: [
                        { id, function: { name, arguments: JSON.stringify(args) } },
                    ],
                },
            },
        ],
    } satisfies FakeCall;
}

function finalText(text: string): FakeCall {
    return { choices: [{ message: { content: text } }] };
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

function fakeOkRunner(): CommandRunner {
    return { run: async () => ({ ok: true, output: "fake pass" }) };
}

const packet: ChangePacket = {
    provider: "p5",
    fromVersion: "1.11",
    toVersion: "2.3",
    summary: "createCanvas renamed to createSurface",
    migrationDocs: ["https://example.test/p5-2.3"],
};

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "driftlock-loop-"));
    apiCalls = [];
    await writeFile(
        join(root, "package.json"),
        JSON.stringify({
            name: "fixture",
            scripts: {
                build: "node -e \"process.exit(0)\"",
                typecheck: "node -e \"process.exit(0)\"",
            },
        }),
    );
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src/client.ts"), "createCanvas(1);\n");
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("runMigrationAgent", () => {
    test("walks inspect, search, read, edit, verify, then opens a PR", async () => {
        const init = Bun.spawn(["git", "init"], { cwd: root, stdout: "pipe" });
        await init.exited;
        const add = Bun.spawn(["git", "add", "-A"], { cwd: root, stdout: "pipe" });
        await add.exited;

        apiCalls = [
            toolCall("inspectRepo", {}, "c1"),
            toolCall("searchCode", { query: "createCanvas" }, "c2"),
            toolCall("readFile", { path: "src/client.ts" }, "c3"),
            toolCall(
                "editFile",
                {
                    path: "src/client.ts",
                    patch: [
                        "--- a/src/client.ts",
                        "+++ b/src/client.ts",
                        "@@ -1 +1 @@",
                        "-createCanvas(1);",
                        "+createSurface(1);",
                    ].join("\n"),
                },
                "c4",
            ),
            toolCall("runCommand", { command: "npm run build" }, "c5"),
            toolCall(
                "createPullRequest",
                { title: "Migrate to p5 2.3", body: "Renamed call", branch: "driftlock/p5-2.3" },
                "c6",
            ),
        ];

        const result = await runMigrationAgent({
            root,
            packet,
            client: fakeClient(),
            commandRunner: fakeOkRunner(),
        });

        // No contract gates this run, so the verified diff is a draft.
        expect(result.outcome).toBe("draft_pr");
        expect(result.filesChanged).toEqual(["src/client.ts"]);
        expect(result.state.commandsRun).toBe(1);
        expect(result.state.lastTestResult?.passed).toBe(true);
        expect(result.state.iteration).toBe(6);

        const updated = await Bun.file(join(root, "src/client.ts")).text();
        expect(updated).toContain("createSurface(1)");
    });

    test("reports draft_pr when no contract gates the run", async () => {
        const init = Bun.spawn(["git", "init"], { cwd: root, stdout: "pipe" });
        await init.exited;
        const add = Bun.spawn(["git", "add", "-A"], { cwd: root, stdout: "pipe" });
        await add.exited;

        apiCalls = [
            toolCall(
                "editFile",
                {
                    path: "src/client.ts",
                    patch: [
                        "--- a/src/client.ts",
                        "+++ b/src/client.ts",
                        "@@ -1 +1 @@",
                        "-createCanvas(1);",
                        "+createSurface(1);",
                    ].join("\n"),
                },
                "c1",
            ),
            toolCall("runCommand", { command: "npm run build" }, "c2"),
            toolCall(
                "createPullRequest",
                { title: "Migrate to p5 2.3", body: "Renamed call", branch: "driftlock/p5-2.3" },
                "c3",
            ),
        ];

        const result = await runMigrationAgent({
            root,
            packet,
            client: fakeClient(),
            commandRunner: fakeOkRunner(),
        });

        expect(result.outcome).toBe("draft_pr");
        expect(result.filesChanged).toEqual(["src/client.ts"]);
    });

    test("refuses host execution without a commandRunner", async () => {
        apiCalls = [toolCall("runCommand", { command: "npm run build" }, "c1")];

        const result = await runMigrationAgent({ root, packet, client: fakeClient() });

        const entry = result.state.transcript.find(
            (e) => e.role === "tool" && e.toolCallId === "c1",
        );
        expect(entry?.content).toContain("host execution is disabled");
        expect(result.state.lastTestResult?.passed).toBe(false);
        // Every runCommand attempt is refused, so no verification ever passes
        // and no PR can open.
        expect(result.state.pullRequest).toBeUndefined();
    });

    test("a passing verification does not survive a later edit", async () => {
        const init = Bun.spawn(["git", "init"], { cwd: root, stdout: "pipe" });
        await init.exited;
        const add = Bun.spawn(["git", "add", "-A"], { cwd: root, stdout: "pipe" });
        await add.exited;

        apiCalls = [
            toolCall("runCommand", { command: "npm run build" }, "c1"),
            toolCall(
                "editFile",
                {
                    path: "src/client.ts",
                    patch: [
                        "--- a/src/client.ts",
                        "+++ b/src/client.ts",
                        "@@ -1 +1 @@",
                        "-createCanvas(1);",
                        "+createSurface(1);",
                    ].join("\n"),
                },
                "c2",
            ),
            toolCall(
                "createPullRequest",
                { title: "Migrate to p5 2.3", body: "Renamed call", branch: "driftlock/p5-2.3" },
                "c3",
            ),
        ];

        const result = await runMigrationAgent({
            root,
            packet,
            client: fakeClient(),
            commandRunner: fakeOkRunner(),
        });

        // The build passed before the edit, but the edit wiped that result,
        // so the PR gate refuses until verification runs again.
        const pr = result.state.transcript.find(
            (entry) => entry.role === "tool" && entry.toolCallId === "c3",
        );
        expect(pr?.content).toContain("no passing verification command");
        expect(result.state.pullRequest).toBeUndefined();
    });

    test("sends assistant tool-call messages with string content, never null", async () => {
        const sent: Record<string, unknown>[][] = [];
        let index = 0;
        apiCalls = [
            toolCall("inspectRepo", {}, "c1"),
            toolCall("searchCode", { query: "createCanvas" }, "c2"),
            finalText("done"),
        ];

        const client = {
            chat: {
                completions: {
                    create: async (body: Record<string, unknown>) => {
                        sent.push(body.messages as Record<string, unknown>[]);
                        const next = apiCalls[Math.min(index, apiCalls.length - 1)];
                        index += 1;
                        return next as never;
                    },
                },
            },
        } as unknown as Parameters<typeof runMigrationAgent>[0]["client"];

        await runMigrationAgent({ root, packet, client });

        expect(sent.length).toBe(3);
        for (const messages of sent) {
            for (const message of messages) {
                expect(
                    message.content,
                    `role=${message.role} must carry a string content`,
                ).toBeTypeOf("string");
            }
        }
        const assistantWithToolCall = sent[1].find(
            (m) => m.role === "assistant" && Array.isArray(m.tool_calls),
        );
        expect(assistantWithToolCall).toBeDefined();
        expect(assistantWithToolCall?.content).toBe("");
    });

    test("answers every tool call in a parallel batch", async () => {
        const sent: Record<string, unknown>[][] = [];
        let index = 0;
        apiCalls = [
            {
                choices: [
                    {
                        message: {
                            content: null,
                            tool_calls: [
                                { id: "b1", function: { name: "inspectRepo", arguments: "{}" } },
                                {
                                    id: "b2",
                                    function: {
                                        name: "searchCode",
                                        arguments: JSON.stringify({ query: "createCanvas" }),
                                    },
                                },
                            ],
                        },
                    },
                ],
            },
            finalText("done"),
        ];

        const client = {
            chat: {
                completions: {
                    create: async (body: Record<string, unknown>) => {
                        sent.push(body.messages as Record<string, unknown>[]);
                        const next = apiCalls[Math.min(index, apiCalls.length - 1)];
                        index += 1;
                        return next as never;
                    },
                },
            },
        } as unknown as Parameters<typeof runMigrationAgent>[0]["client"];

        const result = await runMigrationAgent({ root, packet, client });

        const asked = result.state.transcript.flatMap((e) => e.toolCalls ?? []);
        const answered = result.state.transcript.filter((e) => e.role === "tool");
        expect(asked.map((c) => c.id).sort()).toEqual(["b1", "b2"]);
        expect(answered.map((e) => e.toolCallId).sort()).toEqual(["b1", "b2"]);

        const toolMessages = sent[1].filter((m) => m.role === "tool");
        expect(toolMessages).toHaveLength(2);
        for (const message of toolMessages) {
            expect(message.tool_call_id).toBeTypeOf("string");
            expect(message.content).toBeTypeOf("string");
        }
    });

    test("returns no_action when the model never touches a file", async () => {
        apiCalls = [
            toolCall("inspectRepo", {}, "c1"),
            finalText("Nothing in this repo uses the renamed API."),
        ];

        const result = await runMigrationAgent({ root, packet, client: fakeClient() });
        expect(result.outcome).toBe("no_action");
        expect(result.filesChanged).toEqual([]);
    });

    test("returns review_pr when a file changed but validation failed", async () => {
        const init = Bun.spawn(["git", "init"], { cwd: root, stdout: "pipe" });
        await init.exited;
        const add = Bun.spawn(["git", "add", "-A"], { cwd: root, stdout: "pipe" });
        await add.exited;

        apiCalls = [
            toolCall(
                "editFile",
                {
                    path: "src/client.ts",
                    patch: [
                        "--- a/src/client.ts",
                        "+++ b/src/client.ts",
                        "@@ -1 +1 @@",
                        "-createCanvas(1);",
                        "+createSurface(1);",
                    ].join("\n"),
                },
                "c1",
            ),
            toolCall("runCommand", { command: "npm run typecheck" }, "c2"),
        ];
        await writeFile(
            join(root, "package.json"),
            JSON.stringify({
                name: "fixture",
                scripts: { typecheck: "node -e \"process.exit(1)\"" },
            }),
        );

        const result = await runMigrationAgent({
            root,
            packet,
            client: fakeClient(),
            commandRunner: fakeFailRunner(),
        });
        expect(result.outcome).toBe("review_pr");
        expect(result.state.lastTestResult?.passed).toBe(false);
    });

    test("stops at the iteration ceiling and asks for review", async () => {
        const init = Bun.spawn(["git", "init"], { cwd: root, stdout: "pipe" });
        await init.exited;
        const add = Bun.spawn(["git", "add", "-A"], { cwd: root, stdout: "pipe" });
        await add.exited;

        // A call that always succeeds, so only the ceiling can stop the run
        // (repeated failures stop earlier via the consecutive-failure limit).
        apiCalls = [toolCall("readFile", { path: "src/client.ts" }, "c1")];

        const result = await runMigrationAgent({ root, packet, client: fakeClient() });
        expect(result.state.iteration).toBe(15);
        expect(result.outcome).toBe("no_action");
    });

    test("stops early on consecutive tool failures instead of looping", async () => {
        apiCalls = [toolCall("readFile", { path: "src/missing.ts" }, "c1")];

        const result = await runMigrationAgent({ root, packet, client: fakeClient() });
        expect(result.state.iteration).toBe(5);
        expect(result.outcome).toBe("no_action");
        expect(
            result.state.transcript.some((entry) => entry.content.includes("in a row")),
        ).toBe(true);
    });

    test("a success resets the consecutive failure count", async () => {
        apiCalls = [
            toolCall("readFile", { path: "src/missing.ts" }, "c1"),
            toolCall("readFile", { path: "src/missing.ts" }, "c2"),
            toolCall("readFile", { path: "src/missing.ts" }, "c3"),
            toolCall("readFile", { path: "src/missing.ts" }, "c4"),
            toolCall("readFile", { path: "src/client.ts" }, "c5"),
            finalText("recovered"),
        ];

        const result = await runMigrationAgent({ root, packet, client: fakeClient() });
        expect(result.state.iteration).toBe(6);
        expect(result.outcome).toBe("no_action");
    });

    test("refuses to edit a protected path", async () => {
        await writeFile(join(root, ".env"), "SECRET=1\n");
        apiCalls = [toolCall("editFile", { path: ".env", patch: "x" }, "c1"), finalText("stopped")];

        const result = await runMigrationAgent({ root, packet, client: fakeClient() });
        expect(result.filesChanged).toEqual([]);
        const toolEntry = result.state.transcript.find(
            (entry) => entry.role === "tool" && entry.toolCallId === "c1",
        );
        expect(toolEntry?.content).toContain("FAILED");
    });

    test("ignores tool calls it does not recognise", async () => {
        apiCalls = [
            toolCall("deleteRepository", { path: "/" }, "c1"),
            finalText("I cannot do that."),
        ];

        const result = await runMigrationAgent({ root, packet, client: fakeClient() });
        expect(result.outcome).toBe("no_action");
        expect(result.state.transcript.some((entry) => entry.role === "tool")).toBe(false);
    });

    test("answers every tool call in a parallel batch before stopping", async () => {
        const init = Bun.spawn(["git", "init"], { cwd: root, stdout: "pipe" });
        await init.exited;
        const add = Bun.spawn(["git", "add", "-A"], { cwd: root, stdout: "pipe" });
        await add.exited;

        let turn = 0;
        const client = {
            chat: {
                completions: {
                    create: async () => {
                        turn += 1;
                        if (turn === 1) {
                            return {
                                choices: [
                                    {
                                        message: {
                                            content: null,
                                            tool_calls: [
                                                {
                                                    id: "pr",
                                                    function: {
                                                        name: "createPullRequest",
                                                        arguments: JSON.stringify({
                                                            title: "t",
                                                            body: "b",
                                                            branch: "br",
                                                        }),
                                                    },
                                                },
                                                {
                                                    id: "read",
                                                    function: {
                                                        name: "readFile",
                                                        arguments: JSON.stringify({
                                                            path: "src/client.ts",
                                                        }),
                                                    },
                                                },
                                            ],
                                        },
                                    },
                                ],
                            };
                        }
                        return finalText("stopping after the refused PR");
                    },
                },
            },
        } as unknown as Parameters<typeof runMigrationAgent>[0]["client"];

        const result = await runMigrationAgent({ root, packet, client });

        const requested = result.state.transcript
            .filter((entry) => entry.role === "assistant" && entry.toolCalls)
            .flatMap((entry) => entry.toolCalls ?? [])
            .map((call) => call.id);
        const answered = result.state.transcript
            .filter((entry) => entry.role === "tool")
            .map((entry) => entry.toolCallId);

        for (const id of requested) {
            expect(answered).toContain(id);
        }
        // The batch's createPullRequest is refused (bad branch, no passing
        // verification), and only a successful PR ends the loop, so the model
        // gets a second turn instead of stopping after the first.
        expect(result.state.iteration).toBe(2);
    });

    test("sends the system prompt and the ChangePacket to the model", async () => {
        let seen: unknown;
        apiCalls = [finalText("No changes needed.")];

        const client = {
            chat: {
                completions: {
                    create: async (params: unknown) => {
                        seen = params;
                        return finalText("No changes needed.");
                    },
                },
            },
        } as unknown as Parameters<typeof runMigrationAgent>[0]["client"];

        await runMigrationAgent({ root, packet, client });

        const params = seen as {
            messages: Array<{ role: string; content?: string }>;
            tools: Array<{ function: { name: string } }>;
        };
        expect(params.messages[0].role).toBe("system");
        expect(params.messages[0].content).toContain("DriftLock");
        expect(params.messages[1].content).toContain("createCanvas renamed to createSurface");
        expect(params.tools.map((tool) => tool.function.name)).toContain("readFile");
    });

    test("retries a transient model failure and continues the run", async () => {
        let calls = 0;
        const client = {
            chat: {
                completions: {
                    create: async () => {
                        calls += 1;
                        if (calls <= 2) {
                            throw Object.assign(new Error("overloaded"), { status: 503 });
                        }
                        return finalText("recovered after retry");
                    },
                },
            },
        } as unknown as Parameters<typeof runMigrationAgent>[0]["client"];

        const result = await runMigrationAgent({
            root,
            packet,
            client,
            modelRetryBaseMs: 5,
        });

        expect(calls).toBe(3);
        expect(result.outcome).toBe("no_action");
    });

    test("a dead model degrades to an outcome instead of throwing", async () => {
        const client = {
            chat: {
                completions: {
                    create: async () => {
                        throw new Error("invalid api key");
                    },
                },
            },
        } as unknown as Parameters<typeof runMigrationAgent>[0]["client"];

        const result = await runMigrationAgent({ root, packet, client });

        expect(result.outcome).toBe("no_action");
        expect(
            result.state.transcript.some((entry) => entry.content.includes("Model call failed")),
        ).toBe(true);
    });

    test("a hung model call times out and stops the run", async () => {
        const client = {
            chat: {
                completions: {
                    create: (_body: unknown, opts?: { signal?: AbortSignal }) =>
                        new Promise((_, reject) => {
                            if (opts?.signal?.aborted) {
                                reject(new DOMException("aborted", "AbortError"));
                                return;
                            }
                            opts?.signal?.addEventListener("abort", () => {
                                reject(new DOMException("aborted", "AbortError"));
                            });
                        }),
                },
            },
        } as unknown as Parameters<typeof runMigrationAgent>[0]["client"];

        const result = await runMigrationAgent({
            root,
            packet,
            client,
            modelTimeoutMs: 30,
            modelMaxRetries: 0,
        });

        expect(result.outcome).toBe("no_action");
        expect(result.state.iteration).toBe(1);
    });

    test("every run carries a unique id echoed in its receipt", async () => {
        apiCalls = [finalText("Nothing in this repo uses the renamed API.")];

        const first = await runMigrationAgent({ root, packet, client: fakeClient() });
        const second = await runMigrationAgent({ root, packet, client: fakeClient() });

        expect(first.state.runId).toBeTruthy();
        expect(first.state.runId).not.toBe(second.state.runId);
        expect(first.receipt.runId).toBe(first.state.runId);
        expect(first.receipt.provider).toBe("p5");
        expect(first.receipt.outcome).toBe("no_action");
        expect(first.receipt.model).toBe("gpt-4o-mini");
    });

    test("a denied pull request is guidance, not a halt", async () => {
        const init = Bun.spawn(["git", "init"], { cwd: root, stdout: "pipe" });
        await init.exited;
        const add = Bun.spawn(["git", "add", "-A"], { cwd: root, stdout: "pipe" });
        await add.exited;

        apiCalls = [
            toolCall(
                "editFile",
                {
                    path: "src/client.ts",
                    patch: [
                        "--- a/src/client.ts",
                        "+++ b/src/client.ts",
                        "@@ -1 +1 @@",
                        "-createCanvas(1);",
                        "+createSurface(1);",
                    ].join("\n"),
                },
                "c1",
            ),
            toolCall("runCommand", { command: "npm run build" }, "c2"),
            toolCall(
                "createPullRequest",
                { title: "t", body: "b", branch: "driftlock/p5-2.3" },
                "c3",
            ),
        ];

        const seen: string[] = [];
        const result = await runMigrationAgent({
            root,
            packet,
            client: fakeClient(),
            commandRunner: fakeOkRunner(),
            approveTool: async (call) => {
                seen.push(call.name);
                return call.name === "createPullRequest" ? "reject" : "approve";
            },
        });

        expect(seen).toContain("createPullRequest");
        const denial = result.state.transcript.find(
            (entry) => entry.role === "tool" && entry.toolCallId === "c3",
        );
        expect(denial?.content).toContain("denied");
        expect(result.state.pullRequest).toBeUndefined();
    });

    test("an explicitly approved pull request proceeds", async () => {
        const init = Bun.spawn(["git", "init"], { cwd: root, stdout: "pipe" });
        await init.exited;
        const add = Bun.spawn(["git", "add", "-A"], { cwd: root, stdout: "pipe" });
        await add.exited;

        apiCalls = [
            toolCall(
                "editFile",
                {
                    path: "src/client.ts",
                    patch: [
                        "--- a/src/client.ts",
                        "+++ b/src/client.ts",
                        "@@ -1 +1 @@",
                        "-createCanvas(1);",
                        "+createSurface(1);",
                    ].join("\n"),
                },
                "c1",
            ),
            toolCall("runCommand", { command: "npm run build" }, "c2"),
            toolCall(
                "createPullRequest",
                { title: "t", body: "b", branch: "driftlock/p5-2-3" },
                "c3",
            ),
        ];

        const result = await runMigrationAgent({
            root,
            packet,
            client: fakeClient(),
            commandRunner: fakeOkRunner(),
            approveTool: () => "approve",
        });

        const pr = result.state.transcript.find(
            (entry) => entry.role === "tool" && entry.toolCallId === "c3",
        );
        expect(pr?.content).toContain("PREVIEW ONLY");
    });

    test("a throwing approval hook fails closed", async () => {
        apiCalls = [toolCall("createPullRequest", { title: "t", body: "b", branch: "x" }, "c1")];

        const result = await runMigrationAgent({
            root,
            packet,
            client: fakeClient(),
            approveTool: () => {
                throw new Error("hook is down");
            },
        });

        const entry = result.state.transcript.find(
            (item) => item.role === "tool" && item.toolCallId === "c1",
        );
        expect(entry?.content).toContain("Approval hook failed");
        expect(result.state.pullRequest).toBeUndefined();
    });

    test("emits run events and survives a throwing observer", async () => {
        const events: Array<{ type: string }> = [];
        apiCalls = [toolCall("inspectRepo", {}, "c1"), finalText("done")];

        const result = await runMigrationAgent({
            root,
            packet,
            client: fakeClient(),
            onEvent: (event) => {
                events.push(event);
                if (event.type === "tool") throw new Error("sink is down");
            },
        });

        expect(events[0]).toMatchObject({ type: "iteration", iteration: 1 });
        expect(events.some((event) => event.type === "tool")).toBe(true);
        expect(events.at(-1)).toMatchObject({ type: "done" });
        expect(result.outcome).toBe("no_action");
    });

    test("model retries are observable", async () => {
        const retries: Array<{ attempt: number; error: string }> = [];
        let calls = 0;
        const client = {
            chat: {
                completions: {
                    create: async () => {
                        calls += 1;
                        if (calls === 1) {
                            throw Object.assign(new Error("overloaded"), { status: 503 });
                        }
                        return finalText("done");
                    },
                },
            },
        } as unknown as Parameters<typeof runMigrationAgent>[0]["client"];

        await runMigrationAgent({
            root,
            packet,
            client,
            modelRetryBaseMs: 5,
            onEvent: (event) => {
                if (event.type === "model_retry") retries.push(event);
            },
        });

        expect(calls).toBe(2);
        expect(retries).toHaveLength(1);
        expect(retries[0].attempt).toBe(1);
    });

    test("bounds a long transcript without breaking the run", async () => {
        const init = Bun.spawn(["git", "init"], { cwd: root, stdout: "pipe" });
        await init.exited;
        const add = Bun.spawn(["git", "add", "-A"], { cwd: root, stdout: "pipe" });
        await add.exited;

        apiCalls = [
            toolCall("inspectRepo", {}, "c1"),
            toolCall("searchCode", { query: "createCanvas" }, "c2"),
            toolCall("readFile", { path: "src/client.ts" }, "c3"),
            toolCall(
                "editFile",
                {
                    path: "src/client.ts",
                    patch: [
                        "--- a/src/client.ts",
                        "+++ b/src/client.ts",
                        "@@ -1 +1 @@",
                        "-createCanvas(1);",
                        "+createSurface(1);",
                    ].join("\n"),
                },
                "c4",
            ),
            toolCall("runCommand", { command: "npm run build" }, "c5"),
            toolCall(
                "createPullRequest",
                { title: "Migrate to p5 2.3", body: "Renamed call", branch: "driftlock/p5-2.3" },
                "c6",
            ),
        ];

        const result = await runMigrationAgent({
            root,
            packet,
            client: fakeClient(),
            commandRunner: fakeOkRunner(),
            transcriptBudgetChars: 2000,
        });

        expect(result.outcome).toBe("draft_pr");
        expect(
            result.state.transcript.some((entry) => entry.content.includes("[omitted:")),
        ).toBe(true);
        // Skeletons survive: every tool result still has its request.
        const requested = result.state.transcript.flatMap((e) => e.toolCalls ?? []);
        const answered = result.state.transcript.filter((e) => e.role === "tool");
        expect(requested).toHaveLength(answered.length);
    });

    test("a failed edit blocks verification until the same file is retried", async () => {
        apiCalls = [
            toolCall(
                "replaceInFile",
                { path: "src/client.ts", oldText: "no-such-text", newText: "x" },
                "c1",
            ),
            toolCall("runCommand", { command: "npm run build" }, "c2"),
            toolCall(
                "createPullRequest",
                { title: "t", body: "b", branch: "driftlock/p5-2-3" },
                "c3",
            ),
        ];

        const result = await runMigrationAgent({
            root,
            packet,
            client: fakeClient(),
            commandRunner: fakeOkRunner(),
        });

        expect(result.state.pendingEditRetry).toBe("src/client.ts");
        const verify = result.state.transcript.find(
            (entry) => entry.role === "tool" && entry.toolCallId === "c2",
        );
        expect(verify?.content).toContain("has not been retried");
        expect(verify?.content).toContain("src/client.ts");
        const pr = result.state.transcript.find(
            (entry) => entry.role === "tool" && entry.toolCallId === "c3",
        );
        expect(pr?.content).toContain("has not been retried");
        // Nothing landed on disk, so there is nothing to review; the pending
        // retry and the refusals above are the signal, not the outcome label.
        expect(result.outcome).toBe("no_action");
        expect(result.receipt.confidence).toBe("low");
    });

    test("a successful retry of the same file re-opens verification", async () => {
        apiCalls = [
            toolCall(
                "replaceInFile",
                { path: "src/client.ts", oldText: "no-such-text", newText: "x" },
                "c1",
            ),
            toolCall(
                "replaceInFile",
                { path: "src/client.ts", oldText: "createCanvas(1);", newText: "createSurface(1);" },
                "c2",
            ),
            toolCall("runCommand", { command: "npm run build" }, "c3"),
        ];

        const result = await runMigrationAgent({
            root,
            packet,
            client: fakeClient(),
            commandRunner: fakeOkRunner(),
        });

        expect(result.state.pendingEditRetry).toBeNull();
        expect(result.state.lastTestResult?.passed).toBe(true);
    });

    test("lookupVendorSymbol resolves against the contract instead of guessing", async () => {
        apiCalls = [
            toolCall("lookupVendorSymbol", { symbol: "payment_method" }, "c1"),
            toolCall("lookupVendorSymbol", { symbol: "source" }, "c2"),
        ];

        const result = await runMigrationAgent({
            root,
            packet,
            client: fakeClient(),
            contract: {
                provider: "stripe",
                version: "2022-11-15",
                source: "live",
                authority: "authoritative",
                origin: "https://api.stripe.com/v1/test",
                capturedAt: "2026-01-01T00:00:00.000Z",
                members: ["id", "payment_method", "status"],
                removed: ["source"],
            },
            vendor: {
                name: "stripe",
                sdk: "stripe",
                clientNames: ["stripe"],
                basePath: "/v1",
            },
        });

        const first = result.state.transcript.find(
            (entry) => entry.role === "tool" && entry.toolCallId === "c1",
        );
        expect(first?.content).toContain("EXISTS");
        const second = result.state.transcript.find(
            (entry) => entry.role === "tool" && entry.toolCallId === "c2",
        );
        expect(second?.content).toContain("REMOVED");
    });

    test("checkCompleteness names a stale file the model never touched", async () => {
        await writeFile(
            join(root, "src/legacy.ts"),
            "function read(event) {\n  const pi = event.data.object;\n  return pi.source;\n}\n",
        );
        apiCalls = [toolCall("checkCompleteness", {}, "c1")];

        const result = await runMigrationAgent({
            root,
            packet: {
                provider: "stripe",
                fromVersion: "2022-08-01",
                toVersion: "2022-11-15",
                summary: "source removed",
                migrationDocs: [],
            },
            client: fakeClient(),
            contract: {
                provider: "stripe",
                version: "2022-11-15",
                source: "live",
                authority: "authoritative",
                origin: "https://api.stripe.com/v1/test",
                capturedAt: "2026-01-01T00:00:00.000Z",
                members: ["id", "payment_method", "status"],
                removed: ["source"],
            },
            vendor: {
                name: "stripe",
                sdk: "stripe",
                clientNames: ["stripe", "pi"],
                basePath: "/v1",
            },
        });

        const entry = result.state.transcript.find(
            (entry) => entry.role === "tool" && entry.toolCallId === "c1",
        );
        expect(entry?.content).toContain("INCOMPLETE");
        expect(entry?.content).toContain("src/legacy.ts");
        expect(result.state.symbolFindings?.length).toBeGreaterThan(0);
    });

    test("a passing verification warns inline when stale reads remain", async () => {
        const init = Bun.spawn(["git", "init"], { cwd: root, stdout: "pipe" });
        await init.exited;
        const add = Bun.spawn(["git", "add", "-A"], { cwd: root, stdout: "pipe" });
        await add.exited;
        await writeFile(
            join(root, "src/other.ts"),
            "function read(event) {\n  const pi = event.data.object;\n  return pi.source;\n}\n",
        );

        apiCalls = [
            toolCall(
                "replaceInFile",
                { path: "src/client.ts", oldText: "createCanvas(1);", newText: "ok(1);" },
                "c1",
            ),
            toolCall("runCommand", { command: "npm run build" }, "c2"),
        ];

        const result = await runMigrationAgent({
            root,
            packet: {
                provider: "stripe",
                fromVersion: "2022-08-01",
                toVersion: "2022-11-15",
                summary: "source removed",
                migrationDocs: [],
            },
            client: fakeClient(),
            commandRunner: fakeOkRunner(),
            contract: {
                provider: "stripe",
                version: "2022-11-15",
                source: "live",
                authority: "authoritative",
                origin: "https://api.stripe.com/v1/test",
                capturedAt: "2026-01-01T00:00:00.000Z",
                members: ["id", "payment_method", "status"],
                removed: ["source"],
            },
            vendor: {
                name: "stripe",
                sdk: "stripe",
                clientNames: ["stripe", "pi"],
                basePath: "/v1",
            },
        });

        const verify = result.state.transcript.find(
            (entry) => entry.role === "tool" && entry.toolCallId === "c2",
        );
        expect(result.state.lastTestResult?.passed).toBe(true);
        expect(verify?.content).toContain("COMPLETENESS WARNING");
        expect(verify?.content).toContain("src/other.ts");
        expect(result.receipt.confidence).toBe("low");
    });

    test("the receipt carries confidence beyond pass/fail", async () => {
        apiCalls = [toolCall("readFile", { path: "src/client.ts" }, "c1")];

        const result = await runMigrationAgent({
            root,
            packet,
            client: fakeClient(),
            commandRunner: fakeOkRunner(),
        });

        expect(result.receipt.confidence).toBe("low");
        expect(result.receipt.confidenceReasons.join(" ")).toContain("no passing verification");
    });

    test("recovers a text-written tool call and explains a silent exit", async () => {
        // Small models without function calling write the call as text.
        apiCalls = [
            {
                choices: [
                    {
                        message: {
                            content:
                                '{"name": "searchCode", "arguments": {"query": "createCanvas"}}',
                        },
                    },
                ],
            },
            finalText("nothing to do"),
        ];

        const notes: string[] = [];
        const onEvent = (event: AgentEvent) => {
            if (event.type === "note") notes.push(event.message);
        };

        const result = await runMigrationAgent({
            root,
            packet,
            client: fakeClient(),
            commandRunner: fakeOkRunner(),
            onEvent,
        });

        const toolEntry = result.state.transcript.find(
            (entry) => entry.role === "tool" && entry.toolName === "searchCode",
        );
        expect(toolEntry?.content).toContain("src/client.ts");
        expect(notes.some((m) => m.includes("Recovered searchCode"))).toBe(true);
        expect(notes.some((m) => m.includes("no tool calls"))).toBe(true);
        expect(result.state.iteration).toBe(2);
        expect(result.outcome).toBe("no_action");
    });
});

describe("parseTextToolCall", () => {
    test("recovers a call from clean JSON", () => {
        const [call] = parseTextToolCall(
            '{"name": "searchCode", "arguments": {"query": "source"}}',
        );
        expect(call.name).toBe("searchCode");
        expect(call.args).toEqual({ query: "source" });
        expect(call.id).toBe("text-1");
    });

    test("recovers nested args from prose", () => {
        const [call] = parseTextToolCall(
            'I will search now {"name": "searchCode", "arguments": {"query": "data.object.source", "path": ""}} done',
        );
        expect(call.name).toBe("searchCode");
        expect(call.args).toEqual({ query: "data.object.source", path: "" });
    });

    test("recovers from a fenced block", () => {
        const [call] = parseTextToolCall(
            "```json\n{\"name\": \"readFile\", \"arguments\": {\"path\": \"src/a.ts\"}}\n```",
        );
        expect(call.name).toBe("readFile");
        expect(call.args).toEqual({ path: "src/a.ts" });
    });

    test("accepts stringified arguments", () => {
        const [call] = parseTextToolCall(
            '{"name": "searchCode", "arguments": "{\\"query\\": \\"x\\"}"}',
        );
        expect(call.args).toEqual({ query: "x" });
    });

    test("rejects unknown tool names", () => {
        expect(
            parseTextToolCall('{"name": "deleteEverything", "arguments": {}}'),
        ).toEqual([]);
    });

    test("returns empty for prose without a call", () => {
        expect(parseTextToolCall("nothing to do here")).toEqual([]);
        expect(parseTextToolCall("")).toEqual([]);
    });
});

describe("PR honesty guardrails", () => {
    test("snapshot-only diff with a code-change title is refused", async () => {
        const { checkSnapshotOnlyTitle } = await import("@driftlock/agent");
        expect(
            checkSnapshotOnlyTitle(
                [".driftlock/snapshots/stripe.json"],
                "Replace source with payment_method",
            ),
        ).toMatch(/snapshot/i);
    });

    test("snapshot-only diff with an honest title passes the gate", async () => {
        const { checkSnapshotOnlyTitle } = await import("@driftlock/agent");
        expect(
            checkSnapshotOnlyTitle(
                [".driftlock/snapshots/stripe.json"],
                "driftlock: update stripe snapshots for payment_intent.succeeded",
            ),
        ).toBeNull();
    });

    test("source edits always pass the gate regardless of title", async () => {
        const { checkSnapshotOnlyTitle } = await import("@driftlock/agent");
        expect(
            checkSnapshotOnlyTitle(["src/payment.ts"], "Replace source with payment_method"),
        ).toBeNull();
    });

    test("verified files section lists the actual changed files", async () => {
        const { withVerifiedFilesSection } = await import("@driftlock/agent");
        const body = withVerifiedFilesSection("Migrated the handler.", [
            "src/payment.ts",
        ]);
        expect(body).toContain("Migrated the handler.");
        expect(body).toContain("### Files changed (verified)");
        expect(body).toContain("- `src/payment.ts`");
    });
});

describe("post-publish review comment", () => {
    test("review body restates verified files and the human checklist", async () => {
        const { buildReviewComment } = await import("@driftlock/agent");
        const body = buildReviewComment({
            files: ["src/payment.ts"],
            confidence: "high",
            reasons: ["contract checked"],
        });
        expect(body).toContain("- `src/payment.ts` changed as claimed");
        expect(body).toContain("Confidence: high (contract checked)");
        expect(body).toContain("Log labels and string literals");
        expect(body).toContain("Downstream readers");
    });

    test("publishing posts the review comment without failing the run", async () => {
        const init = Bun.spawn(["git", "init"], { cwd: root, stdout: "pipe" });
        await init.exited;
        const add = Bun.spawn(["git", "add", "-A"], { cwd: root, stdout: "pipe" });
        await add.exited;

        apiCalls = [
            toolCall(
                "editFile",
                {
                    path: "src/client.ts",
                    patch: [
                        "--- a/src/client.ts",
                        "+++ b/src/client.ts",
                        "@@ -1 +1 @@",
                        "-createCanvas(1);",
                        "+createSurface(1);",
                    ].join("\n"),
                },
                "c1",
            ),
            toolCall("runCommand", { command: "npm run build" }, "c2"),
            toolCall(
                "createPullRequest",
                { title: "Migrate to p5 2.3", body: "Renamed call", branch: "driftlock/p5-2.3" },
                "c3",
            ),
        ];
        const comments: string[] = [];
        const result = await runMigrationAgent({
            root,
            packet,
            client: fakeClient(),
            commandRunner: fakeOkRunner(),
            publisher: {
                publish: async (input) => ({
                    status: "opened" as const,
                    url: "https://pr/staged-review",
                    number: 7,
                    branch: input.branch,
                }),
                comment: async (input) => {
                    comments.push(input.body);
                },
            },
            target: { owner: "acme", repo: "pay", base: "main" },
        });

        expect(result.state.pullRequest?.url).toBe("https://pr/staged-review");
        expect(comments).toHaveLength(1);
        expect(comments[0]).toContain("- `src/client.ts` changed as claimed");
        expect(comments[0]).toContain("Please confirm before merging");
    });

    test("a failing comment posts still leaves the PR standing", async () => {
        const init = Bun.spawn(["git", "init"], { cwd: root, stdout: "pipe" });
        await init.exited;
        const add = Bun.spawn(["git", "add", "-A"], { cwd: root, stdout: "pipe" });
        await add.exited;

        apiCalls = [
            toolCall(
                "editFile",
                {
                    path: "src/client.ts",
                    patch: [
                        "--- a/src/client.ts",
                        "+++ b/src/client.ts",
                        "@@ -1 +1 @@",
                        "-createCanvas(1);",
                        "+createSurface(1);",
                    ].join("\n"),
                },
                "c1",
            ),
            toolCall("runCommand", { command: "npm run build" }, "c2"),
            toolCall(
                "createPullRequest",
                { title: "Migrate to p5 2.3", body: "Renamed call", branch: "driftlock/p5-2.3" },
                "c3",
            ),
        ];
        const result = await runMigrationAgent({
            root,
            packet,
            client: fakeClient(),
            commandRunner: fakeOkRunner(),
            publisher: {
                publish: async (input) => ({
                    status: "opened" as const,
                    url: "https://pr/staged-review-2",
                    number: 8,
                    branch: input.branch,
                }),
                comment: async () => {
                    throw new Error("comments disabled");
                },
            },
            target: { owner: "acme", repo: "pay", base: "main" },
        });

        expect(result.state.pullRequest?.url).toBe("https://pr/staged-review-2");
    });
});
