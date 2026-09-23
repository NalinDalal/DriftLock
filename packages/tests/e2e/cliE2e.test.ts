import { describe, expect, test } from "bun:test";
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const REPO_ROOT = path.resolve(import.meta.dir, "../../..");
const CLI_PATH = path.join(REPO_ROOT, "apps/cli/index.ts");
const FIXTURE_DIR = path.join(
    REPO_ROOT,
    "packages/tests/fixtures/sample-project",
);

async function runCli(
    args: string[],
    options?: { env?: Record<string, string> },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve) => {
        const proc = spawn("bun", ["run", CLI_PATH, ...args], {
            env: { ...process.env, ...options?.env },
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
            resolve({
                stdout,
                stderr,
                exitCode: code ?? 1,
            });
        });

        proc.on("error", () => {
            resolve({
                stdout,
                stderr,
                exitCode: 1,
            });
        });
    });
}

describe("CLI E2E: analyze fixture project", () => {
    test("fixture directory exists with expected files", () => {
        expect(fs.existsSync(FIXTURE_DIR)).toBe(true);
        expect(
            fs.existsSync(path.join(FIXTURE_DIR, "src", "payments.ts")),
        ).toBe(true);
    });

    test("analyze --output json detects call sites in fixture", async () => {
        const result = await runCli([
            "analyze",
            FIXTURE_DIR,
            "--output",
            "json",
        ]);

        expect(result.exitCode).toBe(0);

        const output = JSON.parse(result.stdout);
        expect(output.callSites).toBeDefined();
        expect(output.callSites.length).toBeGreaterThanOrEqual(2);

        const methods = output.callSites.map(
            (cs: { method: string }) => cs.method,
        );
        expect(methods).toContain("stripe.charges.create");
        expect(methods).toContain("stripe.refunds.create");
    });

    test("analyze detects method names from fixture", async () => {
        const result = await runCli([
            "analyze",
            FIXTURE_DIR,
            "--output",
            "json",
        ]);

        const output = JSON.parse(result.stdout);
        const chargeSite = output.callSites.find(
            (cs: { method: string }) => cs.method === "stripe.charges.create",
        );
        expect(chargeSite).toBeDefined();
        expect(chargeSite.packageName).toBe("stripe");

        const refundSite = output.callSites.find(
            (cs: { method: string }) => cs.method === "stripe.refunds.create",
        );
        expect(refundSite).toBeDefined();
        expect(refundSite.packageName).toBe("stripe");
    });

    test("analyze detects file paths and line numbers", async () => {
        const result = await runCli([
            "analyze",
            FIXTURE_DIR,
            "--output",
            "json",
        ]);

        const output = JSON.parse(result.stdout);
        for (const cs of output.callSites) {
            expect(cs.filePath).toContain("payments.ts");
            expect(cs.line).toBeGreaterThan(0);
        }
    });

    test("analyze returns empty for directory with no TS files", async () => {
        const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "driftlock-e2e-"));
        try {
            const result = await runCli([
                "analyze",
                emptyDir,
                "--output",
                "json",
            ]);

            expect(result.exitCode).toBe(0);
            const output = JSON.parse(result.stdout);
            expect(output.callSites).toEqual([]);
            expect(output.errors).toEqual([]);
        } finally {
            fs.rmSync(emptyDir, { recursive: true, force: true });
        }
    });

    test("analyze --output table produces human-readable output", async () => {
        const result = await runCli([
            "analyze",
            FIXTURE_DIR,
            "--output",
            "table",
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("stripe.charges.create");
        expect(result.stdout).toContain("stripe.refunds.create");
        expect(result.stdout).toContain("pending-capture");
    });

    test("analyze exits cleanly on fixture", async () => {
        const result = await runCli([
            "analyze",
            FIXTURE_DIR,
            "--output",
            "json",
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).not.toContain("error");
        expect(result.stderr).not.toContain("Error");
    });

    test("analyze errors array is empty for valid fixture", async () => {
        const result = await runCli([
            "analyze",
            FIXTURE_DIR,
            "--output",
            "json",
        ]);

        const output = JSON.parse(result.stdout);
        expect(output.errors).toEqual([]);
    });

    test("fixture call sites have required shape fields", async () => {
        const result = await runCli([
            "analyze",
            FIXTURE_DIR,
            "--output",
            "json",
        ]);

        const output = JSON.parse(result.stdout);
        for (const cs of output.callSites) {
            expect(cs).toHaveProperty("id");
            expect(cs).toHaveProperty("filePath");
            expect(cs).toHaveProperty("line");
            expect(cs).toHaveProperty("method");
            expect(cs).toHaveProperty("packageName");
            expect(cs).toHaveProperty("requestShape");
            expect(cs).toHaveProperty("responseFields");
        }
    });
});
