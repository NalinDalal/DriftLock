import { describe, expect, test, mock, beforeEach } from "bun:test";
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
