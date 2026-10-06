import { InMemorySchemaStore, DbSchemaStore, DriftDetector, createWebhookFixPR, createAgentFixPR, resolveAgentFixDeps, severityForSchemaDiff, routeBySeverity, parseCaptureSecrets, verifyCaptureSignature } from "@driftlock/webhookCapture";
import type { DriftAlert, RollbackAlert, SchemaStore, SchemaSnapshot, FlatSchema } from "@driftlock/webhookCapture";
import { getDb } from "@driftlock/db";
import { settings } from "@driftlock/db/schema";
import { eq } from "drizzle-orm";

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: { "content-type": "application/json" },
    });
}

type AIProvider = "openai" | "anthropic" | "gemini" | "cloudflare";

interface WebhookConfig {
    githubToken?: string;
    repoPath?: string;
    repoOwner?: string;
    repoName?: string;
    aiProvider?: string;
    aiApiKey?: string;
    aiModel?: string;
    aiBaseUrl?: string;
    cloudflareAccountId?: string;
    forwardUrl?: string;
    confidenceThreshold?: number;
    captureSecrets?: string;
}

let cachedConfig: WebhookConfig | null = null;
let configLastLoaded = 0;
const CONFIG_TTL_MS = 30_000;

/**
 * Log where each effective config value comes from. DB rows override env,
 * so a stale dashboard-saved row silently wins over freshly exported
 * variables — this line makes that visible on every (re)load.
 */
function logConfigSource(config: WebhookConfig, rowSource: "db" | "env"): void {
    const fields: Array<[keyof WebhookConfig, string]> = [
        ["githubToken", "GITHUB_TOKEN"],
        ["repoPath", "WEBHOOK_REPO_PATH"],
        ["repoOwner", "WEBHOOK_OWNER"],
        ["repoName", "WEBHOOK_REPO"],
        ["aiProvider", "AI_PROVIDER"],
        ["aiModel", "AI_MODEL"],
        ["aiBaseUrl", "AI_BASE_URL"],
        ["confidenceThreshold", "CONFIDENCE_THRESHOLD"],
    ];
    const parts = fields.map(([key, envKey]) => {
        const fromDb =
            config[key] !== undefined && config[key] !== "" && rowSource === "db";
        const raw = fromDb
            ? config[key]
            : (process.env[envKey] as string | undefined);
        const shown =
            /token|secret|key/i.test(key) || /token|secret|key/i.test(envKey)
                ? raw
                    ? "set"
                    : "missing"
                : (raw ?? "missing");
        return `${key}=${shown}(${fromDb ? "db" : "env"})`;
    });
    console.log(`[CONFIG] Loaded [row=${rowSource}]: ${parts.join(", ")}`);
}

async function loadConfig(): Promise<WebhookConfig> {
    const now = Date.now();
    if (cachedConfig && now - configLastLoaded < CONFIG_TTL_MS) {
        return cachedConfig;
    }

    try {
        const db = getDb();
        // Query the row directly: a bounded LIMIT scan silently misses
        // webhookConfig once unrelated rows (e.g. dashboard sessions)
        // outnumber the limit, falling back to env without a word.
        const rows = await db
            .select()
            .from(settings)
            .where(eq(settings.key, "webhookConfig"))
            .limit(1);

        const webhookRow = rows[0];
        if (webhookRow) {
            cachedConfig = webhookRow.value as WebhookConfig;
            logConfigSource(cachedConfig, "db");
        } else {
            cachedConfig = {};
            logConfigSource(cachedConfig, "env");
        }
    } catch (e) {
        cachedConfig = {};
        console.log("[CONFIG] DB error, using env only:", e);
    }

    configLastLoaded = now;
    return cachedConfig;
}

function getConfigValue<T>(config: WebhookConfig, key: keyof WebhookConfig, envKey: string, fallback: T): T {
    const val = config[key];
    if (val !== undefined && val !== "") return val as T;
    return (process.env[envKey] as T) || fallback;
}

const AI_PROVIDERS: ReadonlySet<string> = new Set([
    "openai",
    "anthropic",
    "gemini",
    "cloudflare",
]);

function getAIConfig(config: WebhookConfig): {
    provider: AIProvider;
    apiKey: string;
    accountId?: string;
    model?: string;
    baseUrl?: string;
} | undefined {
    const provider = getConfigValue(config, "aiProvider", "AI_PROVIDER", "");
    if (!AI_PROVIDERS.has(provider)) {
        return undefined;
    }

    const typedProvider = provider as AIProvider;
    const apiKeyEnv =
        typedProvider === "cloudflare"
            ? "CLOUDFLARE_API_TOKEN"
            : typedProvider === "gemini"
              ? "GEMINI_API_KEY"
              : "AI_API_KEY";
    const apiKey = getConfigValue(config, "aiApiKey", apiKeyEnv, "");
    const modelEnv =
        typedProvider === "cloudflare"
            ? "CLOUDFLARE_AI_MODEL"
            : typedProvider === "gemini"
              ? "GEMINI_MODEL"
              : "AI_MODEL";
    const model = config.aiModel || process.env[modelEnv] || "";
    const accountId =
        typedProvider === "cloudflare"
            ? getConfigValue(
                  config,
                  "cloudflareAccountId",
                  "CLOUDFLARE_ACCOUNT_ID",
                  "",
              )
            : undefined;

    if (!apiKey || (typedProvider === "cloudflare" && !accountId)) {
        return undefined;
    }

    // Custom endpoints only make sense for the OpenAI-compatible path
    // (local Ollama, proxies); other providers have fixed endpoints.
    const baseUrl =
        typedProvider === "openai"
            ? getConfigValue(config, "aiBaseUrl", "AI_BASE_URL", "") ||
              undefined
            : undefined;

    return {
        provider: typedProvider,
        apiKey,
        accountId,
        model: model || undefined,
        baseUrl,
    };
}

/**
 * Confidence is 0-100 (see calculateConfidence in driftDetector).
 * Older configs stored 0.7 meaning 70 — normalize fractions to percent
 * so a stale `CONFIDENCE_THRESHOLD=0.7` doesn't disable filtering.
 */
export function normalizeThreshold(raw: unknown): number {
    const num = typeof raw === "string" ? parseFloat(raw) : (raw as number);
    if (!Number.isFinite(num)) return 0;
    if (num > 0 && num <= 1) return Math.round(num * 100);
    return Math.max(0, Math.min(100, Math.round(num)));
}

/**
 * DB-backed SchemaStore for inbound baselines. InMemorySchemaStore loses
 * all baselines on restart, so the first post-restart payload silently
 * re-baselines and drift is missed. DbSchemaStore persists to
 * webhook_schemas; on any DB failure we fall back to memory so capture
 * keeps working in dev without DATABASE_URL.
 *
 * Note: webhook_schemas.endpointId is a FK to webhook_endpoints.id, while
 * capture uses vendor strings ("stripe"). We resolve each vendor to an
 * endpoint UUID via ensureEndpoint and store under that.
 */
class PersistentCaptureStore implements SchemaStore {
    private readonly db = new DbSchemaStore();
    private readonly memory = new InMemorySchemaStore();
    private readonly ids = new Map<string, string>();

    private async resolveId(vendor: string): Promise<string> {
        const cached = this.ids.get(vendor);
        if (cached) return cached;
        const id = await this.db.ensureEndpoint(vendor, `capture:${vendor}`);
        this.ids.set(vendor, id);
        return id;
    }

    async load(endpointId: string, eventType: string): Promise<FlatSchema | null> {
        try {
            const id = await this.resolveId(endpointId);
            return await this.db.load(id, eventType);
        } catch {
            return this.memory.load(endpointId, eventType);
        }
    }

    async save(endpointId: string, eventType: string, schema: FlatSchema): Promise<void> {
        // Always keep memory in sync so reads survive transient DB errors
        // and rollback history has depth (DB row is upserted, history=1).
        await this.memory.save(endpointId, eventType, schema);
        try {
            const id = await this.resolveId(endpointId);
            await this.db.save(id, eventType, schema);
        } catch (e) {
            console.warn(`[STORE] DB save failed, memory only:`, e);
        }
    }

    async listEventTypes(endpointId: string): Promise<string[]> {
        try {
            const id = await this.resolveId(endpointId);
            const fromDb = await this.db.listEventTypes(id);
            if (fromDb.length > 0) return fromDb;
        } catch {
            // fall through to memory
        }
        return this.memory.listEventTypes(endpointId);
    }

    async getHistory(endpointId: string, eventType: string, limit = 10): Promise<SchemaSnapshot[]> {
        // Memory keeps up to 50 entries; DB keeps one row per
        // endpoint+event (upsert), so prefer memory for rollback detection.
        const mem = await this.memory.getHistory(endpointId, eventType, limit);
        if (mem.length > 0) return mem;
        try {
            const id = await this.resolveId(endpointId);
            const fromDb = await this.db.getHistory(id, eventType, limit);
            // Re-key to the vendor string callers expect
            return fromDb.map((s) => ({ ...s, endpointId }));
        } catch {
            return [];
        }
    }

    async recordDrift(params: {
        endpointId: string;
        eventType: string;
        diff: unknown;
        previousSchema: FlatSchema;
        currentSchema: FlatSchema;
    }): Promise<string | null> {
        try {
            const id = await this.resolveId(params.endpointId);
            return await this.db.recordDrift({
                endpointId: id,
                eventType: params.eventType,
                diff: params.diff,
                previousSchema: params.previousSchema,
                currentSchema: params.currentSchema,
            });
        } catch (e) {
            console.warn(`[STORE] recordDrift failed:`, e);
            return null;
        }
    }

    async markDrift(id: string | null, status: "pr_opened" | "merged" | "false_positive"): Promise<void> {
        if (!id) return;
        try {
            await this.db.updateDriftStatus(id, status);
            console.log(`[EVENT] type=${status === "pr_opened" ? "pr_opened" : status === "merged" ? "pr_merged" : "false_positive"} ${JSON.stringify({ driftId: id })}`);
        } catch (e) {
            console.warn(`[STORE] markDrift failed:`, e);
        }
    }
}

const store = new PersistentCaptureStore();

// eslint-disable-next-line @typescript-eslint/no-unused-vars
let _detectorResolved = false;
let resolveDetectorPromise: (det: DriftDetector) => void;
const detectorReady = new Promise<DriftDetector>((resolve) => {
    resolveDetectorPromise = resolve;
});

async function initDetector() {
    const config = await loadConfig();
    const rawThreshold = getConfigValue(config, "confidenceThreshold", "CONFIDENCE_THRESHOLD", 0);
    const threshold = normalizeThreshold(rawThreshold);
    const det = new DriftDetector(store, threshold);
    setupDetectorCallbacks(det);
    resolveDetectorPromise(det);
    _detectorResolved = true;
}

// Init lazily on first request, not at module load
let initPromise: Promise<void> | null = null;
function ensureInit() {
    if (!initPromise) {
        initPromise = initDetector();
    }
    return initPromise;
}

function setupDetectorCallbacks(det: DriftDetector) {
    det.onDrift(async (alert: DriftAlert) => {
        const config = await loadConfig();
        console.log(
            `[DRIFT] endpoint=${alert.endpointId} event=${alert.eventType} confidence=${alert.confidence}`,
        );
        console.log(`  added:    ${alert.diff.added.join(", ") || "(none)"}`);
        console.log(`  removed:  ${alert.diff.removed.join(", ") || "(none)"}`);
        console.log(
            `  changed:  ${alert.diff.typeChanged.map((c) => `${c.field}: ${c.from}→${c.to}`).join(", ") || "(none)"}`,
        );

        // Persist drift for measurement (PR opened/merged rates, precision).
        // Best effort: capture must not fail if the drifts table is down.
        // recordDrift itself emits drift_detected.
        const driftRowId = await store
            .recordDrift({
                endpointId: alert.endpointId,
                eventType: alert.eventType,
                diff: alert.diff,
                previousSchema: alert.previous,
                currentSchema: alert.current,
            })
            .catch((e) => {
                console.warn(`[STORE] recordDrift skipped:`, e);
                return null;
            });

        const githubToken = getConfigValue(config, "githubToken", "GITHUB_TOKEN", "");
        const repoPath = getConfigValue(config, "repoPath", "WEBHOOK_REPO_PATH", "");
        const repoOwner = getConfigValue(config, "repoOwner", "WEBHOOK_OWNER", "");
        const repoName = getConfigValue(config, "repoName", "WEBHOOK_REPO", "");
        const base = process.env.WEBHOOK_BASE || "main";
        const ai = getAIConfig(config);

        if (!githubToken || !repoPath || !repoOwner || !repoName) {
            console.log("  [SKIP] Missing GitHub config — PR not created");
            return;
        }

        try {
            // Severity routes to the cheapest sufficient path: breaking drift
            // gets the agent (deterministic fallback), warnings take the
            // deterministic fixer without a model loop, and pure additions
            // open nothing.
            const severity = severityForSchemaDiff(alert.diff);
            const deps = resolveAgentFixDeps(ai, alert.endpointId);
            const route = routeBySeverity(severity, deps !== null);
            if (route === "none") {
                console.log(
                    `  [SKIP] info-only drift (${severity}), no reader can break; no PR opened`,
                );
                return;
            }
            // Agent path when a model client and a vendor config both resolve;
            // otherwise the deterministic fixer below. The agent edits,
            // verifies, clears the contract gate, and publishes.
            if (route === "agent" && deps) {
                const result = await createAgentFixPR({
                    owner: repoOwner,
                    repo: repoName,
                    base,
                    repoPath,
                    alert,
                    token: githubToken,
                    vendor: deps.vendor,
                    client: deps.client,
                    model: deps.model,
                    onEvent: (event) => {
                        if (event.type === "note") {
                            console.log(`  [AGENT] ${event.message}`);
                        }
                    },
                });

                if (result.status === "opened") {
                    console.log(`  [PR] Created: ${result.url}`);
                    await store.markDrift(driftRowId, "pr_opened");
                } else if (result.status === "already_open") {
                    console.log(`  [PR] Already open: ${result.url}`);
                    await store.markDrift(driftRowId, "pr_opened");
                } else {
                    console.log(`  [PR] ${result.status} (outcome: ${result.outcome})`);
                }
                return;
            }

            const result = await createWebhookFixPR({
                owner: repoOwner,
                repo: repoName,
                base,
                repoPath,
                alert,
                token: githubToken,
                ai,
            });

            if (result.status === "opened") {
                console.log(`  [PR] Created: ${result.url}`);
                await store.markDrift(driftRowId, "pr_opened");
            } else if (result.status === "already_open") {
                console.log(`  [PR] Already open: ${result.url}`);
                await store.markDrift(driftRowId, "pr_opened");
            } else {
                console.log(`  [PR] ${result.status}`);
            }
        } catch (error) {
            console.error(`  [PR] Failed to create PR:`, error);
        }
    });

    det.onRollback(async (alert: RollbackAlert) => {
        const config = await loadConfig();
        console.log(
            `[ROLLBACK] endpoint=${alert.endpointId} event=${alert.eventType}`,
        );
        console.log(`  reverted from schema at ${alert.driftedAt.toISOString()}`);
        console.log(`  current schema matches previous baseline`);

        const githubToken = getConfigValue(config, "githubToken", "GITHUB_TOKEN", "");
        const repoPath = getConfigValue(config, "repoPath", "WEBHOOK_REPO_PATH", "");
        const repoOwner = getConfigValue(config, "repoOwner", "WEBHOOK_OWNER", "");
        const repoName = getConfigValue(config, "repoName", "WEBHOOK_REPO", "");
        const base = process.env.WEBHOOK_BASE || "main";
        const ai = getAIConfig(config);

        if (!githubToken || !repoPath || !repoOwner || !repoName) {
            console.log("  [SKIP] Missing config — rollback PR not created");
            return;
        }

        try {
            const result = await createWebhookFixPR({
                owner: repoOwner,
                repo: repoName,
                base,
                repoPath,
                alert: {
                    endpointId: alert.endpointId,
                    eventType: alert.eventType,
                    diff: {
                        added: Object.keys(alert.revertedTo).filter(
                            (k) => !(k in alert.revertedFrom),
                        ),
                        removed: Object.keys(alert.revertedFrom).filter(
                            (k) => !(k in alert.revertedTo),
                        ),
                        typeChanged: [],
                    },
                    previous: alert.revertedFrom,
                    current: alert.revertedTo,
                    detectedAt: alert.detectedAt,
                    confidence: 100,
                },
                token: githubToken,
                ai,
            });

            if (result.status === "opened") {
                console.log(`  [PR] Rollback PR created: ${result.url}`);
            } else {
                console.log(`  [PR] ${result.status}`);
            }
        } catch (error) {
            console.error(`  [PR] Failed to create rollback PR:`, error);
        }
    });
}

const FORWARD_SECRET = process.env.WEBHOOK_FORWARD_SECRET || "";
const FORWARD_TIMEOUT = parseInt(process.env.WEBHOOK_FORWARD_TIMEOUT || "5000", 10);

async function forwardPayload(
    forwardUrl: string,
    endpointId: string,
    eventType: string,
    body: Record<string, unknown>,
    _headers: Record<string, string>,
): Promise<{ ok: boolean; status: number; elapsed: number }> {
    if (!forwardUrl) {
        return { ok: false, status: 0, elapsed: 0 };
    }

    const start = Date.now();
    try {
        const forwardHeaders: Record<string, string> = {
            "content-type": "application/json",
            "x-driftlock-endpoint": endpointId,
            "x-driftlock-event": eventType,
            "x-driftlock-forwarded": "true",
        };

        if (FORWARD_SECRET) {
            forwardHeaders["x-webhook-secret"] = FORWARD_SECRET;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FORWARD_TIMEOUT);

        const res = await fetch(forwardUrl, {
            method: "POST",
            headers: forwardHeaders,
            body: JSON.stringify(body),
            signal: controller.signal,
        });

        clearTimeout(timeout);
        const elapsed = Date.now() - start;
        return { ok: res.ok, status: res.status, elapsed };
    } catch (err) {
        const elapsed = Date.now() - start;
        console.error(`  [FORWARD] Failed to ${forwardUrl}:`, err);
        return { ok: false, status: 0, elapsed };
    }
}

export function createCaptureHandler() {
    return async (req: Request): Promise<Response> => {
        if (req.method !== "POST") {
            return json({ error: "Method not allowed" }, 405);
        }

        const url = new URL(req.url);
        const segments = url.pathname.split("/").filter(Boolean);
        const endpointId = segments[segments.length - 1];

        if (!endpointId) {
            return json({ error: "Missing endpoint ID" }, 400);
        }

        // Raw body first: HMAC verification must run over the exact bytes.
        let rawBody: string;
        try {
            rawBody = await req.text();
        } catch {
            return json({ error: "Unable to read body" }, 400);
        }

        const config = await loadConfig();
        const secrets = parseCaptureSecrets(
            getConfigValue(config, "captureSecrets", "CAPTURE_SECRETS", ""),
        );
        const secret = secrets.get(endpointId);
        if (secret) {
            const check = verifyCaptureSignature({ rawBody, headers: req.headers, secret });
            if (!check.ok) {
                console.warn(
                    `[SECURITY] Rejected unsigned/invalid capture for endpoint=${endpointId} reason=${check.reason}`,
                );
                return json({ error: "Invalid signature" }, 401);
            }
        } else {
            console.warn(
                `No CAPTURE_SECRETS entry for endpoint=${endpointId}. Accepting unsigned payload (set CAPTURE_SECRETS in prod)`,
            );
        }

        let body: Record<string, unknown>;
        try {
            body = JSON.parse(rawBody) as Record<string, unknown>;
        } catch {
            return json({ error: "Body must be JSON" }, 400);
        }

        const eventType =
            (body.type as string) ??
            req.headers.get("x-webhook-event") ??
            req.headers.get("x-github-event") ??
            "__default__";

        const forwardUrl = getConfigValue(config, "forwardUrl", "WEBHOOK_FORWARD_URL", "");

        await ensureInit();
        const det = await detectorReady;
        const alert = await det.processPayload(
            endpointId,
            eventType,
            body,
        );

        let forwardResult = null;
        if (forwardUrl) {
            const headerObj: Record<string, string> = {};
            req.headers.forEach((value, key) => {
                headerObj[key] = value;
            });
            forwardResult = await forwardPayload(forwardUrl, endpointId, eventType, body, headerObj);
        }

        if (alert) {
            const diff = "diff" in alert ? alert.diff : { added: [], removed: [], typeChanged: [] };
            return json({
                status: "drift_detected",
                endpointId,
                eventType,
                diff,
                pr: "pending",
                forward: forwardResult,
            });
        }

        return json({
            status: "ok",
            endpointId,
            eventType,
            message: "Schema baseline recorded or unchanged",
            forward: forwardResult,
        });
    };
}
