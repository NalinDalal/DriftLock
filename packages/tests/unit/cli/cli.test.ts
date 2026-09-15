import { describe, expect, test } from "bun:test";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(import.meta.dir, "../../../..");
const CLI_PATH = path.join(REPO_ROOT, "apps/cli/index.ts");

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

describe("CLI structure", () => {
    test("index.ts exists and is importable", async () => {
        expect(fs.existsSync(CLI_PATH)).toBe(true);
    });

    test("CLI package.json has correct name", async () => {
        const pkgPath = path.join(REPO_ROOT, "apps/cli/package.json");
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        expect(pkg.name).toBe("@driftlock/cli");
    });

    test("CLI package.json has build script", async () => {
        const pkgPath = path.join(REPO_ROOT, "apps/cli/package.json");
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        expect(pkg.scripts?.build).toBeDefined();
    });

    test("CLI package.json has all required dependencies", async () => {
        const pkgPath = path.join(REPO_ROOT, "apps/cli/package.json");
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

        expect(pkg.dependencies).toHaveProperty("@driftlock/agent");
        expect(pkg.dependencies).toHaveProperty("@driftlock/parser");
        expect(pkg.dependencies).toHaveProperty("@driftlock/sandbox");
        expect(pkg.dependencies).toHaveProperty("@driftlock/git");
        expect(pkg.dependencies).toHaveProperty("commander");
        expect(pkg.dependencies).toHaveProperty("chalk");
        expect(pkg.dependencies).toHaveProperty("ora");
        expect(pkg.dependencies).toHaveProperty("inquirer");
    });

    test("CLI package.json has bin entry", async () => {
        const pkgPath = path.join(REPO_ROOT, "apps/cli/package.json");
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        expect(pkg.bin).toBeDefined();
        expect(pkg.bin.driftlock).toBe("./dist/index.js");
    });

    test("CLI dist/index.js is built", async () => {
        const distPath = path.join(REPO_ROOT, "apps/cli/dist/index.js");
        expect(fs.existsSync(distPath)).toBe(true);
        const stat = fs.statSync(distPath);
        expect(stat.size).toBeGreaterThan(0);
    });
});

describe("CLI --help", () => {
    test("shows program description and commands", async () => {
        const result = await runCli(["--help"]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("driftlock");
        expect(result.stdout).toContain("Self-maintaining APIs");
        expect(result.stdout).toContain("analyze");
        expect(result.stdout).toContain("test");
        expect(result.stdout).toContain("diff");
        expect(result.stdout).toContain("fix");
        expect(result.stdout).toContain("init");
    });

    test("shows examples in help", async () => {
        const result = await runCli(["--help"]);

        expect(result.stdout).toContain("driftlock analyze");
        expect(result.stdout).toContain("driftlock fix");
    });
});

describe("CLI --version", () => {
    test("shows version number", async () => {
        const result = await runCli(["--version"]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("0.1.0");
    });
});

describe("CLI analyze command", () => {
    test("analyze --help shows command description", async () => {
        const result = await runCli(["analyze", "--help"]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Scan codebase");
        expect(result.stdout).toContain("API call sites");
        expect(result.stdout).toContain("--output");
    });

    test("analyze on directory with no TS files", async () => {
        const result = await runCli(["analyze", "/tmp"]);

        // Should either succeed with 0 call sites or fail gracefully
        expect(result.exitCode).toBe(0);
    });
});

describe("CLI test command", () => {
    test("test --help shows command description", async () => {
        const result = await runCli(["test", "--help"]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("sandbox");
        expect(result.stdout).toContain("--command");
        expect(result.stdout).toContain("--timeout");
    });
});

describe("CLI diff command", () => {
    test("diff --help shows command description", async () => {
        const result = await runCli(["diff", "--help"]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Compare");
        expect(result.stdout).toContain("--base");
    });
});

describe("CLI fix command", () => {
    test("fix --help shows command description", async () => {
        const result = await runCli(["fix", "--help"]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Detect API drift");
        expect(result.stdout).toContain("--dry-run");
        expect(result.stdout).toContain("--repo");
        expect(result.stdout).toContain("--base");
        expect(result.stdout).toContain("GITHUB_TOKEN");
    });

    test("fix --help shows the full loop explanation", async () => {
        const result = await runCli(["fix", "--help"]);

        expect(result.stdout).toContain("Scans for API call sites");
        expect(result.stdout).toContain("Detects changes");
        expect(result.stdout).toContain("Generates fix suggestions");
        expect(result.stdout).toContain("Creates a PR");
    });
});

describe("CLI init command", () => {
    test("init --help shows command description", async () => {
        const result = await runCli(["init", "--help"]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Initialize");
        expect(result.stdout).toContain(".driftlock.yml");
        expect(result.stdout).toContain("OPENAI_API_KEY");
    });
});

describe("CLI unknown command", () => {
    test("shows error for unknown command", async () => {
        const result = await runCli(["nonexistent"]);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("unknown command");
    });
});

describe("CLI unknown option", () => {
    test("shows error for unknown option", async () => {
        const result = await runCli(["analyze", "--unknown"]);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain("unknown option");
    });
});
