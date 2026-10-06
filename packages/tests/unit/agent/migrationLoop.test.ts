import { describe, expect, test } from "bun:test";
import {
    buildReceipt,
    canChangeMoreFiles,
    canRunMoreCommands,
    createInitialState,
    decideOutcome,
    isRetryableModelError,
    isToolName,
    limits,
    recordFileChanged,
    tools,
    toOpenAITools,
    trimTranscript,
    type ChangePacket,
    type AgentState,
} from "@driftlock/agent";

function packet(overrides: Partial<ChangePacket> = {}): ChangePacket {
    return {
        provider: "p5",
        fromVersion: "1.11",
        toVersion: "2.3",
        summary: "breaking rename of createCanvas to createSurface",
        migrationDocs: ["https://example.test/p5-2.3"],
        ...overrides,
    };
}

function state(overrides: Partial<AgentState> = {}): AgentState {
    return { ...createInitialState(packet()), ...overrides };
}

describe("tools", () => {
    test("exposes exactly the ten migration tools", () => {
        expect(tools.map((tool) => tool.name)).toEqual([
            "inspectRepo",
            "searchCode",
            "readFile",
            "editFile",
            "replaceInFile",
            "lookupVendorSymbol",
            "readContract",
            "checkCompleteness",
            "runCommand",
            "createPullRequest",
        ]);
    });

    test("every tool has a description and an object schema", () => {
        for (const tool of tools) {
            expect(tool.description.length).toBeGreaterThan(10);
            expect(tool.inputSchema.type).toBe("object");
            expect(Array.isArray(tool.inputSchema.required)).toBe(true);
        }
    });

    test("required properties are declared in properties", () => {
        for (const tool of tools) {
            for (const key of tool.inputSchema.required) {
                expect(tool.inputSchema.properties[key]).toBeDefined();
            }
        }
    });

    test("isToolName narrows known tools only", () => {
        expect(isToolName("readFile")).toBe(true);
        expect(isToolName("deleteEverything")).toBe(false);
    });

    test("toOpenAITools maps to the function tool shape", () => {
        const mapped = toOpenAITools();
        expect(mapped).toHaveLength(tools.length);
        expect(mapped[0].type).toBe("function");
        expect(mapped[0].function.name).toBe("inspectRepo");
        expect(mapped[0].function.parameters.type).toBe("object");
    });
});

describe("createInitialState", () => {
    test("seeds limits from the shared budget", () => {
        const initial = createInitialState(packet());
        expect(initial.maxIterations).toBe(limits.MAX_ITERATIONS);
        expect(initial.maxCommands).toBe(limits.MAX_COMMANDS);
        expect(initial.maxFilesChanged).toBe(limits.MAX_FILES_CHANGED);
        expect(initial.iteration).toBe(0);
        expect(initial.commandsRun).toBe(0);
    });

    test("starts not done with no outcome", () => {
        const initial = createInitialState(packet());
        expect(initial.done).toBe(false);
        expect(initial.outcome).toBeNull();
        expect(initial.filesChanged).toEqual([]);
    });

    test("seeds a unique run id and a zeroed failure count", () => {
        const first = createInitialState(packet());
        const second = createInitialState(packet());
        expect(first.runId).toBeTruthy();
        expect(second.runId).toBeTruthy();
        expect(first.runId).not.toBe(second.runId);
        expect(first.consecutiveFailures).toBe(0);
    });

    test("caps consecutive failures below the iteration ceiling", () => {
        expect(limits.MAX_CONSECUTIVE_FAILURES).toBeLessThan(limits.MAX_ITERATIONS);
    });

    test("embeds the ChangePacket in the first user message", () => {
        const initial = createInitialState(packet());
        const first = initial.transcript[0];
        expect(first.role).toBe("user");
        expect(first.content).toContain('"provider": "p5"');
        expect(first.content).toContain("1.11");
        expect(first.content).toContain("2.3");
    });
});

describe("recordFileChanged", () => {
    test("tracks a path once", () => {
        const current = state();
        recordFileChanged(current, "src/client.ts");
        recordFileChanged(current, "src/client.ts");
        expect(current.filesChanged).toEqual(["src/client.ts"]);
    });

    test("refuses edits past MAX_FILES_CHANGED", () => {
        const current = state();
        for (let i = 0; i < limits.MAX_FILES_CHANGED; i++) {
            recordFileChanged(current, `file-${i}.ts`);
        }
        expect(canChangeMoreFiles(current)).toBe(false);
    });
});

describe("canRunMoreCommands", () => {
    test("allows commands up to the budget", () => {
        const current = state({ commandsRun: limits.MAX_COMMANDS - 1 });
        expect(canRunMoreCommands(current)).toBe(true);
    });

    test("blocks commands past the budget", () => {
        const current = state({ commandsRun: limits.MAX_COMMANDS });
        expect(canRunMoreCommands(current)).toBe(false);
    });
});

describe("decideOutcome", () => {
    test("auto_pr when a change was made, validation passed, and a contract gates the run", () => {
        const current = state({
            filesChanged: ["src/client.ts"],
            lastTestResult: { passed: true, output: "exit code: 0" },
            hasContract: true,
        });
        expect(decideOutcome(current)).toBe("auto_pr");
    });

    test("draft_pr when verified but no contract gates the run", () => {
        const current = state({
            filesChanged: ["src/client.ts"],
            lastTestResult: { passed: true, output: "exit code: 0" },
        });
        expect(decideOutcome(current)).toBe("draft_pr");
    });

    test("review_pr when validation failed", () => {
        const current = state({
            filesChanged: ["src/client.ts"],
            lastTestResult: { passed: false, output: "exit code: 1" },
        });
        expect(decideOutcome(current)).toBe("review_pr");
    });

    test("review_pr when files changed without a test run", () => {
        const current = state({ filesChanged: ["src/client.ts"] });
        expect(decideOutcome(current)).toBe("review_pr");
    });

    test("no_action when nothing changed", () => {
        expect(decideOutcome(state())).toBe("no_action");
    });

    test("review_pr when only a failed command ran", () => {
        const current = state({
            lastTestResult: { passed: false, output: "exit code: 1" },
        });
        expect(decideOutcome(current)).toBe("review_pr");
    });

    test("not auto_pr when tests pass but nothing changed", () => {
        const current = state({ lastTestResult: { passed: true, output: "ok" } });
        expect(decideOutcome(current)).toBe("review_pr");
    });
});

describe("isRetryableModelError", () => {
    test("retries rate limits, server errors, timeouts, and dropped connections", () => {
        expect(isRetryableModelError(Object.assign(new Error("slow down"), { status: 429 }))).toBe(
            true,
        );
        expect(isRetryableModelError(Object.assign(new Error("overloaded"), { status: 503 }))).toBe(
            true,
        );
        expect(isRetryableModelError(new DOMException("aborted", "AbortError"))).toBe(true);
        expect(isRetryableModelError(new TypeError("fetch failed"))).toBe(true);
    });

    test("does not retry auth, bad requests, or plain failures", () => {
        expect(isRetryableModelError(Object.assign(new Error("nope"), { status: 401 }))).toBe(
            false,
        );
        expect(isRetryableModelError(Object.assign(new Error("bad"), { status: 400 }))).toBe(false);
        expect(isRetryableModelError(new Error("invalid key"))).toBe(false);
        expect(isRetryableModelError("string failure")).toBe(false);
    });
});

describe("buildReceipt", () => {
    test("summarises the run for audit without the transcript", () => {
        const current = state({
            filesChanged: ["src/client.ts"],
            lastTestResult: { passed: true, output: "exit code: 0" },
            hasContract: true,
            commandsRun: 1,
            iteration: 4,
            contractChecked: true,
            pullRequest: {
                status: "opened",
                url: "https://github.com/acme/widgets/pull/7",
                number: 7,
                branch: "driftlock/p5-2-3",
            },
        });
        const receipt = buildReceipt(current, packet(), "gpt-4o-mini", "auto_pr");

        expect(receipt.runId).toBe(current.runId);
        expect(receipt.provider).toBe("p5");
        expect(receipt.outcome).toBe("auto_pr");
        expect(receipt.filesChanged).toEqual(["src/client.ts"]);
        expect(receipt.verificationPassed).toBe(true);
        expect(receipt.findingCount).toBe(0);
        expect(receipt.prNumber).toBe(7);
        expect(receipt.draft).toBe(false);
    });

    test("marks the PR as a draft when no contract gated the run", () => {
        const current = state({
            filesChanged: ["src/client.ts"],
            lastTestResult: { passed: true, output: "exit code: 0" },
            pullRequest: {
                status: "opened",
                url: "https://github.com/acme/widgets/pull/7",
                number: 7,
                branch: "driftlock/p5-2-3",
            },
        });
        expect(buildReceipt(current, packet(), "gpt-4o-mini", "draft_pr").draft).toBe(true);
    });
});

describe("tool ACI", () => {
    test("refusal paths tell the model how to recover", () => {
        const pr = tools.find((tool) => tool.name === "createPullRequest")!;
        expect(pr.description).toContain("never ends the run");
        expect(pr.description).toContain("draft");
        const run = tools.find((tool) => tool.name === "runCommand")!;
        expect(run.description).toContain("&&");
        const replace = tools.find((tool) => tool.name === "replaceInFile")!;
        expect(replace.description).toContain("default edit tool");
    });
});

describe("trimTranscript", () => {
    function toolEntry(id: string, content: string) {
        return {
            role: "tool" as const,
            content,
            toolCallId: id,
            toolName: "readFile",
        };
    }

    test("returns 0 and changes nothing under budget", () => {
        const current = state();
        expect(trimTranscript(current, 120_000)).toBe(0);
        expect(current.transcript).toHaveLength(1);
    });

    test("compacts oldest tool results but keeps skeleton and recency", () => {
        const current = state();
        for (let i = 0; i < 5; i += 1) {
            current.transcript.push({
                role: "assistant",
                content: "",
                toolCalls: [{ id: `c${i}`, name: "readFile", args: {} }],
            });
            current.transcript.push(toolEntry(`c${i}`, "x".repeat(5000)));
        }

        const compacted = trimTranscript(current, 8000);

        expect(compacted).toBe(2);
        // Skeleton intact: requests still pair with answers.
        expect(current.transcript.flatMap((e) => e.toolCalls ?? [])).toHaveLength(5);
        expect(current.transcript.filter((e) => e.role === "tool")).toHaveLength(5);
        // Oldest compacted, newest three untouched.
        const tools = current.transcript.filter((e) => e.role === "tool");
        expect(tools[0].content).toContain("[omitted:");
        expect(tools[1].content).toContain("[omitted:");
        expect(tools[2].content).toHaveLength(5000);
        expect(tools[4].content).toHaveLength(5000);
    });
});
