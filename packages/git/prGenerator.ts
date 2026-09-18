import { Octokit } from "octokit";
import { DriftEvent, CallSite, Fix } from "@driftlock/core";
import { buildFixPRBody, buildFixPRTitle, fixBranchName } from "./prWriter";

export interface PRResult {
    url: string;
    number: number;
    branch: string;
}

export interface PRMetadata {
    driftEvent: DriftEvent;
    callSite: CallSite;
    fix: Fix;
    files: Array<{ path: string; changes: string }>;
}

export class PRGenerator {
    private octokit: Octokit;

    constructor(githubToken: string, octokit?: Octokit) {
        this.octokit = octokit ?? new Octokit({ auth: githubToken });
    }

    async createFixPR(
        owner: string,
        repo: string,
        metadata: PRMetadata,
        baseBranch: string = "main"
    ): Promise<PRResult> {
        const branchName = fixBranchName(metadata.callSite.id);

        const title = this.generateTitle(metadata);
        const body = this.generateBody(metadata);

        // Create branch
        const { data: baseRef } = await this.octokit.rest.git.getRef({
            owner,
            repo,
            ref: `heads/${baseBranch}`,
        });

        await this.octokit.rest.git.createRef({
            owner,
            repo,
            ref: `refs/heads/${branchName}`,
            sha: baseRef.object.sha,
        });

        // Apply file changes
        for (const file of metadata.files) {
            await this.updateFile(
                owner,
                repo,
                branchName,
                file.path,
                file.changes
            );
        }

        // Create PR
        const { data: pr } = await this.octokit.rest.pulls.create({
            owner,
            repo,
            title,
            body,
            head: branchName,
            base: baseBranch,
        });

        return {
            url: pr.html_url,
            number: pr.number,
            branch: branchName,
        };
    }

    private generateTitle(metadata: PRMetadata): string {
        const { driftEvent, callSite, fix } = metadata;
        return buildFixPRTitle({ driftEvent, callSite, fix });
    }

    private generateBody(metadata: PRMetadata): string {
        const { driftEvent, callSite, fix } = metadata;
        return buildFixPRBody(
            { driftEvent, callSite, fix },
            metadata.files.map((f) => ({ path: f.path })),
        );
    }

    private async updateFile(
        owner: string,
        repo: string,
        branch: string,
        path: string,
        content: string
    ): Promise<void> {
        // Try to get existing file
        let sha: string | undefined;
        try {
            const { data } = await this.octokit.rest.repos.getContent({
                owner,
                repo,
                path,
                ref: branch,
            });
            if ("sha" in data) {
                sha = data.sha;
            }
        } catch {
            // File doesn't exist yet
        }

        const params: any = {
            owner,
            repo,
            path,
            message: `driftlock: update ${path}`,
            content: Buffer.from(content).toString("base64"),
            branch,
        };

        if (sha) {
            params.sha = sha;
        }

        await this.octokit.rest.repos.createOrUpdateFileContents(params);
    }

    async addPRComment(
        owner: string,
        repo: string,
        prNumber: number,
        body: string
    ): Promise<void> {
        await this.octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: prNumber,
            body,
        });
    }
}
