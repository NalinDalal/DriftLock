import { Octokit } from "octokit";

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