import { describe, expect, test } from "bun:test";
import { GitTracker } from "@driftlock/git";
import type { CallSite } from "@driftlock/core";

describe("GitTracker integration: real git operations", () => {
    test("tracks changes in the DriftLock repo itself", async () => {
        const tracker = new GitTracker(".");
        const changes = await tracker.detectChanges();

        expect(changes).toHaveProperty("added");
        expect(changes).toHaveProperty("modified");
        expect(changes).toHaveProperty("deleted");
        expect(changes).toHaveProperty("renamed");
    });

    test("gets current branch of DriftLock repo", async () => {
        const tracker = new GitTracker(".");
        const branch = await tracker.getCurrentBranch();

        expect(typeof branch).toBe("string");
        expect(branch.length).toBeGreaterThan(0);
    });

    test("gets commit history with limit", async () => {
        const tracker = new GitTracker(".");
        const history = await tracker.getCommitHistory(3);

        expect(Array.isArray(history)).toBe(true);
        expect(history.length).toBeLessThanOrEqual(3);

        if (history.length > 0) {
            expect(history[0]).toHaveProperty("hash");
            expect(history[0]).toHaveProperty("message");
            expect(history[0]).toHaveProperty("date");
            expect(history[0]).toHaveProperty("author");
            expect(typeof history[0].hash).toBe("string");
            expect(typeof history[0].message).toBe("string");
        }
    });

    test("gets git status with expected properties", async () => {
        const tracker = new GitTracker(".");
        const status = await tracker.getStatus();

        expect(status).toHaveProperty("current");
        expect(status).toHaveProperty("tracking");
        expect(status).toHaveProperty("ahead");
        expect(status).toHaveProperty("behind");
        expect(status).toHaveProperty("modified");
        expect(status).toHaveProperty("not_added");
        expect(status).toHaveProperty("deleted");
        expect(status).toHaveProperty("created");
        expect(status).toHaveProperty("conflicted");
    });

    test("getCallSiteChanges with empty call sites returns empty", async () => {
        const tracker = new GitTracker(".");
        const changes = await tracker.getCallSiteChanges([]);

        expect(changes).toEqual([]);
    });

    test("getDiff returns string from HEAD", async () => {
        const tracker = new GitTracker(".");
        const diff = await tracker.getDiff("HEAD");

        expect(typeof diff).toBe("string");
    });
});
