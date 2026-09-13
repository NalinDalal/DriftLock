import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, rename, unlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { GitTracker } from "@driftlock/git";
import type { CallSite } from "@driftlock/core";

function createCallSite(overrides: Partial<CallSite> = {}): CallSite {
    return {
        id: "cs_1",
        repositoryId: "repo_1",
        filePath: "src/api.ts",
        line: 10,
        method: "stripe.charges.create",
        endpoint: "/v1/charges",
        httpMethod: "POST",
        requestShape: {},
        responseFields: [],
        testFiles: [],
        lastCheckedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

describe("GitTracker base comparisons", () => {
    let repoPath: string;
    let tracker: GitTracker;

    function git(...args: string[]): void {
        execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
            cwd: repoPath,
            env: {
                ...process.env,
                GIT_AUTHOR_NAME: "DriftLock Test",
                GIT_AUTHOR_EMAIL: "test@example.com",
                GIT_COMMITTER_NAME: "DriftLock Test",
                GIT_COMMITTER_EMAIL: "test@example.com",
            },
            stdio: "pipe",
        });
    }

    beforeEach(async () => {
        repoPath = await mkdtemp(join(tmpdir(), "driftlock-git-"));
        git("init");
        await writeFile(join(repoPath, "modified.ts"), "original\n");
        await writeFile(join(repoPath, "deleted.ts"), "to delete\n");
        git("add", ".");
        git("commit", "-m", "Initial files");
        git("branch", "base");
        tracker = new GitTracker(repoPath);
    });

    afterEach(async () => {
        await rm(repoPath, { recursive: true, force: true });
    });

    test("uses the chosen base and includes committed, staged and unstaged changes", async () => {
        await writeFile(join(repoPath, "committed.ts"), "committed addition\n");
        git("add", ".");
        git("commit", "-m", "Add committed file");
        git("branch", "later-base");
        await writeFile(join(repoPath, "modified.ts"), "working tree change\n");
        await unlink(join(repoPath, "deleted.ts"));
        await writeFile(join(repoPath, "staged.ts"), "staged addition\n");
        git("add", "staged.ts");
        await writeFile(join(repoPath, "untracked.ts"), "not part of the diff\n");

        expect(await tracker.detectChanges("base")).toEqual({
            added: ["committed.ts", "staged.ts"],
            modified: ["modified.ts"],
            deleted: ["deleted.ts"],
            renamed: [],
        });
        expect(await tracker.detectChanges("later-base")).toEqual({
            added: ["staged.ts"],
            modified: ["modified.ts"],
            deleted: ["deleted.ts"],
            renamed: [],
        });
        expect(await tracker.detectChanges("HEAD")).toEqual(
            await tracker.detectChanges("later-base"),
        );
    });

    test("preserves no-argument status behavior, including untracked files", async () => {
        await writeFile(join(repoPath, "modified.ts"), "modified\n");
        await unlink(join(repoPath, "deleted.ts"));
        await writeFile(join(repoPath, "untracked.ts"), "untracked\n");
        await writeFile(join(repoPath, "staged.ts"), "staged\n");
        git("add", "staged.ts");
        const status = await tracker.getStatus();

        expect(await tracker.detectChanges()).toEqual({
            added: status.not_added,
            modified: status.modified,
            deleted: status.deleted,
            renamed: status.renamed.map(({ from, to }) => ({ from, to })),
        });
        expect((await tracker.detectChanges()).added).toEqual(["untracked.ts"]);
        expect(await tracker.detectChanges(undefined)).toEqual(await tracker.detectChanges());
    });

    test("returns empty changes for a clean working tree matching the base", async () => {
        expect(await tracker.detectChanges("base")).toEqual({
            added: [], modified: [], deleted: [], renamed: [],
        });
    });

    test("rejects missing, non-commit and option-like base refs", async () => {
        for (const ref of ["missing-ref", "HEAD^{tree}", "", "--help", "--output=file", "HEAD\0bad"]) {
            await expect(tracker.detectChanges(ref)).rejects.toThrow();
        }
    });

    test("preserves NUL-delimited rename and unusual filenames", async () => {
        const from = "old\tname\n\"\\\u00e9.ts";
        const to = " new\tname\n\"\\\u00e9.ts ";
        const modified = "modified\tfile\n.ts";
        const deleted = "deleted\nfile\t.ts";
        const added = "-added\tfile\n.ts";
        await writeFile(join(repoPath, from), "unique rename contents\n");
        await writeFile(join(repoPath, modified), "before modification\n");
        await writeFile(join(repoPath, deleted), "contents to remove\n");
        git("add", ".");
        git("commit", "-m", "Add unusual paths");
        await rename(join(repoPath, from), join(repoPath, to));
        await writeFile(join(repoPath, modified), "after modification\n");
        await unlink(join(repoPath, deleted));
        await writeFile(join(repoPath, added), "a distinct new file\n");
        git("add", ".");

        expect(await tracker.detectChanges("HEAD")).toEqual({
            added: [added],
            modified: [modified],
            deleted: [deleted],
            renamed: [{ from, to }],
        });
    });
});

describe("GitTracker", () => {
    test("constructor accepts a valid repo path", () => {
        const tracker = new GitTracker(".");
        expect(tracker).toBeDefined();
    });

    test("getCurrentBranch returns a string", async () => {
        const tracker = new GitTracker(".");
        const branch = await tracker.getCurrentBranch();
        expect(typeof branch).toBe("string");
        expect(branch.length).toBeGreaterThan(0);
    });

    test("getStatus returns status object", async () => {
        const tracker = new GitTracker(".");
        const status = await tracker.getStatus();
        expect(status).toBeDefined();
        expect(status).toHaveProperty("current");
        expect(status).toHaveProperty("modified");
        expect(status).toHaveProperty("not_added");
        expect(status).toHaveProperty("deleted");
    });

    test("detectChanges returns proper shape", async () => {
        const tracker = new GitTracker(".");
        const changes = await tracker.detectChanges();
        expect(changes).toHaveProperty("added");
        expect(changes).toHaveProperty("modified");
        expect(changes).toHaveProperty("deleted");
        expect(changes).toHaveProperty("renamed");
        expect(Array.isArray(changes.added)).toBe(true);
        expect(Array.isArray(changes.modified)).toBe(true);
        expect(Array.isArray(changes.deleted)).toBe(true);
        expect(Array.isArray(changes.renamed)).toBe(true);
    });

    test("getDiff returns a string", async () => {
        const tracker = new GitTracker(".");
        const diff = await tracker.getDiff("HEAD");
        expect(typeof diff).toBe("string");
    });

    test("getCommitHistory returns array", async () => {
        const tracker = new GitTracker(".");
        const history = await tracker.getCommitHistory(5);
        expect(Array.isArray(history)).toBe(true);
        if (history.length > 0) {
            expect(history[0]).toHaveProperty("hash");
            expect(history[0]).toHaveProperty("message");
            expect(history[0]).toHaveProperty("date");
            expect(history[0]).toHaveProperty("author");
        }
    });

    test("getCallSiteChanges returns array", async () => {
        const tracker = new GitTracker(".");
        const callSites = [
            createCallSite({ filePath: "src/api.ts" }),
            createCallSite({ id: "cs_2", filePath: "src/other.ts" }),
        ];
        const changes = await tracker.getCallSiteChanges(callSites);
        expect(Array.isArray(changes)).toBe(true);
    });

    test("getCallSiteChanges matches call sites to changed files", async () => {
        const tracker = new GitTracker(".");
        const callSites = [
            createCallSite({ filePath: "nonexistent.ts" }),
        ];
        const changes = await tracker.getCallSiteChanges(callSites);
        // Should not include changes for files not in the change set
        expect(Array.isArray(changes)).toBe(true);
    });
});
