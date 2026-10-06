import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "child_process";
import { commitBaselines } from "@driftlock/cli/drift";

let dir: string;

function git(args: string[]): string {
    return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
}

beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "driftlock-commit-"));
    execFileSync("git", ["init"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "t@t"], { cwd: dir });
    await writeFile(join(dir, "a.txt"), "x\n");
    execFileSync("git", ["add", "-A"], { cwd: dir });
    execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe("commitBaselines", () => {
    test("commits changed snapshots locally when there is no remote to push to", async () => {
        await mkdir(join(dir, ".driftlock", "snapshots"), { recursive: true });
        await writeFile(join(dir, ".driftlock", "snapshots", "s.json"), "{}\n");
        const result = await commitBaselines(dir, "main");
        expect(result).toEqual({ committed: true, pushed: false });
        expect(git(["log", "--oneline", "-1"])).toMatch(/driftlock: update API baselines/);
        expect(git(["status", "--porcelain", "--", ".driftlock"])).toBe("");
    });

    test("no-ops when snapshots are unchanged", async () => {
        const before = git(["rev-list", "--count", "HEAD"]);
        const result = await commitBaselines(dir, "main");
        expect(result).toEqual({ committed: false, pushed: false });
        expect(git(["rev-list", "--count", "HEAD"])).toBe(before);
    });

    test("no-ops outside a git repository", async () => {
        const plain = await mkdtemp(join(tmpdir(), "driftlock-plain-"));
        try {
            const result = await commitBaselines(plain, "main");
            expect(result).toEqual({ committed: false, pushed: false });
        } finally {
            await rm(plain, { recursive: true, force: true });
        }
    });
});
