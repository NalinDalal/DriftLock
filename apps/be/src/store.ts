export type Permission = "read" | "read-write" | "suggest-only";

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

export type SnapshotState = "baseline" | "drifted" | "pending-capture" | "rebaselined";

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

export type DriftStatus = "detected" | "fix_generated" | "pr_created" | "merged" | "rebaselined";

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

function daysAgo(n: number): string {
    return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

function hoursAgo(n: number): string {
    return new Date(Date.now() - n * 60 * 60 * 1000).toISOString();
}

export const accounts: Account[] = [
    {
        owner: "acme-corp",
        kind: "organization",
        installedAt: daysAgo(41),
        repoCount: 3,
        driftOpen: 1,
        pullsOpen: 1,
    },
    {
        owner: "nalin",
        kind: "user",
        installedAt: daysAgo(12),
        repoCount: 1,
        driftOpen: 0,
        pullsOpen: 0,
    },
];

export let repos: Repo[] = [
    {
        owner: "acme-corp",
        name: "billing-api",
        description: "Usage metering and invoicing service",
        isPrivate: true,
        defaultBranch: "main",
        watched: true,
        permission: "read-write",
        schedule: "0 3 * * *",
        stats: {
            callSites: 6,
            driftOpen: 0,
            pullsOpen: 0,
            pendingCapture: 0,
            healthy: true,
            lastProbeAt: hoursAgo(5),
        },
    },
    {
        owner: "acme-corp",
        name: "notify-svc",
        description: "Transactional email for signups and receipts",
        isPrivate: true,
        defaultBranch: "main",
        watched: true,
        permission: "suggest-only",
        schedule: "0 4 * * *",
        stats: {
            callSites: 4,
            driftOpen: 1,
            pullsOpen: 1,
            pendingCapture: 1,
            healthy: false,
            lastProbeAt: hoursAgo(2),
        },
    },
    {
        owner: "acme-corp",
        name: "search-svc",
        description: "Product search and autocomplete",
        isPrivate: false,
        defaultBranch: "main",
        watched: false,
        permission: "read",
        schedule: "0 5 * * 1",
        stats: {
            callSites: 2,
            driftOpen: 0,
            pullsOpen: 0,
            pendingCapture: 2,
            healthy: true,
            lastProbeAt: null,
        },
    },
    {
        owner: "nalin",
        name: "side-projects",
        description: "Personal scripts and experiments",
        isPrivate: true,
        defaultBranch: "main",
        watched: true,
        permission: "read-write",
        schedule: "0 6 * * *",
        stats: {
            callSites: 1,
            driftOpen: 0,
            pullsOpen: 0,
            pendingCapture: 0,
            healthy: true,
            lastProbeAt: hoursAgo(30),
        },
    },
];

export let callSites: Record<string, CallSiteSummary[]> = {
    "acme-corp/billing-api": [
        {
            id: "bs01",
            filePath: "src/billing/charges.ts",
            line: 42,
            method: "charges.create",
            packageName: "stripe",
            endpoint: "/v1/charges",
            httpMethod: "POST",
            snapshot: "baseline",
            requestShape: [
                { field: "amount", type: "number" },
                { field: "currency", type: "string" },
                { field: "description", type: "string" },
            ],
            responseFields: ["id", "amount_captured", "status", "metadata"],
        },
        {
            id: "bs02",
            filePath: "src/billing/customers.ts",
            line: 17,
            method: "customers.list",
            packageName: "stripe",
            endpoint: "/v1/customers",
            httpMethod: "GET",
            snapshot: "baseline",
            requestShape: [{ field: "limit", type: "number" }],
            responseFields: ["data", "has_more"],
        },
        {
            id: "bs03",
            filePath: "src/billing/subscriptions.ts",
            line: 88,
            method: "subscriptions.update",
            packageName: "stripe",
            endpoint: "/v1/subscriptions/:id",
            httpMethod: "POST",
            snapshot: "baseline",
            requestShape: [{ field: "items", type: "array" }],
            responseFields: ["id", "status", "current_period_end"],
        },
        {
            id: "bs04",
            filePath: "src/billing/refunds.ts",
            line: 57,
            method: "refunds.create",
            packageName: "stripe",
            endpoint: "/v1/refunds",
            httpMethod: "POST",
            snapshot: "baseline",
            requestShape: [{ field: "payment_intent", type: "string" }],
            responseFields: ["id", "status"],
        },
        {
            id: "bs05",
            filePath: "src/billing/invoices.ts",
            line: 102,
            method: "invoices.retrieve",
            packageName: "stripe",
            endpoint: "/v1/invoices/:id",
            httpMethod: "GET",
            snapshot: "baseline",
            requestShape: [],
            responseFields: ["id", "number", "total", "currency"],
        },
        {
            id: "bs06",
            filePath: "src/billing/payment-methods.ts",
            line: 23,
            method: "paymentMethods.attach",
            packageName: "stripe",
            endpoint: "/v1/payment_methods/:id/attach",
            httpMethod: "POST",
            snapshot: "baseline",
            requestShape: [{ field: "customer", type: "string" }],
            responseFields: ["id", "type", "card"],
        },
    ],
    "acme-corp/notify-svc": [
        {
            id: "ns01",
            filePath: "src/email/send.ts",
            line: 64,
            method: "mail.send",
            packageName: "@sendgrid/mail",
            endpoint: "/v3/mail/send",
            httpMethod: "POST",
            snapshot: "drifted",
            requestShape: [
                { field: "to", type: "string" },
                { field: "from", type: "string" },
                { field: "subject", type: "string" },
            ],
            responseFields: [],
        },
        {
            id: "ns02",
            filePath: "src/email/templates.ts",
            line: 31,
            method: "templates.create",
            packageName: "@sendgrid/mail",
            endpoint: "/v3/templates",
            httpMethod: "POST",
            snapshot: "pending-capture",
            requestShape: null,
            responseFields: [],
        },
        {
            id: "ns03",
            filePath: "src/email/suppressions.ts",
            line: 76,
            method: "suppressions.search",
            packageName: "@sendgrid/mail",
            endpoint: null,
            httpMethod: null,
            snapshot: "baseline",
            requestShape: [{ field: "emails", type: "array" }],
            responseFields: ["email", "reason"],
        },
        {
            id: "ns04",
            filePath: "src/email/webhook.ts",
            line: 13,
            method: "events.get",
            packageName: "@sendgrid/mail",
            endpoint: "/v3/events",
            httpMethod: "GET",
            snapshot: "baseline",
            requestShape: [],
            responseFields: ["event", "email", "timestamp"],
        },
    ],
    "acme-corp/search-svc": [
        {
            id: "ss01",
            filePath: "src/search/autocomplete.ts",
            line: 25,
            method: "autocomplete",
            packageName: "algoliasearch",
            endpoint: null,
            httpMethod: null,
            snapshot: "pending-capture",
            requestShape: null,
            responseFields: [],
        },
        {
            id: "ss02",
            filePath: "src/search/settings.ts",
            line: 40,
            method: "settings.get",
            packageName: "algoliasearch",
            endpoint: null,
            httpMethod: null,
            snapshot: "pending-capture",
            requestShape: null,
            responseFields: [],
        },
    ],
    "nalin/side-projects": [
        {
            id: "sp01",
            filePath: "scripts/weather.ts",
            line: 8,
            method: "current.get",
            packageName: "openweathermap-ts",
            endpoint: "/data/2.5/weather",
            httpMethod: "GET",
            snapshot: "baseline",
            requestShape: [{ field: "q", type: "string" }],
            responseFields: ["weather", "main", "name"],
        },
    ],
};

export let drifts: Record<string, DriftEvent[]> = {
    "acme-corp/notify-svc": [
        {
            id: "drift-ns01",
            callSiteId: "ns01",
            method: "mail.send",
            packageName: "@sendgrid/mail",
            detectedAt: hoursAgo(3),
            confidence: "high",
            status: "pr_created",
            summary: "Response no longer includes `messageId`; the accepted envelope JSON was added. Code reads `messageId`, which is now absent.",
            changes: [
                { field: "response.messageId", kind: "removed" },
                { field: "response.json", kind: "added" },
            ],
            prNumber: 184,
            tag: "traffic",
            confirmed: true,
        },
        {
            id: "drift-ns01-docs",
            callSiteId: "ns01",
            method: "mail.send",
            packageName: "@sendgrid/mail",
            detectedAt: hoursAgo(26),
            confidence: "medium",
            status: "rebaselined",
            summary: "Docs list a new `response.json` field on successful send. Unconfirmed doc signal that later matched live traffic.",
            changes: [{ field: "response.json", kind: "added" }],
            prNumber: null,
            tag: "docs",
            confirmed: true,
        },
        {
            id: "drift-ns02",
            callSiteId: "ns02",
            method: "templates.create",
            packageName: "@sendgrid/mail",
            detectedAt: daysAgo(2),
            confidence: "low",
            status: "detected",
            summary: "No baseline yet. Call is intercepted because POST is non-idempotent and not whitelisted.",
            changes: [],
            prNumber: null,
            tag: "intercepted",
            confirmed: false,
        },
    ],
    "acme-corp/billing-api": [
        {
            id: "drift-bs03",
            callSiteId: "bs03",
            method: "subscriptions.update",
            packageName: "stripe",
            detectedAt: daysAgo(9),
            confidence: "high",
            status: "merged",
            summary: "`current_period_end` moved under `items`, and `items[]` items now require `id`. Fix PR was merged and the snapshot was rebaselined.",
            changes: [
                { field: "current_period_end", kind: "moved" },
                { field: "items[].id", kind: "now-required" },
            ],
            prNumber: 171,
            tag: "traffic",
            confirmed: true,
        },
    ],
};

export let pulls: Record<string, Pull[]> = {
    "acme-corp/notify-svc": [
        {
            number: 184,
            title: "driftlock: Fix mail.send in src/email/send.ts",
            branch: "driftlock/fix-ns01-fa3c",
            status: "open",
            updatedAt: hoursAgo(3),
            url: "https://github.com/acme-corp/notify-svc/pull/184",
        },
    ],
    "acme-corp/billing-api": [
        {
            number: 171,
            title: "driftlock: Rename current_period_end in src/billing/subscriptions.ts",
            branch: "driftlock/fix-bs03-91cd",
            status: "merged",
            updatedAt: daysAgo(8),
            url: "https://github.com/acme-corp/billing-api/pull/171",
        },
    ],
};

export let settings: Settings = {
    autoProbe: true,
    forwardWhitelist: ["POST /v3/mail/send", "POST /v1/refunds"],
    apiKeys: [
        {
            id: "key-01",
            name: "office-hours-bot",
            keyMasked: "dlk_…w8Qm",
            createdAt: daysAgo(30),
        },
    ],
    probeCredentials: [
        { provider: "stripe", kind: "test", masked: "sk_test_…K9x2" },
        { provider: "sendgrid", kind: "sandbox", masked: "SG.…x7Qa" },
    ],
};

export const watchers: Record<string, { owner: string; name: string; watched: boolean; permission: Permission; schedule: string }> =
    Object.fromEntries(
        repos.map((r) => [
            `${r.owner}/${r.name}`,
            { owner: r.owner, name: r.name, watched: r.watched, permission: r.permission, schedule: r.schedule },
        ]),
    );

export function repoKey(owner: string, name: string): string {
    return `${owner}/${name}`;
}

export function getRepo(owner: string, name: string): Repo | null {
    return repos.find((r) => r.owner === owner && r.name === name) ?? null;
}

export function setRepoPolicy(
    owner: string,
    name: string,
    patch: Partial<Pick<Repo, "watched" | "permission" | "schedule">>,
): Repo | null {
    const repo = getRepo(owner, name);
    if (!repo) {
        return null;
    }
    Object.assign(repo, patch);
    const entry = watchers[repoKey(owner, name)];
    if (entry) {
        Object.assign(entry, patch);
    }
    return repo;
}

export function rotateApiKey(name: string): ApiKey {
    const suffix = Math.random().toString(36).slice(2, 6);
    const key = `dlk_${suffix}${Math.random().toString(36).slice(2, 8)}`;
    const masked = `dlk_…${key.slice(-4)}`;
    settings.apiKeys = [
        ...settings.apiKeys.filter((k) => k.name !== name),
        { id: `key-${Date.now()}`, name, keyMasked: masked, createdAt: new Date().toISOString() },
    ];
    return settings.apiKeys[settings.apiKeys.length - 1];
}