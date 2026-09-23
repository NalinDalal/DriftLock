import { Octokit } from "octokit";
import type { CallSite, DriftEvent, Fix } from "@driftlock/core";

export interface WriteFile {
    path: string;
    content: string;
}

export interface WriteFixPRInput {
    owner: string;
    repo: string;
    base: string;
    branch: string;
    title: string;
    body: string;
    commitMessage: string;
    files: WriteFile[];
    octokit: Octokit;
}

export interface WordlessPRResult {
    url: string;
    number: number;
    branch: string;
    commitSha: string;
}

const FILE_MODE = "100644";

export class PRWriter {
    private octokit: Octokit;

    constructor(octokit: Octokit) {
        this.octokit = octokit;
    }

    /**
     * Create a fix PR without a local checkout: tarball-style input becomes a
     * single wordless commit via the Git Database API (blobs -> tree -> commit
     * -> ref -> PR). Unchanged files keep their blob SHAs via base_tree, so the
     * commit is a pure delta on top of the base branch.
     */
    async writeFixPR(input: WriteFixPRInput): Promise<WordlessPRResult> {
        const { owner, repo, base, branch, files } = input;

        if (files.length === 0) {
            throw new Error("Cannot open a fix PR with no file changes");
        }

        const baseCommit = await this.resolveHead(owner, repo, base);
        const blobs = await Promise.all(
            files.map(async (file) => {
                const { data } = await this.octokit.rest.git.createBlob({
                    owner,
                    repo,
                    content: file.content,
                    encoding: "utf-8",
                });
                return { file, sha: data.sha };
            }),
        );

        const { data: tree } = await this.octokit.rest.git.createTree({
            owner,
            repo,
            base_tree: baseCommit.treeSha,
            tree: blobs.map(({ file, sha }) => ({
                path: file.path,
                mode: FILE_MODE,
                type: "blob",
                sha,
            })),
        });

        const { data: commit } = await this.octokit.rest.git.createCommit({
            owner,
            repo,
            message: input.commitMessage,
            tree: tree.sha,
            parents: [baseCommit.commitSha],
        });

        await this.setBranchRef(owner, repo, branch, commit.sha);

        const { data: pr } = await this.octokit.rest.pulls.create({
            owner,
            repo,
            title: input.title,
            body: input.body,
            head: branch,
            base,
        });

        return {
            url: pr.html_url,
            number: pr.number,
            branch,
            commitSha: commit.sha,
        };
    }

    private async resolveHead(
        owner: string,
        repo: string,
        base: string,
    ): Promise<{ commitSha: string; treeSha: string }> {
        const { data: ref } = await this.octokit.rest.git.getRef({
            owner,
            repo,
            ref: `heads/${base}`,
        });
        const { data: commit } = await this.octokit.rest.git.getCommit({
            owner,
            repo,
            commit_sha: ref.object.sha,
        });
        return { commitSha: commit.sha, treeSha: commit.tree.sha };
    }

    /**
     * Create the branch if missing; otherwise fast-forward it to the new
     * commit so re-running the same migration re-generates the branch in
     * place (force-push semantics for the bot branch).
     */
    private async setBranchRef(
        owner: string,
        repo: string,
        branch: string,
        sha: string,
    ): Promise<void> {
        try {
            await this.octokit.rest.git.getRef({
                owner,
                repo,
                ref: `heads/${branch}`,
            });
            await this.octokit.rest.git.updateRef({
                owner,
                repo,
                ref: `heads/${branch}`,
                sha,
                force: true,
            });
        } catch {
            await this.octokit.rest.git.createRef({
                owner,
                repo,
                ref: `refs/heads/${branch}`,
                sha,
            });
        }
    }
}

export interface FixPRMetadata {
    driftEvent: DriftEvent;
    callSite: CallSite;
    fix: Fix;
}

/** Stable bot branch name for one call site, so scheduled runs reuse it. */
export function fixBranchName(callSiteId: string): string {
    return `driftlock/fix-${callSiteId.slice(0, 8)}`;
}

/** PR title from a detected fix. */
export function buildFixPRTitle(metadata: FixPRMetadata): string {
    const { fix, callSite } = metadata;
    const action =
        fix.type === "field_rename"
            ? "Rename"
            : fix.type === "type_coercion"
              ? "Update type for"
              : "Fix";
    return `driftlock: ${action} ${callSite.method} in ${callSite.filePath}`;
}

/** PR body: what changed, where, confidence, and the files touched. */
export function buildFixPRBody(
    metadata: FixPRMetadata,
    files: Array<{ path: string }>,
): string {
    const { driftEvent, callSite, fix } = metadata;
    const confidenceEmoji =
        driftEvent.confidence === "high"
            ? "🟢"
            : driftEvent.confidence === "medium"
              ? "🟡"
              : "🔴";

    return `## DriftLock Fix

### What changed
${fix.description}

### Affected call site
- **File:** \`${callSite.filePath}:${callSite.line}\`
- **Method:** \`${callSite.method}\`
- **Endpoint:** \`${callSite.endpoint ?? "pending-capture"}\`
- **HTTP Method:** ${callSite.httpMethod ?? "unknown"}

### Confidence
${confidenceEmoji} ${driftEvent.confidence.toUpperCase()}

### Diff
\`\`\`diff
${fix.diff}
\`\`\`

### Files changed
${files.map((f) => `- \`${f.path}\``).join("\n")}

---
*Generated by [DriftLock](https://github.com/nerdev-co/DriftLock). Self-maintaining APIs.*`;
}

export type FixPRStatus = "opened" | "already_open" | "merged";

export interface FixPRResult {
    status: FixPRStatus;
    url: string;
    number: number;
    branch: string;
}

/**
 * Idempotent fix-PR scheduler for scheduled runs. One open PR per call site:
 * a second run sees the existing open PR and does nothing new; a merged PR
 * reports "merged" so the caller can rebaseline the snapshot; a closed PR's
 * branch is force-rebased by PRWriter and a fresh PR is opened.
 */
export class FixPRRunner {
    private octokit: Octokit;

    constructor(token: string);
    constructor(octokit: Octokit);
    constructor(tokenOrOctokit: string | Octokit) {
        this.octokit =
            typeof tokenOrOctokit === "string"
                ? new Octokit({ auth: tokenOrOctokit })
                : tokenOrOctokit;
    }

    async run(input: Omit<WriteFixPRInput, "octokit">): Promise<FixPRResult> {
        const { owner, repo, base, branch } = input;
        const existing = await this.findOpenOrMerged(
            owner,
            repo,
            branch,
            base,
        );
        if (existing?.status === "open") {
            return {
                status: "already_open",
                url: existing.url,
                number: existing.number,
                branch,
            };
        }
        if (existing?.status === "merged") {
            await this.deleteBranchIfExists(owner, repo, branch);
            return {
                status: "merged",
                url: existing.url,
                number: existing.number,
                branch,
            };
        }

        const writer = new PRWriter(this.octokit);
        const created = await writer.writeFixPR({
            ...input,
            octokit: this.octokit,
        });
        return {
            status: "opened",
            url: created.url,
            number: created.number,
            branch: created.branch,
        };
    }

    private async deleteBranchIfExists(
        owner: string,
        repo: string,
        branch: string,
    ): Promise<void> {
        try {
            await this.octokit.rest.git.deleteRef({
                owner,
                repo,
                ref: `heads/${branch}`,
            });
        } catch {
            // Already gone (deleted on merge) or not deletable; best effort.
        }
    }

    private async findOpenOrMerged(
        owner: string,
        repo: string,
        branch: string,
        base: string,
    ): Promise<{ status: "open" | "merged"; url: string; number: number } | null> {
        let prs: Awaited<ReturnType<typeof this.octokit.rest.pulls.list>>["data"];
        try {
            const { data } = await this.octokit.rest.pulls.list({
                owner,
                repo,
                state: "all",
                head: `${owner}:${branch}`,
                base,
                per_page: 10,
                sort: "updated",
                direction: "desc",
            });
            prs = data;
        } catch {
            const { data } = await this.octokit.rest.pulls.list({
                owner,
                repo,
                state: "all",
                head: branch,
                base,
                per_page: 10,
                sort: "updated",
                direction: "desc",
            });
            prs = data;
        }

        for (const pr of prs) {
            if (pr.state === "open") {
                return { status: "open", url: pr.html_url, number: pr.number };
            }
            if (pr.merged_at) {
                return { status: "merged", url: pr.html_url, number: pr.number };
            }
        }
        return null;
    }
}