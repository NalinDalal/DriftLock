import { describe, expect, test } from "bun:test";
import { PRWriter, type WriteFile } from "@driftlock/git";

function makeFake() {
    const calls: Array<{ name: string; params: any }> = [];
    let branchExists = false;

    const octokit = {
        rest: {
            git: {
                async getRef({ ref }: any) {
                    calls.push({ name: "git.getRef", params: { ref } });
                    if (ref === "heads/driftlock/prisma-6-7" && !branchExists) {
                        const err: any = new Error("Not Found");
                        err.status = 404;
                        throw err;
                    }
                    return { data: { object: { sha: "base-commit" } } };
                },
                async getCommit() {
                    calls.push({ name: "git.getCommit", params: {} });
                    return {
                        data: { sha: "base-commit", tree: { sha: "base-tree" } },
                    };
                },
                async createBlob(params: any) {
                    calls.push({ name: "git.createBlob", params });
                    return { data: { sha: `blob-${params.content.length}` } };
                },
                async createTree(params: any) {
                    calls.push({ name: "git.createTree", params });
                    return { data: { sha: "tree-new" } };
                },
                async createCommit(params: any) {
                    calls.push({ name: "git.createCommit", params });
                    return { data: { sha: "commit-new" } };
                },
                async createRef(params: any) {
                    calls.push({ name: "git.createRef", params });
                },
                async updateRef(params: any) {
                    calls.push({ name: "git.updateRef", params });
                },
            },
            pulls: {
                async create(params: any) {
                    calls.push({ name: "pulls.create", params });
                    return {
                        data: {
                            html_url: `https://github.com/${params.owner}/${params.repo}/pull/42`,
                            number: 42,
                        },
                    };
                },
            },
        },
    };

    const byName = (name: string) =>
        calls.filter((c) => c.name === name).map((c) => c.params);

    return {
        octokit: octokit as any,
        calls,
        byName,
        setBranchExists: (v: boolean) => {
            branchExists = v;
        },
    };
}

const FILES: WriteFile[] = [
    { path: "src/billing.ts", content: "export const price = amount * 2;" },
    { path: "package.json", content: '{"prisma":"7.0.0"}' },
];

function makeInput() {
    return {
        owner: "acme",
        repo: "app",
        base: "main",
        branch: "driftlock/prisma-6-7",
        title: "driftlock: migrate prisma 6 -> 7",
        body: "## What changed\nPrisma changed the client API.",
        commitMessage: "driftlock: migrate prisma 6 -> 7",
        files: FILES,
    };
}

describe("PRWriter (wordless fix PR)", () => {
    test("creates branch, single delta commit, and PR", async () => {
        const fake = makeFake();
        const writer = new PRWriter(fake.octokit);

        const result = await writer.writeFixPR({
            ...makeInput(),
            octokit: fake.octokit,
        });

        expect(result).toEqual({
            url: "https://github.com/acme/app/pull/42",
            number: 42,
            branch: "driftlock/prisma-6-7",
            commitSha: "commit-new",
        });

        expect(fake.byName("git.getRef")[0]).toMatchObject({
            ref: "heads/main",
        });
        expect(fake.byName("git.getRef")[1]).toMatchObject({
            ref: "heads/driftlock/prisma-6-7",
        });

        const blobs = fake.byName("git.createBlob");
        expect(blobs).toHaveLength(2);
        expect(blobs[0]).toMatchObject({ content: FILES[0].content });
        expect(blobs[1]).toMatchObject({ content: FILES[1].content });

        expect(fake.byName("git.createTree")[0]).toMatchObject({
            base_tree: "base-tree",
            tree: [
                {
                    path: "src/billing.ts",
                    mode: "100644",
                    type: "blob",
                    sha: "blob-32",
                },
                {
                    path: "package.json",
                    mode: "100644",
                    type: "blob",
                    sha: "blob-18",
                },
            ],
        });

        expect(fake.byName("git.createCommit")[0]).toMatchObject({
            message: "driftlock: migrate prisma 6 -> 7",
            tree: "tree-new",
            parents: ["base-commit"],
        });

        expect(fake.byName("git.createRef")[0]).toMatchObject({
            ref: "refs/heads/driftlock/prisma-6-7",
            sha: "commit-new",
        });
        expect(fake.byName("git.updateRef")).toHaveLength(0);

        const pr = fake.byName("pulls.create")[0];
        expect(pr).toMatchObject({
            owner: "acme",
            repo: "app",
            title: "driftlock: migrate prisma 6 -> 7",
            head: "driftlock/prisma-6-7",
            base: "main",
        });
    });

    test("force-updates an existing branch instead of crashing", async () => {
        const fake = makeFake();
        fake.setBranchExists(true);
        const writer = new PRWriter(fake.octokit);

        await writer.writeFixPR({ ...makeInput(), octokit: fake.octokit });

        expect(fake.byName("git.updateRef")[0]).toMatchObject({
            ref: "heads/driftlock/prisma-6-7",
            sha: "commit-new",
            force: true,
        });
        expect(fake.byName("git.createRef")).toHaveLength(0);
    });

    test("writes blobs as utf-8", async () => {
        const fake = makeFake();
        const writer = new PRWriter(fake.octokit);

        await writer.writeFixPR({ ...makeInput(), octokit: fake.octokit });

        const blobs = fake.byName("git.createBlob");
        expect(blobs).toHaveLength(2);
        for (const params of blobs) {
            expect(params.encoding).toBe("utf-8");
            expect(params.owner).toBe("acme");
            expect(params.repo).toBe("app");
        }
    });

    test("rejects an empty file list", async () => {
        const fake = makeFake();
        const writer = new PRWriter(fake.octokit);

        await expect(
            writer.writeFixPR({
                ...makeInput(),
                octokit: fake.octokit,
                files: [],
            }),
        ).rejects.toThrow("no file changes");

        expect(fake.byName("git.getRef")).toHaveLength(0);
    });
});