import { afterAll, afterEach, describe, expect, spyOn, test } from "bun:test";
import * as storeModule from "@driftlock/be/src/store";
import { handleReportRun } from "@driftlock/be/src/routes/report";
import { handleActionsTemplate } from "@driftlock/be/src/routes/templates";

const storeSpy = spyOn(storeModule, "getStore");
afterEach(() => storeSpy.mockReset());
afterAll(() => storeSpy.mockRestore());

function reportStore() {
    const runs: Array<{ id: string; status: string }> = [];
    const finished: Array<{ id: string; status: string; exitCode: number | null; notes: string | null }> = [];
    storeSpy.mockReturnValue({
        ensureRepository: async (input: { owner: string; name: string; fullName: string }) => ({
            id: "repo-1",
            ...input,
        }),
        recordRun: async (input: { repositoryId: string; status: string }) => {
            const run = { id: "run-1", status: input.status };
            runs.push(run);
            return run;
        },
        finishRun: async (input: { id: string; status: "succeeded" | "failed"; exitCode?: number | null; notes?: string | null }) => {
            finished.push({
                id: input.id,
                status: input.status,
                exitCode: input.exitCode ?? null,
                notes: input.notes ?? null,
            });
        },
    } as unknown as ReturnType<typeof storeModule.getStore>);
    return { runs, finished };
}

function request(body: unknown): Request {
    return new Request("http://localhost/api/runs/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
    });
}

describe("POST /api/runs/report", () => {
    test("rejects non-JSON bodies", async () => {
        expect((await handleReportRun(request("not json"))).status).toBe(400);
    });

    test("rejects missing owner/repo", async () => {
        reportStore();
        expect((await handleReportRun(request({ repo: "p" }))).status).toBe(400);
        expect((await handleReportRun(request({ owner: "a" }))).status).toBe(400);
    });

    test("rejects invalid counts and prs", async () => {
        reportStore();
        const base = { owner: "acme", repo: "payments" };
        expect((await handleReportRun(request({ ...base, drifts: -1 }))).status).toBe(400);
        expect((await handleReportRun(request({ ...base, drifts: 1.5 }))).status).toBe(400);
        expect((await handleReportRun(request({ ...base, prs: "nope" }))).status).toBe(400);
        expect((await handleReportRun(request({ ...base, prs: [42] }))).status).toBe(400);
        expect((await handleReportRun(request({ ...base, exitCode: 2 }))).status).toBe(400);
    });

    test("records a workflow run and returns counts", async () => {
        const { finished } = reportStore();
        const res = await handleReportRun(
            request({
                owner: "acme",
                repo: "payments",
                callSites: 4,
                drifts: 2,
                baselines: 1,
                durationMs: 93000,
                prs: [{ url: "https://github.com/acme/payments/pull/7", number: 7, status: "opened" }],
            }),
        );
        expect(res.status).toBe(201);
        expect(await res.json()).toEqual({
            run: { id: "run-1", status: "succeeded", callSites: 4, drifts: 2, prs: 1, baselines: 1 },
        });
        expect(finished).toHaveLength(1);
        expect(finished[0].status).toBe("succeeded");
        expect(finished[0].notes).toContain("4 call sites, 2 drifts, 1 PRs");
        expect(finished[0].notes).toContain("reported by workflow");
    });

    test("exitCode 1 marks the run failed", async () => {
        const { finished } = reportStore();
        const res = await handleReportRun(
            request({ owner: "acme", repo: "payments", exitCode: 1 }),
        );
        expect(res.status).toBe(201);
        expect((await res.json()).run.status).toBe("failed");
        expect(finished[0].status).toBe("failed");
    });
});

describe("GET /api/templates/actions", () => {
    test("serves the workflow template with placeholders", async () => {
        const res = await handleActionsTemplate();
        expect(res.status).toBe(200);
        const { yaml } = (await res.json()) as { yaml: string };
        for (const token of ["__OWNER__", "__REPO__", "__BRANCH__", "__API_URL__", "DRIFTLOCK_API_KEY"]) {
            expect(yaml).toContain(token);
        }
    });
});
