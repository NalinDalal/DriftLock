import { describe, expect, test } from "bun:test";
import { FixPRRunner, type WriteFile } from "@driftlock/git";

interface PRStub {
    number: number;
    html_url: string;
    state: "open" | "closed";
    merged_at: string | null;
}

function makeOctokit(listResponse: () => PRStub[]) {
    const calls: Array<{ name: string; params: any }> = [];
    const octokit = {
        rest: {
            pulls: {
                async list(params: any) {
                    calls.push({ name: "pulls.list", params });
                    return { data: listResponse() };
                },
                async create(params: any) {
                    calls.push({ name: "pulls.create", params });
                    return {
                        data: {
                            html_url: `https://github.com/${params.owner}/${params.repo}/pull/7`,
                            number: 7,
                        },
                    };
                },
            },
            git: {
                async getRef(params: any) {
                    calls.push({ name: "git.getRef", params });
                    return { data: { object: { sha: "base" } } };
                },
                async getCommit() {
                    return { data: { sha: "base", tree: { sha: "root" } } };
                },
                async createBlob() {
                    return { data: { sha: "b1" } };
                },
                async createTree() {
                    return { data: { sha: "tree" } };
                },
                async createCommit(params: any) {
                    calls.push({ name: "git.createCommit", params });
                    return { data: { sha: "commit" } };
                },
                async createRef(params: any) {
                    calls.push({ name: "git.createRef", params });
                },
                async updateRef(params: any) {
                    calls.push({ name: "git.updateRef", params });
                },
                async deleteRef(params: any) {
                    calls.push({ name: "git.deleteRef", params });
                },
            },
        },
    };

    const byName = (name: string) =>
        calls.filter((c) => c.name === name).map((c) => c.params);

    return { octokit: octokit as any, calls, byName };
}

const FILE: WriteFile = { path: "src/a.ts", content: "export const a = 1;" };

function makeInput() {
    return {
        owner: "acme",
        repo: "app",
        base: "main",
        branch: "driftlock/fix-abcd1234",
        title: "driftlock: fix call",
        body: "## What changed\nRenamed a field.",
        commitMessage: "driftlock: apply fix",
        files: [FILE],
    };
}

describe("FixPRRunner (idempotent scheduled fix)", () => {
    test("opens a PR when no prior PR exists", async () => {
        const fake = makeOctokit(() => []);
        const runner = new FixPRRunner(fake.octokit as any);

        const result = await runner.run(makeInput());

        expect(result).toEqual({
            status: "opened",
            url: "https://github.com/acme/app/pull/7",
            number: 7,
            branch: "driftlock/fix-abcd1234",
        });
        expect(fake.byName("pulls.list")[0]).toMatchObject({
            owner: "acme",
            repo: "app",
            state: "all",
            head: "acme:driftlock/fix-abcd1234",
            base: "main",
        });
        expect(fake.byName("pulls.create")).toHaveLength(1);
        expect(fake.byName("pulls.create")[0]).toMatchObject({
            head: "driftlock/fix-abcd1234",
            base: "main",
        });
    });

    test("does nothing new when a PR is already open", async () => {
        const openPR: PRStub = {
            number: 9,
            html_url: "https://github.com/acme/app/pull/9",
            state: "open",
            merged_at: null,
        };
        const fake = makeOctokit(() => [openPR]);
        const runner = new FixPRRunner(fake.octokit as any);

        const result = await runner.run(makeInput());

        expect(result).toEqual({
            status: "already_open",
            url: "https://github.com/acme/app/pull/9",
            number: 9,
            branch: "driftlock/fix-abcd1234",
        });
        expect(fake.byName("pulls.create")).toHaveLength(0);
        expect(fake.byName("git.getRef")).toHaveLength(0);
    });

    test("reports merged so the caller can rebaseline", async () => {
        const mergedPR: PRStub = {
            number: 9,
            html_url: "https://github.com/acme/app/pull/9",
            state: "closed",
            merged_at: "2026-01-01T00:00:00Z",
        };
        const fake = makeOctokit(() => [mergedPR]);
        const runner = new FixPRRunner(fake.octokit as any);

        const result = await runner.run(makeInput());

        expect(result).toEqual({
            status: "merged",
            url: "https://github.com/acme/app/pull/9",
            number: 9,
            branch: "driftlock/fix-abcd1234",
        });
        expect(fake.byName("pulls.create")).toHaveLength(0);
        expect(fake.byName("git.getRef")).toHaveLength(0);
        expect(fake.byName("git.deleteRef")[0]).toMatchObject({
            owner: "acme",
            repo: "app",
            ref: "heads/driftlock/fix-abcd1234",
        });
    });

    test("reopens a fresh PR when the last one was closed without merging", async () => {
        const closedPR: PRStub = {
            number: 9,
            html_url: "https://github.com/acme/app/pull/9",
            state: "closed",
            merged_at: null,
        };
        const fake = makeOctokit(() => [closedPR]);
        const runner = new FixPRRunner(fake.octokit as any);

        const result = await runner.run(makeInput());

        expect(result.status).toBe("opened");
        expect(fake.byName("pulls.create")).toHaveLength(1);
    });

    test("falls back to bare-branch head when owner:branch is rejected", async () => {
        const openPR: PRStub = {
            number: 9,
            html_url: "https://github.com/acme/app/pull/9",
            state: "open",
            merged_at: null,
        };
        let throwOnce = true;
        const seenHeads: string[] = [];
        const fake = makeOctokit(() => [openPR]);
        const runner = new FixPRRunner(fake.octokit as any);

        const original = fake.octokit.rest.pulls.list;
        fake.octokit.rest.pulls.list = async (params: any) => {
            seenHeads.push(params.head);
            if (throwOnce) {
                throwOnce = false;
                const err: any = new Error("Validation Failed");
                err.status = 422;
                throw err;
            }
            return original(params);
        };

        const result = await runner.run(makeInput());

        expect(result.status).toBe("already_open");
        expect(seenHeads).toEqual([
            "acme:driftlock/fix-abcd1234",
            "driftlock/fix-abcd1234",
        ]);
    });
});