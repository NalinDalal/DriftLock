import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join, relative } from "path";
import {
    analyzeAndCompare,
    applyDriftFix,
    DbSnapshotStore,
    driftConfidence,
    driftSummary,
} from "@driftlock/pipeline";
import { getStore } from "../store";
import { cloneRepo } from "../clone";
import { badRequest, json } from "../utils";

interface RunBody {
    owner?: unknown;
    repo?: unknown;
    command?: unknown;
    base?: unknown;
    forward?: unknown;
}

const ALLOWED_COMMAND_PREFIXES = [
    "npm test",
    "npm run test",
    "bun test",
    "bun run test",
    "yarn test",
    "pnpm test",
    "npx jest",
    "node --test",
] as const;

/**
 * Commands run inside the Docker sandbox on BE infra. Authenticated users
 * supply this value, so reject shell metachars and anything outside the
 * known test-runner prefixes (no `;`, `&&`, backticks, subshells, redirects).
 */
export function isAllowedTestCommand(command: string): boolean {
    const trimmed = command.trim();
    if (!trimmed || trimmed.length > 500) return false;
    // eslint-disable-next-line no-control-regex
    if (/[;&|`$()><\n\r\x00]/.test(trimmed)) return false;
    return ALLOWED_COMMAND_PREFIXES.some(
        (prefix) => trimmed === prefix || trimmed.startsWith(`${prefix} `) || trimmed.startsWith(`${prefix}--`),
    );
}

export async function handleRun(req: Request): Promise<Response> {
    let body: RunBody;
    try {
        body = (await req.json()) as RunBody;
    } catch {
        return badRequest("Body must be JSON");
    }
    const owner = typeof body.owner === "string" ? body.owner.trim() : "";
    const name = typeof body.repo === "string" ? body.repo.trim() : "";
    if (!owner || !name) {
        return badRequest("Body must include owner and repo");
    }
    const command =
        typeof body.command === "string" && body.command.trim()
            ? body.command.trim()
            : "npm test";
    if (!isAllowedTestCommand(command)) {
        return badRequest(
            "command must be a known test runner (npm/bun/yarn/pnpm test, npx jest, node --test) without shell operators",
        );
    }
    const forward = Array.isArray(body.forward)
        ? body.forward.filter(
              (entry): entry is string => typeof entry === "string",
          )
        : [];
    const base = typeof body.base === "string" ? body.base : undefined;

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

    const clone = await cloneRepo(owner, name, base);
    const toDbId = (id: string) => {
        if (id.length <= 64) return id;
        // Keep temporary checkout paths out of persistent identities.
        const stableId = id.startsWith(`${clone.path}/`)
            ? `${repository.id}:${id.slice(clone.path.length + 1)}`
            : id;
        return createHash("sha256").update(stableId, "utf8").digest("hex");
    };
    try {
        const snapshotStore = new DbSnapshotStore(store);
        const result = await analyzeAndCompare({
            repoPath: clone.path,
            command,
            forward,
            snapshotStore,
        });

        for (const callSite of result.callSites) {
            const shapes = result.shapes.get(callSite.id);
            const relPath = callSite.filePath.startsWith(clone.path)
                ? relative(clone.path, callSite.filePath)
                : callSite.filePath;
            const dbId = toDbId(callSite.id);
            await store.upsertCallSite(repository.id, {
                id: dbId,
                filePath: relPath,
                line: callSite.line,
                method: callSite.method,
                endpoint: callSite.endpoint ?? null,
                httpMethod: callSite.httpMethod ?? null,
                requestShape: shapes?.request ?? {},
                responseFields: callSite.responseFields,
                snapshotState: shapes ? "baseline" : "pending-capture",
            });
        }
        await store.deleteObsoleteCallSites(
            repository.id,
            result.callSites.map((site) => toDbId(site.id)),
        );

        const meta = {
            testCommand: command,
            exitCode: result.exitCode,
            duration: result.duration,
            trafficCaptured: result.trafficCaptured,
        };
        let driftCount = 0;
        for (const drift of result.drifts) {
            const current = result.shapes.get(drift.callSite.id);
            if (!current) {
                continue;
            }
            const dbCallSiteId = toDbId(drift.callSite.id);
            const previous = await store.getLatestSnapshot(dbCallSiteId);
            const saved = await store.saveSnapshot({
                callSiteId: dbCallSiteId,
                ...meta,
                requestShape: current.request,
                responseShape: current.response,
            });
            const source = readSource(clone.path, drift.callSite.filePath);
            const applied = source ? await applyDriftFix(drift, source) : null;
            const driftId = `drift-${dbCallSiteId}`.slice(0, 128);
            if (applied) {
                applied.fix.driftEventId = driftId;
            }
            await store.recordDrift({
                id: driftId,
                callSiteId: dbCallSiteId,
                oldSnapshotId: previous?.id ?? saved.id,
                newSnapshotId: saved.id,
                diffSummary: driftSummary(drift) as unknown as Record<
                    string,
                    unknown
                >,
                suggestedFix: applied?.fix ?? null,
                confidence: driftConfidence(drift),
                prNumber: null,
                status: "detected",
            });
            store.emitEvent?.("drift_detected", {
                driftId,
                repo: `${owner}/${name}`,
                callSiteId: dbCallSiteId,
                method: drift.callSite.method,
            });
            await store.setCallSiteSnapshotState(dbCallSiteId, "drifted");
            driftCount += 1;
        }

        await store.finishRun({
            id: run.id,
            status: result.exitCode === 0 ? "succeeded" : "failed",
            exitCode: result.exitCode,
            notes: `${result.callSites.length} call sites, ${driftCount} drifts`,
        });
        return json({
            run: {
                id: run.id,
                status: result.exitCode === 0 ? "succeeded" : "failed",
                callSites: result.callSites.length,
                drifts: driftCount,
                baselines: result.baselines.length,
                trafficCaptured: result.trafficCaptured,
            },
        });
    } catch (error) {
        await store.finishRun({
            id: run.id,
            status: "failed",
            exitCode: null,
            notes: error instanceof Error ? error.message : "run failed",
        });
        return json(
            {
                error: "Run failed",
                detail: error instanceof Error ? error.message : String(error),
            },
            500,
        );
    } finally {
        await clone.cleanup();
    }
}

function readSource(repoPath: string, filePath: string): string | null {
    try {
        const full = filePath.startsWith("/") ? filePath : join(repoPath, filePath);
        return readFileSync(full, "utf8");
    } catch {
        return null;
    }
}