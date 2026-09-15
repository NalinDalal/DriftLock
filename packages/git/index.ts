import simpleGit, { SimpleGit, StatusResult } from "simple-git";
import { CallSite } from "@driftlock/core";

export { PRGenerator } from "./prGenerator";
export type { PRResult, PRMetadata } from "./prGenerator";

export interface ChangeDetection {
    added: string[];
    modified: string[];
    deleted: string[];
    renamed: Array<{ from: string; to: string }>;
}

export interface CallSiteChange {
    filePath: string;
    type: "added" | "modified" | "deleted";
    callSites: CallSite[];
    oldCallSites?: CallSite[];
}

export class GitTracker {
    private git: SimpleGit;

    constructor(repoPath: string) {
        this.git = simpleGit(repoPath);
    }

    async getStatus(): Promise<StatusResult> {
        return this.git.status();
    }

    async getDiff(baseBranch?: string): Promise<string> {
        const branch = baseBranch || "main";
        return this.git.diff([branch, "--name-status"]);
    }

    async detectChanges(baseBranch?: string): Promise<ChangeDetection> {
        if (baseBranch !== undefined) {
            if (
                !baseBranch ||
                baseBranch.startsWith("-") ||
                baseBranch.includes("\0")
            ) {
                throw new Error("Invalid base ref");
            }
            const commit = (
                await this.git.raw([
                    "rev-parse",
                    "--verify",
                    "--end-of-options",
                    `${baseBranch}^{commit}`,
                ])
            ).trim();
            if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(commit)) {
                throw new Error("Invalid base commit");
            }

            // Compare the tracked working tree (including staged changes) to the base.
            const diff = await this.git.raw([
                "diff",
                "--name-status",
                "-z",
                "--find-renames",
                commit,
                "--",
            ]);
            const changes: ChangeDetection = {
                added: [],
                modified: [],
                deleted: [],
                renamed: [],
            };
            const fields = diff.split("\0");
            for (let i = 0; i < fields.length - 1; ) {
                const status = fields[i++];
                const path = fields[i++];
                switch (status[0]) {
                    case "A":
                        changes.added.push(path);
                        break;
                    case "M":
                    case "T":
                        changes.modified.push(path);
                        break;
                    case "D":
                        changes.deleted.push(path);
                        break;
                    case "C":
                        changes.added.push(fields[i++]);
                        break;
                    case "R":
                        changes.renamed.push({ from: path, to: fields[i++] });
                        break;
                    default:
                        throw new Error(`Unsupported diff status: ${status}`);
                }
            }
            return changes;
        }

        const status = await this.git.status();

        return {
            added: status.not_added,
            modified: status.modified,
            deleted: status.deleted,
            renamed: status.renamed.map((r) => ({
                from: r.from,
                to: r.to,
            })),
        };
    }

    async getCallSiteChanges(callSites: CallSite[]): Promise<CallSiteChange[]> {
        const changes = await this.detectChanges();
        const callSiteChanges: CallSiteChange[] = [];

        // Check added files
        for (const file of changes.added) {
            const fileCallSites = callSites.filter(
                (cs) => cs.filePath === file,
            );
            if (fileCallSites.length > 0) {
                callSiteChanges.push({
                    filePath: file,
                    type: "added",
                    callSites: fileCallSites,
                });
            }
        }

        // Check modified files
        for (const file of changes.modified) {
            const fileCallSites = callSites.filter(
                (cs) => cs.filePath === file,
            );
            if (fileCallSites.length > 0) {
                callSiteChanges.push({
                    filePath: file,
                    type: "modified",
                    callSites: fileCallSites,
                    oldCallSites: fileCallSites, // Would need to compare with previous version
                });
            }
        }

        // Check deleted files
        for (const file of changes.deleted) {
            const fileCallSites = callSites.filter(
                (cs) => cs.filePath === file,
            );
            if (fileCallSites.length > 0) {
                callSiteChanges.push({
                    filePath: file,
                    type: "deleted",
                    callSites: [],
                    oldCallSites: fileCallSites,
                });
            }
        }

        return callSiteChanges;
    }

    async createBranch(branchName: string): Promise<void> {
        await this.git.checkoutLocalBranch(branchName);
    }

    async commit(message: string, files?: string[]): Promise<void> {
        if (files && files.length > 0) {
            await this.git.add(files);
        } else {
            await this.git.add(".");
        }
        await this.git.commit(message);
    }

    async push(branchName: string): Promise<void> {
        await this.git.push("origin", branchName);
    }

    async merge(branchName: string): Promise<void> {
        await this.git.merge([branchName]);
    }

    async deleteBranch(branchName: string): Promise<void> {
        await this.git.deleteLocalBranch(branchName);
    }

    async getCurrentBranch(): Promise<string> {
        const status = await this.git.status();
        return status.current || "main";
    }

    async getCommitHistory(limit: number = 10): Promise<
        Array<{
            hash: string;
            message: string;
            date: string;
            author: string;
        }>
    > {
        const log = await this.git.log({ maxCount: limit });
        return log.all.map((commit) => ({
            hash: commit.hash,
            message: commit.message,
            date: commit.date,
            author: commit.author_name,
        }));
    }
}
