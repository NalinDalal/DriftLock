import { describe, expect, test } from "bun:test";
import type {
    CallSite,
    Snapshot,
    DriftEvent,
    DiffSummary,
    Fix,
    Repository,
    TestClassification,
    CoverageReport,
} from "@driftlock/core";

function createCallSite(overrides: Partial<CallSite> = {}): CallSite {
    return {
        id: "cs_1",
        repositoryId: "repo_1",
        filePath: "src/api.ts",
        line: 10,
        method: "stripe.charges.create",
        endpoint: "/v1/charges",
        httpMethod: "POST",
        requestShape: { amount: "number" },
        responseFields: ["id", "status"],
        testFiles: ["tests/charges.test.ts"],
        lastCheckedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
    };
}

function createSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
    return {
        id: "snap_1",
        callSiteId: "cs_1",
        capturedAt: new Date(),
        requestShape: { amount: 100 },
        responseShape: { id: "ch_1", status: "succeeded" },
        testCommand: "bun test",
        exitCode: 0,
        duration: 1500,
        trafficCaptured: 5,
        ...overrides,
    };
}

function createDiffSummary(overrides: Partial<DiffSummary> = {}): DiffSummary {
    return {
        addedFields: [],
        removedFields: [],
        typeChanges: [],
        optionalityChanges: [],
        breakingChanges: [],
        nonBreakingChanges: [],
        ...overrides,
    };
}

function createFix(overrides: Partial<Fix> = {}): Fix {
    return {
        id: "fix_1",
        driftEventId: "de_1",
        type: "field_rename",
        description: "Rename amount to value",
        diff: "- amount\n+ value",
        confidence: "high",
        files: [{ path: "src/api.ts", changes: "- amount\n+ value" }],
        generatedAt: new Date(),
        ...overrides,
    };
}

function createDriftEvent(overrides: Partial<DriftEvent> = {}): DriftEvent {
    return {
        id: "de_1",
        callSiteId: "cs_1",
        detectedAt: new Date(),
        oldSnapshotId: "snap_old",
        newSnapshotId: "snap_new",
        diffSummary: createDiffSummary(),
        suggestedFix: null,
        confidence: "medium",
        prNumber: null,
        status: "detected",
        ...overrides,
    };
}

describe("CallSite type", () => {
    test("has required fields", () => {
        const cs = createCallSite();
        expect(cs.id).toBe("cs_1");
        expect(cs.filePath).toBe("src/api.ts");
        expect(cs.httpMethod).toBe("POST");
    });

    test("httpMethod only accepts valid values", () => {
        const validMethods = ["GET", "POST", "PUT", "DELETE", "PATCH"] as const;
        for (const method of validMethods) {
            const cs = createCallSite({ httpMethod: method });
            expect(cs.httpMethod).toBe(method);
        }
    });
});

describe("Snapshot type", () => {
    test("has required fields", () => {
        const snap = createSnapshot();
        expect(snap.id).toBe("snap_1");
        expect(snap.exitCode).toBe(0);
        expect(snap.duration).toBe(1500);
    });

    test("can have non-zero exit code", () => {
        const snap = createSnapshot({ exitCode: 1 });
        expect(snap.exitCode).toBe(1);
    });
});

describe("DriftEvent type", () => {
    test("has required fields", () => {
        const de = createDriftEvent();
        expect(de.id).toBe("de_1");
        expect(de.status).toBe("detected");
        expect(de.confidence).toBe("medium");
    });

    test("status accepts all valid values", () => {
        const statuses = [
            "detected",
            "fix_generated",
            "pr_opened",
            "merged",
            "closed",
            "false_positive",
        ] as const;
        for (const status of statuses) {
            const de = createDriftEvent({ status });
            expect(de.status).toBe(status);
        }
    });
});

describe("DiffSummary type", () => {
    test("can represent added fields", () => {
        const diff = createDiffSummary({ addedFields: ["currency"] });
        expect(diff.addedFields).toEqual(["currency"]);
    });

    test("can represent type changes", () => {
        const diff = createDiffSummary({
            typeChanges: [{ field: "amount", oldType: "string", newType: "number" }],
        });
        expect(diff.typeChanges[0].field).toBe("amount");
        expect(diff.typeChanges[0].oldType).toBe("string");
        expect(diff.typeChanges[0].newType).toBe("number");
    });

    test("can represent breaking changes", () => {
        const diff = createDiffSummary({
            breakingChanges: ["Removed field 'legacy_id'"],
        });
        expect(diff.breakingChanges).toHaveLength(1);
    });
});

describe("Fix type", () => {
    test("has required fields", () => {
        const fix = createFix();
        expect(fix.id).toBe("fix_1");
        expect(fix.type).toBe("field_rename");
        expect(fix.confidence).toBe("high");
    });

    test("fix type accepts all valid values", () => {
        const types = ["field_rename", "type_coercion", "null_check", "default_value", "custom"] as const;
        for (const type of types) {
            const fix = createFix({ type });
            expect(fix.type).toBe(type);
        }
    });
});

describe("Repository type", () => {
    test("has required fields", () => {
        const repo: Repository = {
            id: "repo_1",
            owner: "nerdev-co",
            name: "DriftLock",
            fullName: "nerdev-co/DriftLock",
            installationId: 12345,
            defaultBranch: "main",
            language: ["typescript"],
            lastAnalyzedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        expect(repo.fullName).toBe("nerdev-co/DriftLock");
        expect(repo.language).toEqual(["typescript"]);
    });
});

describe("TestClassification type", () => {
    test("has required fields", () => {
        const tc: TestClassification = {
            totalTests: 10,
            monitored: 7,
            testedButBlind: 2,
            untested: 1,
            details: [],
        };
        expect(tc.totalTests).toBe(10);
        expect(tc.monitored + tc.testedButBlind + tc.untested).toBe(tc.totalTests);
    });
});

describe("CoverageReport type", () => {
    test("has required fields", () => {
        const cr: CoverageReport = {
            totalCallSites: 20,
            monitored: 15,
            testedButBlind: 3,
            untested: 2,
            percentage: 75,
        };
        expect(cr.percentage).toBe(75);
    });
});
