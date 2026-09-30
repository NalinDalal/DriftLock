import { getStore } from "../store";
import { badRequest, json } from "../utils";

interface ReportedPR {
    url?: string;
    number?: number;
    status?: string;
    driftId?: string;
}

interface ReportBody {
    owner?: unknown;
    repo?: unknown;
    callSites?: unknown;
    drifts?: unknown;
    baselines?: unknown;
    prs?: unknown;
    durationMs?: unknown;
    exitCode?: unknown;
}

function asNonEmptyString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asCount(value: unknown): number | null {
    if (value === undefined) return 0;
    return typeof value === "number" && Number.isInteger(value) && value >= 0
        ? value
        : null;
}

function asReportedPRs(value: unknown): ReportedPR[] | null {
    if (value === undefined) return [];
    if (!Array.isArray(value)) return null;
    const out: ReportedPR[] = [];
    for (const entry of value) {
        if (typeof entry !== "object" || entry === null) return null;
        const pr = entry as Record<string, unknown>;
        out.push({
            url: typeof pr.url === "string" ? pr.url : undefined,
            number: typeof pr.number === "number" ? pr.number : undefined,
            status: typeof pr.status === "string" ? pr.status : undefined,
            driftId: typeof pr.driftId === "string" ? pr.driftId : undefined,
        });
    }
    return out;
}

/**
 * Lightweight run report for CI workflows. Unlike POST /api/runs (which
 * clones and analyzes server-side), this trusts the runner: detection and
 * PR creation already happened on GitHub Actions, and the workflow reports
 * counts for metering and the dashboard. Auth comes from dispatch-level
 * `authenticate`, so a valid dlk_ key (or operator token) is required.
 */
export async function handleReportRun(req: Request): Promise<Response> {
    let body: ReportBody;
    try {
        body = (await req.json()) as ReportBody;
    } catch {
        return badRequest("Body must be JSON");
    }

    const owner = asNonEmptyString(body.owner);
    const name = asNonEmptyString(body.repo);
    if (!owner || !name) {
        return badRequest("Body must include owner and repo");
    }
    const callSites = asCount(body.callSites);
    const drifts = asCount(body.drifts);
    const baselines = asCount(body.baselines);
    const prs = asReportedPRs(body.prs);
    const durationMs = asCount(body.durationMs);
    const exitCode = body.exitCode === undefined ? 0 : body.exitCode === 1 ? 1 : null;
    if (
        callSites === null ||
        drifts === null ||
        baselines === null ||
        prs === null ||
        durationMs === null ||
        exitCode === null
    ) {
        return badRequest(
            "Counts must be non-negative integers, prs an array, exitCode 0 or 1",
        );
    }

    const store = getStore();
    const repository = await store.ensureRepository({
        owner,
        name,
        fullName: `${owner}/${name}`,
    });
    const run = await store.recordRun({
        repositoryId: repository.id,
        status: "running",
    });
    const notes =
        `${callSites} call sites, ${drifts} drifts, ${prs.length} PRs, ` +
        `${baselines} baselines in ${durationMs}ms (reported by workflow)`;
    await store.finishRun({
        id: run.id,
        status: exitCode === 0 ? "succeeded" : "failed",
        exitCode,
        notes,
    });

    return json(
        {
            run: {
                id: run.id,
                status: exitCode === 0 ? "succeeded" : "failed",
                callSites,
                drifts,
                prs: prs.length,
                baselines,
            },
        },
        201,
    );
}
