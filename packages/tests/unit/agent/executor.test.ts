import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    allowedCommands,
    editFile,
    inspectRepo,
    isAllowedCommand,
    readFile,
    resolveInsideRoot,
    runCommand,
    searchCode,
} from "@driftlock/agent";

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "driftlock-agent-"));
    await writeFile(
        join(root, "package.json"),
        JSON.stringify(
            {
                name: "fixture",
                dependencies: { stripe: "^8.0.0" },
                devDependencies: { typescript: "^5.3.0" },
                scripts: {
                    build: "node -e \"process.exit(0)\"",
                    typecheck: "node -e \"process.exit(1)\"",
                },
            },
            null,
            2,
        ),
    );
    await writeFile(
        join(root, "package-lock.json"),
        JSON.stringify({ lockfileVersion: 3 }),
    );
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(
        join(root, "src/client.ts"),
        "export const id = response.legacy_id;\n",
    );
    await writeFile(join(root, ".env"), "SECRET=should-not-be-readable\n");
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe("resolveInsideRoot", () => {
    test("resolves a normal relative path", () => {
        expect(resolveInsideRoot("/tmp/repo", "src/client.ts")).toBe(
            "/tmp/repo/src/client.ts",
        );
    });

    test("normalizes redundant segments", () => {
        expect(resolveInsideRoot("/tmp/repo", "./src//client.ts")).toBe(
            "/tmp/repo/src/client.ts",
        );
    });

    test("rejects absolute paths", () => {
        expect(resolveInsideRoot("/tmp/repo", "/etc/passwd")).toBeNull();
    });

    test("rejects home expansion", () => {
        expect(resolveInsideRoot("/tmp/repo", "~/.ssh/id_rsa")).toBeNull();
    });

    test("rejects traversal", () => {
        expect(resolveInsideRoot("/tmp/repo", "../outside.ts")).toBeNull();
        expect(resolveInsideRoot("/tmp/repo", "src/../../outside.ts")).toBeNull();
    });

    test("rejects dotenv files", () => {
        expect(resolveInsideRoot("/tmp/repo", ".env")).toBeNull();
        expect(resolveInsideRoot("/tmp/repo", "config/.env.production")).toBeNull();
    });

    test("rejects keys and certificates", () => {
        expect(resolveInsideRoot("/tmp/repo", "certs/server.pem")).toBeNull();
        expect(resolveInsideRoot("/tmp/repo", "id_rsa")).toBeNull();
    });

    test("rejects git config", () => {
        expect(resolveInsideRoot("/tmp/repo", ".git/config")).toBeNull();
    });

    test("rejects an empty path", () => {
        expect(resolveInsideRoot("/tmp/repo", "./")).toBeNull();
    });
});

describe("readFile", () => {
    test("returns numbered content", async () => {
        const result = await readFile(root, "src/client.ts");
        expect(result.ok).toBe(true);
        expect(result.output).toContain("1 | export const id");
    });

    test("refuses protected paths", async () => {
        const result = await readFile(root, ".env");
        expect(result.ok).toBe(false);
        expect(result.output).not.toContain("SECRET");
    });

    test("reports missing files", async () => {
        const result = await readFile(root, "src/nope.ts");
        expect(result.ok).toBe(false);
        expect(result.output).toContain("File not found");
    });
});

describe("searchCode", () => {
    test("finds matches with line numbers", async () => {
        const result = await searchCode(root, "legacy_id");
        expect(result.ok).toBe(true);
        expect(result.output).toContain("src/client.ts:1");
    });

    test("reports no matches", async () => {
        const result = await searchCode(root, "not_present_anywhere");
        expect(result.ok).toBe(true);
        expect(result.output).toContain("No matches");
    });

    test("rejects an empty query", async () => {
        const result = await searchCode(root, "   ");
        expect(result.ok).toBe(false);
    });

    test("scopes the search to a subdirectory", async () => {
        await mkdir(join(root, "other"), { recursive: true });
        await writeFile(join(root, "other/legacy.ts"), "legacy_id\n");
        const result = await searchCode(root, "legacy_id", "other");
        expect(result.ok).toBe(true);
        expect(result.output).toContain("other/legacy.ts:1");
        expect(result.output).not.toContain("src/client.ts");
    });

    test("rejects traversal in the scope path", async () => {
        const result = await searchCode(root, "legacy_id", "..");
        expect(result.ok).toBe(false);
    });
});

describe("inspectRepo", () => {
    test("reports package manager, lockfile, and source files", async () => {
        const result = await inspectRepo(root);
        expect(result.ok).toBe(true);
        const payload = JSON.parse(result.output) as {
            packageManager: string;
            lockfiles: string[];
            dependencies: string[];
            sourceFiles: string[];
        };
        expect(payload.packageManager).toBe("npm");
        expect(payload.lockfiles).toContain("package-lock.json");
        expect(payload.dependencies).toContain("stripe");
        expect(payload.sourceFiles).toContain("src/client.ts");
    });

    test("never lists dotenv files", async () => {
        const result = await inspectRepo(root);
        expect(result.output).not.toContain(".env");
    });
});

describe("editFile", () => {
    test("applies a valid unified diff", async () => {
        const proc = Bun.spawn(["git", "init"], { cwd: root, stdout: "pipe" });
        await proc.exited;
        const patch = [
            "--- a/src/client.ts",
            "+++ b/src/client.ts",
            "@@ -1 +1 @@",
            "-export const id = response.legacy_id;",
            "+export const id = response.id;",
        ].join("\n");

        const result = await editFile(root, "src/client.ts", patch);
        expect(result.ok).toBe(true);
        const updated = await Bun.file(join(root, "src/client.ts")).text();
        expect(updated).toContain("response.id");
    });

    test("rejects a patch without hunk headers", async () => {
        const result = await editFile(root, "src/client.ts", "just write this file");
        expect(result.ok).toBe(false);
        expect(result.output).toContain("@@");
    });

    test("rejects a patch without file headers", async () => {
        const result = await editFile(
            root,
            "src/client.ts",
            "@@ -1 +1 @@\n-a\n+b",
        );
        expect(result.ok).toBe(false);
        expect(result.output).toContain("headers");
    });

    test("refuses protected paths", async () => {
        const result = await editFile(
            root,
            ".env",
            "--- a/.env\n+++ b/.env\n@@ -1 +1 @@\n-A\n+B",
        );
        expect(result.ok).toBe(false);
    });
});

describe("runCommand", () => {
    test("rejects commands outside the whitelist", async () => {
        const result = await runCommand(root, "rm -rf /");
        expect(result.ok).toBe(false);
        expect(result.output).toContain("Command not allowed");
    });

    test("rejects shell metacharacter injection", async () => {
        const result = await runCommand(root, "npm test && rm -rf /");
        expect(result.ok).toBe(false);
    });

    test("runs a whitelisted command that exits zero", async () => {
        const result = await runCommand(root, "npm run build");
        expect(result.ok).toBe(true);
        expect(result.output).toContain("exit code: 0");
    });

    test("reports failure when a whitelisted command exits non-zero", async () => {
        const result = await runCommand(root, "npm run typecheck");
        expect(result.ok).toBe(false);
        expect(result.output).toContain("exit code: 1");
    });

    test("exposes the whitelist", () => {
        expect(allowedCommands()).toContain("npm run typecheck");
        expect(isAllowedCommand("npm test")).toBe(true);
        expect(isAllowedCommand("git push")).toBe(false);
    });
});
