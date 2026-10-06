// FileSnapshotStore re-exported below — import not needed
import { execFileSync } from "child_process";

export {
    applyDriftFix,
    buildDriftEvent,
    buildDriftResult,
    driftConfidence,
    driftSummary,
    extractShapesFromCaptures,
} from "@driftlock/pipeline";
export type {
    CapturedShapes,
    DriftResult,
    DriftOverrides,
} from "@driftlock/pipeline";
export { FileSnapshotStore as SnapshotStore } from "@driftlock/pipeline";

function git(repoPath: string, args: string[]): string {
    return execFileSync("git", args, { cwd: repoPath, encoding: "utf8" }).trim();
}

/**
 * Commit locally-changed `.driftlock/` baselines and push them to the base
 * branch so the next scheduled run compares instead of re-baselining.
 * Without this, ephemeral CI checkouts lose every snapshot at job end and
 * drift is never detected. No-op when nothing changed. Push failures warn
 * (detection already happened) but report false so the summary is honest.
 */
export async function commitBaselines(
    repoPath: string,
    base: string,
): Promise<{ committed: boolean; pushed: boolean }> {
    const idle = { committed: false, pushed: false };
    let status: string;
    try {
        status = git(repoPath, ["status", "--porcelain", "--", ".driftlock"]);
    } catch {
        return idle;
    }
    if (!status) return idle;
    try {
        // Identity travels per-command (-c), never written to the repo's
        // local config: this code runs in customer checkouts that are not
        // ours to modify.
        const identity = [
            "-c",
            "user.name=driftlock[bot]",
            "-c",
            "user.email=driftlock[bot]@driftlock.dev",
        ];
        git(repoPath, ["add", "--", ".driftlock"]);
        // Nothing to commit (raced with another run) is fine, not an error.
        try {
            git(repoPath, [...identity, "commit", "-m", "driftlock: update API baselines"]);
        } catch {
            return { committed: false, pushed: false };
        }
        try {
            git(repoPath, ["pull", "--ff-only", "origin", base]);
        } catch {
            // No remote, offline, or diverged (another run pushed first):
            // never rebase or rewrite history in automation. The commit
            // persists locally; the push below either fast-forwards or
            // warns, and the next tick retries.
        }
        try {
            git(repoPath, ["push", "origin", `HEAD:${base}`]);
        } catch (error) {
            console.warn(
                `driftlock: baselines committed locally but push failed (${(error as Error).message.split("\n")[0]}). Next scheduled run may re-baseline.`,
            );
            return { committed: true, pushed: false };
        }
        return { committed: true, pushed: true };
    } catch (error) {
        console.warn(`driftlock: baseline commit failed: ${(error as Error).message.split("\n")[0]}`);
        return idle;
    }
}