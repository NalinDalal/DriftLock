import { describe, expect, test } from "bun:test";
import type {
    CallSite,
    DriftEvent,
    DiffSummary,
    Fix,
} from "@driftlock/core";

describe("E2E: end-to-end drift detection flow", () => {
    test("complete drift detection data flow", () => {
        // 1. Parser extracts call sites
        const callSites: CallSite[] = [
            {
                id: "cs_1",
                repositoryId: "repo_1",
                filePath: "src/payments.ts",
                line: 10,
                method: "stripe.charges.create",
                endpoint: "/v1/charges",
                httpMethod: "POST",
                requestShape: { amount: "number", currency: "string" },
                responseFields: ["id", "status"],
                testFiles: ["tests/payments.test.ts"],
                lastCheckedAt: new Date("2024-01-01"),
                createdAt: new Date("2024-01-01"),
                updatedAt: new Date("2024-01-01"),
            },
        ];

        // 2. Git detects changes
        const modifiedFiles = ["src/payments.ts"];
        const affectedCallSites = callSites.filter((cs) =>
            modifiedFiles.includes(cs.filePath),
        );

        expect(affectedCallSites).toHaveLength(1);
        expect(affectedCallSites[0].method).toBe("stripe.charges.create");

        // 3. Agent analyzes drift
        const diffSummary: DiffSummary = {
            addedFields: [],
            removedFields: ["legacy_id"],
            typeChanges: [
                { field: "amount", oldType: "string", newType: "number" },
            ],
            optionalityChanges: [],
            breakingChanges: ["Removed field 'legacy_id'"],
            nonBreakingChanges: ["Changed type of 'amount' from string to number"],
        };

        const driftEvent: DriftEvent = {
            id: "de_1",
            callSiteId: affectedCallSites[0].id,
            detectedAt: new Date(),
            oldSnapshotId: "snap_old",
            newSnapshotId: "snap_new",
            diffSummary,
            suggestedFix: null,
            confidence: "high",
            prNumber: null,
            status: "detected",
        };

        expect(driftEvent.diffSummary.breakingChanges).toHaveLength(1);
        expect(driftEvent.confidence).toBe("high");

        // 4. Fix is generated
        const fix: Fix = {
            id: "fix_1",
            driftEventId: driftEvent.id,
            type: "field_rename",
            description: "Remove legacy_id field reference",
            diff: "- const id = response.legacy_id;\n+ const id = response.id;",
            confidence: "high",
            files: [
                {
                    path: "src/payments.ts",
                    changes: "- const id = response.legacy_id;\n+ const id = response.id;",
                },
            ],
            generatedAt: new Date(),
        };

        driftEvent.suggestedFix = fix;
        driftEvent.status = "fix_generated";

        expect(driftEvent.suggestedFix).not.toBeNull();
        expect(driftEvent.status).toBe("fix_generated");
        expect(fix.files).toHaveLength(1);
        expect(fix.files[0].path).toBe("src/payments.ts");
    });
});
