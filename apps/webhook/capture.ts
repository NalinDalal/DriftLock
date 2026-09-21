import { InMemorySchemaStore, DriftDetector, createWebhookFixPR } from "@driftlock/webhook-capture";
import type { DriftAlert } from "@driftlock/webhook-capture";

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: { "content-type": "application/json" },
    });
}

const store = new InMemorySchemaStore();
const detector = new DriftDetector(store);

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const WEBHOOK_REPO_PATH = process.env.WEBHOOK_REPO_PATH || "";
const WEBHOOK_OWNER = process.env.WEBHOOK_OWNER || "";
const WEBHOOK_REPO = process.env.WEBHOOK_REPO || "";
const WEBHOOK_BASE = process.env.WEBHOOK_BASE || "main";
const AI_PROVIDER = process.env.AI_PROVIDER as "openai" | "anthropic" | undefined;
const AI_API_KEY = process.env.AI_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "";
const FORWARD_URL = process.env.WEBHOOK_FORWARD_URL || "";
const FORWARD_SECRET = process.env.WEBHOOK_FORWARD_SECRET || "";
const FORWARD_TIMEOUT = parseInt(process.env.WEBHOOK_FORWARD_TIMEOUT || "5000", 10);

async function forwardPayload(
    endpointId: string,
    eventType: string,
    body: Record<string, unknown>,
    headers: Record<string, string>,
): Promise<{ ok: boolean; status: number; elapsed: number }> {
    if (!FORWARD_URL) {
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

        const res = await fetch(FORWARD_URL, {
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
        console.error(`  [FORWARD] Failed to ${FORWARD_URL}:`, err);
        return { ok: false, status: 0, elapsed };
    }
}

detector.onDrift(async (alert: DriftAlert) => {
    console.log(
        `[DRIFT] endpoint=${alert.endpointId} event=${alert.eventType}`,
    );
    console.log(`  added:    ${alert.diff.added.join(", ") || "(none)"}`);
    console.log(`  removed:  ${alert.diff.removed.join(", ") || "(none)"}`);
    console.log(
        `  changed:  ${alert.diff.typeChanged.map((c) => `${c.field}: ${c.from}→${c.to}`).join(", ") || "(none)"}`,
    );

    if (!GITHUB_TOKEN || !WEBHOOK_REPO_PATH || !WEBHOOK_OWNER || !WEBHOOK_REPO) {
        console.log("  [SKIP] Missing GITHUB_TOKEN, WEBHOOK_REPO_PATH, WEBHOOK_OWNER, or WEBHOOK_REPO — PR not created");
        return;
    }

        try {
            const result = await createWebhookFixPR({
                owner: WEBHOOK_OWNER,
                repo: WEBHOOK_REPO,
                base: WEBHOOK_BASE,
                repoPath: WEBHOOK_REPO_PATH,
                alert,
                token: GITHUB_TOKEN,
                ai: AI_PROVIDER && AI_API_KEY
                    ? {
                          provider: AI_PROVIDER,
                          apiKey: AI_API_KEY,
                          model: AI_MODEL || undefined,
                      }
                    : undefined,
            });

        if (result.status === "opened") {
            console.log(`  [PR] Created: ${result.url}`);
        } else if (result.status === "already_open") {
            console.log(`  [PR] Already open: ${result.url}`);
        } else {
            console.log(`  [PR] ${result.status}`);
        }
    } catch (error) {
        console.error(`  [PR] Failed to create PR:`, error);
    }
});

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

        let body: Record<string, unknown>;
        try {
            body = (await req.json()) as Record<string, unknown>;
        } catch {
            return json({ error: "Body must be JSON" }, 400);
        }

        const eventType =
            (body.type as string) ??
            req.headers.get("x-webhook-event") ??
            req.headers.get("x-github-event") ??
            "__default__";

        const alert = await detector.processPayload(
            endpointId,
            eventType,
            body,
        );

        let forwardResult = null;
        if (FORWARD_URL) {
            const headerObj: Record<string, string> = {};
            req.headers.forEach((value, key) => {
                headerObj[key] = value;
            });
            forwardResult = await forwardPayload(endpointId, eventType, body, headerObj);
        }

        if (alert) {
            return json({
                status: "drift_detected",
                endpointId,
                eventType,
                diff: alert.diff,
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
