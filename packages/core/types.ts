export interface CallSite {
    id: string;
    repositoryId: string;
    filePath: string;
    line: number;
    method: string;
    endpoint: string;
    httpMethod: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    requestShape: Record<string, unknown>;
    responseFields: string[];
    testFiles: string[];
    lastCheckedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface Snapshot {
    id: string;
    callSiteId: string;
    capturedAt: Date;
    requestShape: Record<string, unknown>;
    responseShape: Record<string, unknown>;
    testCommand: string;
    exitCode: number;
    duration: number;
    trafficCaptured: number;
}

export interface DriftEvent {
    id: string;
    callSiteId: string;
    detectedAt: Date;
    oldSnapshotId: string;
    newSnapshotId: string;
    diffSummary: DiffSummary;
    suggestedFix: Fix | null;
    confidence: "high" | "medium" | "low";
    prNumber: number | null;
    status:
        | "detected"
        | "fix_generated"
        | "pr_opened"
        | "merged"
        | "closed"
        | "false_positive";
}

export interface DiffSummary {
    addedFields: string[];
    removedFields: string[];
    typeChanges: Array<{
        field: string;
        oldType: string;
        newType: string;
    }>;
    optionalityChanges: Array<{
        field: string;
        wasRequired: boolean;
        nowRequired: boolean;
    }>;
    breakingChanges: string[];
    nonBreakingChanges: string[];
}

export interface Fix {
    id: string;
    driftEventId: string;
    type:
        | "field_rename"
        | "type_coercion"
        | "null_check"
        | "default_value"
        | "custom";
    description: string;
    diff: string;
    confidence: "high" | "medium" | "low";
    files: Array<{
        path: string;
        changes: string;
    }>;
    generatedAt: Date;
}

export interface Repository {
    id: string;
    owner: string;
    name: string;
    fullName: string;
    installationId: number;
    defaultBranch: string;
    language: string[];
    lastAnalyzedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface AnalysisResult {
    repositoryId: string;
    callSites: CallSite[];
    testClassification: TestClassification;
    coverage: CoverageReport;
    analyzedAt: Date;
}

export interface TestClassification {
    totalTests: number;
    monitored: number;
    testedButBlind: number;
    untested: number;
    details: Array<{
        testFile: string;
        classification: "monitored" | "tested_but_blind" | "untested";
        reason: string;
    }>;
}

export interface CoverageReport {
    totalCallSites: number;
    monitored: number;
    testedButBlind: number;
    untested: number;
    percentage: number;
}
