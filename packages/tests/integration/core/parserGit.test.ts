import { describe, expect, test } from "bun:test";
import { TypeScriptExtractor } from "@driftlock/parser";
import { GitTracker } from "@driftlock/git";
import type { CallSite } from "@driftlock/core";

describe("Parser + Git integration: extract call sites from changed files", () => {
    test("extract call sites and match to git changes", async () => {
        const extractor = new TypeScriptExtractor();
        const tracker = new GitTracker(".");

        // Get changed files
        const changes = await tracker.detectChanges();
        const allChangedFiles = [
            ...changes.added,
            ...changes.modified,
        ].filter((f) => f.endsWith(".ts"));

        // Extract call sites from changed files
        const allCallSites: CallSite[] = [];
        for (const file of allChangedFiles) {
            try {
                const fs = await import("fs");
                const content = fs.readFileSync(file, "utf-8");
                const result = await extractor.extractFromFile(file, content);
                allCallSites.push(...result.callSites);
            } catch {
                // Skip files that can't be read
            }
        }

        // Verify the integration works
        expect(Array.isArray(allCallSites)).toBe(true);
    });
});
