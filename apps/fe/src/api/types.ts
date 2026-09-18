export type Permission = "read" | "read-write" | "suggest-only";

export interface User {
    name: string;
    handle: string;
    avatarUrl: string;
}

export interface Account {
    owner: string;
    kind: "user" | "organization";
    installedAt: string;
    repoCount: number;
    driftOpen: number;
    pullsOpen: number;
}

export interface Repo {
    owner: string;
    name: string;
    description: string;
    isPrivate: boolean;
    defaultBranch: string;
    watched: boolean;
    permission: Permission;
    schedule: string;
    stats: {
        callSites: number;
        driftOpen: number;
        pullsOpen: number;
        pendingCapture: number;
        healthy: boolean;
        lastProbeAt: string | null;
    };
}

export type SnapshotState =
    | "baseline"
    | "drifted"
    | "pending-capture"
    | "rebaselined";

export interface CallSiteSummary {
    id: string;
    filePath: string;
    line: number;
    method: string;
    packageName: string;
    endpoint: string | null;
    httpMethod: string | null;
    snapshot: SnapshotState;
    requestShape: Array<{ field: string; type: string }> | null;
    responseFields: string[];
}

export type DriftStatus =
    | "detected"
    | "fix_generated"
    | "pr_created"
    | "merged"
    | "rebaselined";

export type DriftTag = "traffic" | "docs" | "intercepted";

export interface DriftEvent {
    id: string;
    callSiteId: string;
    method: string;
    packageName: string;
    detectedAt: string;
    confidence: "high" | "medium" | "low";
    status: DriftStatus;
    summary: string;
    changes: Array<{ field: string; kind: string }>;
    prNumber: number | null;
    tag: DriftTag;
    confirmed: boolean;
}

export interface Pull {
    number: number;
    title: string;
    branch: string;
    status: "open" | "merged" | "closed";
    updatedAt: string;
    url: string;
}

export interface ApiKey {
    id: string;
    name: string;
    keyMasked: string;
    createdAt: string;
}

export interface Settings {
    autoProbe: boolean;
    forwardWhitelist: string[];
    apiKeys: ApiKey[];
    probeCredentials: Array<{ provider: string; kind: string; masked: string }>;
}

export interface RepoDetail {
    repo: Repo;
    callsites: CallSiteSummary[];
    pulls: Pull[];
}