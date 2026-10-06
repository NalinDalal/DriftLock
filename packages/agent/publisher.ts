import { FixPRRunner } from "@driftlock/git";

export type PullRequestTarget = {
    owner: string;
    repo: string;
    base: string;
};

export type PublishFile = {
    path: string;
    content: string;
};

export type PublishInput = {
    target: PullRequestTarget;
    title: string;
    body: string;
    branch: string;
    files: PublishFile[];
    commitMessage: string;
    /** Open as a draft PR. The agent sets this when no contract gates the run. */
    draft?: boolean;
};

export type PullRequestInfo = {
    status: "opened" | "already_open" | "merged";
    url: string;
    number: number;
    branch: string;
};

export interface PullRequestPublisher {
    publish(input: PublishInput): Promise<PullRequestInfo>;
    /**
     * Post a follow-up comment on an opened PR (e.g. the automated review).
     * Optional so stub publishers in tests can ignore it. Callers must
     * treat comment failure as non-fatal: the PR already exists.
     */
    comment?(input: {
        target: PullRequestTarget;
        number: number;
        body: string;
    }): Promise<void>;
}

export const BRANCH_PREFIX = "driftlock/";

export function isAllowedBranch(branch: string): boolean {
    if (!branch.startsWith(BRANCH_PREFIX)) return false;
    const rest = branch.slice(BRANCH_PREFIX.length);
    if (!rest || rest.length > 80) return false;
    return /^[A-Za-z0-9._/-]+$/.test(rest) && !rest.includes("..");
}

export function commitMessageFor(input: {
    provider: string;
    fromVersion: string;
    toVersion: string;
}): string {
    return `driftlock: migrate ${input.provider} ${input.fromVersion} to ${input.toVersion}`;
}

export function createGitHubPublisher(
    tokenOrRunner: string | FixPRRunner,
): PullRequestPublisher {
    const runner =
        tokenOrRunner instanceof FixPRRunner
            ? tokenOrRunner
            : new FixPRRunner(tokenOrRunner);
    return {
        publish: async (input) => {
            const result = await runner.run({
                owner: input.target.owner,
                repo: input.target.repo,
                base: input.target.base,
                branch: input.branch,
                title: input.title,
                body: input.body,
                commitMessage: input.commitMessage,
                files: input.files,
                draft: input.draft,
            });
            return {
                status: result.status,
                url: result.url,
                number: result.number,
                branch: result.branch,
            };
        },
        comment: async (input) => {
            await runner.comment({
                owner: input.target.owner,
                repo: input.target.repo,
                number: input.number,
                body: input.body,
            });
        },
    };
}

export async function readChangedFiles(
    root: string,
    paths: string[],
): Promise<PublishFile[]> {
    const files: PublishFile[] = [];
    for (const path of paths) {
        const file = Bun.file(`${root}/${path}`);
        if (!(await file.exists())) continue;
        files.push({ path, content: await file.text() });
    }
    return files;
}
