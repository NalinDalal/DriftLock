import { describe, expect, test } from "bun:test";
import { spawn } from "child_process";
import * as path from "path";

const REPO_ROOT = path.resolve(import.meta.dir, "../../..");
const TEST_SCRIPT = path.join(import.meta.dir, "run-handler.ts");

async function runHandlerTest(): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
}> {
    return new Promise((resolve) => {
        const proc = spawn("bun", ["run", TEST_SCRIPT], {
            env: { ...process.env },
            cwd: path.dirname(TEST_SCRIPT),
            stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";

        proc.stdout?.on("data", (data: Buffer) => {
            stdout += data.toString();
        });

        proc.stderr?.on("data", (data: Buffer) => {
            stderr += data.toString();
        });

        proc.on("close", (code) => {
            resolve({ stdout, stderr, exitCode: code ?? 1 });
        });

        proc.on("error", (err) => {
            resolve({ stdout, stderr: stderr + String(err), exitCode: 1 });
        });
    });
}

describe("POST /api/runs (isolated)", () => {
    test("handleRun validates, executes pipeline, and returns run summary", async () => {
        const result = await runHandlerTest();
        if (result.exitCode !== 0) {
            console.error("Handler stderr:", result.stderr);
            console.error("Handler stdout:", result.stdout);
        }
        expect(result.exitCode).toBe(0);

        const lines = result.stdout.trim().split("\n");
        const results: Record<string, string> = {};
        for (const line of lines) {
            const match = line.match(/^([a-z-]+): (.+)$/);
            if (match) {
                results[match[1]] = match[2];
            }
        }

        expect(results["empty-body"]).toBe("400");
        expect(results["missing-owner"]).toBe("400");
        expect(results["missing-repo"]).toBe("400");
        expect(results["success-status"]).toBe("200");
        expect(results["run-id"]).toBe("run-1");
        expect(results["run-status"]).toBe("succeeded");
        expect(results["call-sites"]).toBe("1");
        expect(results["drifts"]).toBe("0");
        expect(results["traffic"]).toBe("3");
        expect(results["ensure-repo"]).toBe("acme/payments");
        expect(results["record-run"]).toBe("running");
        expect(results["upsert-callsite"]).toBe("cs-1");
        expect(results["finish-run"]).toBe("succeeded");
        expect(results["default-command"]).toBe("npm test");
        expect(results["custom-command"]).toBe("bun test");
        expect(results["forward-filter"]).toBe("2");
        expect(results["base-branch"]).toBe("develop");
        expect(results["cleanup"]).toBe("1");
        expect(results["error-status"]).toBe("500");
        expect(results["error-cleanup"]).toBe("1");
        expect(results["error-finish"]).toBe("failed");
        expect(results["trim-owner"]).toBe("acme");
        expect(results["trim-repo"]).toBe("payments");
    });
});
