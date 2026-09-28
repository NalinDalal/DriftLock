import { createHash, createHmac, timingSafeEqual } from "crypto";
import { readFileSync } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join, relative } from "path";
import simpleGit from "simple-git";
import { getDb, createStore, installations, repositories } from "@driftlock/db";
import {
    analyzeAndCompare,
    applyDriftFix,
    DbSnapshotStore,
    buildDriftEvent,
    driftConfidence,
    driftSummary,
} from "@driftlock/pipeline";
import {
    FixPRRunner,
    fixBranchName,
    buildFixPRTitle,
    buildFixPRBody,
} from "@driftlock/git";
import { eq } from "drizzle-orm";

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function verifySignature(payload: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) {
    console.warn("No GITHUB_WEBHOOK_SECRET set. Skipping signature verification");
    return true;
  }

  const expected = "sha256=" +
    createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex");

  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function webhookHandler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const signature = req.headers.get("x-hub-signature-256") || "";
  const eventType = req.headers.get("x-github-event") || "";
  const deliveryId = req.headers.get("x-github-delivery") || "";

  const body = await req.text();

  if (!verifySignature(body, signature)) {
    console.error(`Invalid signature for delivery ${deliveryId}`);
    return json({ error: "Invalid signature" }, 401);
  }

  console.log(`Received ${eventType} event (delivery: ${deliveryId})`);

  try {
    const payload = JSON.parse(body);

    switch (eventType) {
      case "installation":
        await handleInstallation(payload);
        break;
      case "installation_repositories":
        await handleInstallationRepositories(payload);
        break;
      case "push":
        await handlePush(payload);
        break;
      case "pull_request":
        await handlePullRequest(payload);
        break;
      default:
        console.log(`Unhandled event type: ${eventType}`);
    }

    return json({ received: true });
  } catch (error) {
    console.error(`Error processing ${eventType} event:`, error);
    return json({ error: "Internal server error" }, 500);
  }
}

async function handleInstallation(payload: any) {
  const { action, installation, repositories: repos } = payload;
  const db = getDb();

  console.log(`Installation ${action}: ${installation.account.login}`);

  switch (action) {
    case "created":
      // Save installation
      await db.insert(installations).values({
        installationId: installation.id,
        accountLogin: installation.account.login,
        accountType: installation.account.type,
        appId: installation.app_id,
        targetSelection: installation.target_selection,
        permissions: installation.permissions,
        events: installation.events,
      });

      // Save repositories - installation event only has id and name
      // owner comes from installation.account.login
      if (repos?.length) {
        for (const repo of repos) {
          await db.insert(repositories).values({
            owner: installation.account.login,
            name: repo.name,
            fullName: `${installation.account.login}/${repo.name}`,
            installationId: installation.id,
            defaultBranch: "main",
          }).onConflictDoUpdate({
            target: repositories.fullName,
            set: { installationId: installation.id },
          });
        }
      }

      console.log(`  Saved installation with ${repos?.length || 0} repositories`);
      break;

    case "deleted":
      // Delete repos first, then installation
      await db
        .delete(repositories)
        .where(eq(repositories.installationId, installation.id));
      await db
        .delete(installations)
        .where(eq(installations.installationId, installation.id));
      console.log(`  Installation deleted`);
      break;
  }
}

async function handleInstallationRepositories(payload: any) {
  const { action, installation, repositories_added, repositories_removed } = payload;
  const db = getDb();

  console.log(`Installation repositories ${action}: ${installation.account.login}`);

  switch (action) {
    case "added":
      if (repositories_added?.length) {
        for (const repo of repositories_added) {
          await db.insert(repositories).values({
            owner: installation.account.login,
            name: repo.name,
            fullName: `${installation.account.login}/${repo.name}`,
            installationId: installation.id,
            defaultBranch: "main",
          }).onConflictDoUpdate({
            target: repositories.fullName,
            set: { installationId: installation.id },
          });
        }
        console.log(`  Added: ${repositories_added.map((r: any) => `${installation.account.login}/${r.name}`).join(", ")}`);
      }
      break;

    case "removed":
      if (repositories_removed?.length) {
        for (const repo of repositories_removed) {
          await db
            .delete(repositories)
            .where(eq(repositories.fullName, `${installation.account.login}/${repo.name}`));
        }
        console.log(`  Removed: ${repositories_removed.map((r: any) => `${installation.account.login}/${r.name}`).join(", ")}`);
      }
      break;
  }
}

async function handlePush(payload: any) {
  const { repository, ref, commits, deleted, after } = payload;
  const fullName: string = repository?.full_name ?? "";
  const branch = typeof ref === "string" && ref.startsWith("refs/heads/")
    ? ref.slice("refs/heads/".length)
    : String(ref ?? "");

  console.log(`Push to ${fullName}: ${ref}`);
  console.log(`  ${commits?.length || 0} commits`);

  const skip = shouldSkipPush({
    deleted: Boolean(deleted),
    after: String(after ?? ""),
    branch,
  });
  if (skip) {
    console.log(`  [SKIP] push analysis: ${skip}`);
    return;
  }
  if (!touchesCode(commits)) {
    console.log(`  [SKIP] no code files changed`);
    return;
  }

  // GitHub expects a fast 200; analysis (clone + Docker sandbox) takes
  // minutes, so run it in the background. Failures are logged, not retried
  // here — the next push re-runs the loop.
  void analyzePushInBackground({
    fullName,
    branch,
    defaultBranch: repository?.default_branch ?? "main",
  }).catch((e) => console.error(`  [PUSH] background analysis failed:`, e));
}

/** Pure skip decisions, exported for unit testing. Returns reason or null. */
export function shouldSkipPush(input: {
  deleted: boolean;
  after: string;
  branch: string;
}): string | null {
  if (input.deleted || /^0+$/.test(input.after)) return "branch deleted";
  if (!input.branch) return "missing ref";
  if (input.branch.startsWith("driftlock/")) return "bot branch (loop guard)";
  return null;
}

function touchesCode(commits: any[] | undefined): boolean {
  if (!commits || commits.length === 0) return true; // force-push / unknown: be safe
  const changed: string[] = [];
  for (const c of commits) {
    changed.push(...(c.added ?? []), ...(c.modified ?? []), ...(c.removed ?? []));
  }
  if (changed.length === 0) return true;
  return changed.some((f) =>
    /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f) ||
    /(^|\/)package\.json$/.test(f) ||
    /(^|\/)(bun|package-lock)\.lockb?$/.test(f),
  );
}

async function analyzePushInBackground(input: {
  fullName: string;
  branch: string;
  defaultBranch: string;
}): Promise<void> {
  const [owner, name] = input.fullName.split("/");
  if (!owner || !name) {
    console.log(`  [SKIP] malformed repo full_name: ${input.fullName}`);
    return;
  }

  let store: ReturnType<typeof createStore>;
  try {
    store = createStore(getDb());
  } catch (e) {
    console.log(`  [SKIP] DB unavailable, push analysis skipped:`, e);
    return;
  }

  const repo = await store.getRepository(owner, name);
  if (!repo) {
    console.log(`  [SKIP] ${input.fullName} not installed (no repositories row)`);
    return;
  }
  if (repo.watched === false) {
    console.log(`  [SKIP] ${input.fullName} watched=false`);
    return;
  }
  if (input.branch !== (repo.defaultBranch ?? input.defaultBranch)) {
    console.log(`  [SKIP] branch ${input.branch} != default ${repo.defaultBranch}`);
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log(`  [SKIP] GITHUB_TOKEN missing, cannot clone or open PRs`);
    return;
  }

  const run = await store.recordRun({ repositoryId: repo.id, status: "running" });
  const clone = await cloneRepo(owner, name, input.branch, token);
  const toDbId = (id: string) => {
    if (id.length <= 64) return id;
    const stableId = id.startsWith(`${clone.path}/`)
      ? `${repo.id}:${id.slice(clone.path.length + 1)}`
      : id;
    return createHash("sha256").update(stableId, "utf8").digest("hex");
  };

  try {
    const command = process.env.WEBHOOK_TEST_COMMAND || "npm test";
    const snapshotStore = new DbSnapshotStore(store);
    const result = await analyzeAndCompare({
      repoPath: clone.path,
      command,
      snapshotStore,
    });

    for (const callSite of result.callSites) {
      const shapes = result.shapes.get(callSite.id);
      const relPath = callSite.filePath.startsWith(clone.path)
        ? relative(clone.path, callSite.filePath)
        : callSite.filePath;
      await store.upsertCallSite(repo.id, {
        id: toDbId(callSite.id),
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
      repo.id,
      result.callSites.map((s) => toDbId(s.id)),
    );

    // Baselines are persisted via DbSnapshotStore inside analyzeAndCompare
    // (first run saves, later runs diff). Record each drift + open one
    // idempotent PR per call site when the repo allows writes.
    const canWrite = (repo.permission ?? "read-write") === "read-write";
    let driftCount = 0;
    let prCount = 0;
    const prRunner = canWrite ? new FixPRRunner(token) : null;
    for (const drift of result.drifts) {
      const current = result.shapes.get(drift.callSite.id);
      if (!current) continue;
      const dbId = toDbId(drift.callSite.id);
      const previous = await store.getLatestSnapshot(dbId);
      const saved = await store.saveSnapshot({
        callSiteId: dbId,
        testCommand: command,
        exitCode: result.exitCode,
        duration: result.duration,
        trafficCaptured: result.trafficCaptured,
        requestShape: current.request,
        responseShape: current.response,
      });
      const source = readSource(clone.path, drift.callSite.filePath);
      const applied = source ? applyDriftFix(drift, source) : null;
      const driftId = `drift-${dbId}`.slice(0, 128);
      if (applied) applied.fix.driftEventId = driftId;
      await store.recordDrift({
        id: driftId,
        callSiteId: dbId,
        oldSnapshotId: previous?.id ?? saved.id,
        newSnapshotId: saved.id,
        diffSummary: driftSummary(drift) as unknown as Record<string, unknown>,
        suggestedFix: applied?.fix ?? null,
        confidence: driftConfidence(drift),
        prNumber: null,
        status: "detected",
      });
      store.emitEvent?.("drift_detected", {
        driftId,
        repo: input.fullName,
        callSiteId: dbId,
        method: drift.callSite.method,
      });
      await store.setCallSiteSnapshotState(dbId, "drifted");
      driftCount += 1;

      if (applied && prRunner) {
        const driftEvent = buildDriftEvent(drift, { id: driftId });
        driftEvent.suggestedFix = applied.fix;
        driftEvent.status = "fix_generated";
        const pr = await prRunner.run({
          owner,
          repo: name,
          base: input.branch,
          branch: fixBranchName(dbId),
          title: buildFixPRTitle({ driftEvent, callSite: drift.callSite, fix: applied.fix }),
          body: buildFixPRBody({ driftEvent, callSite: drift.callSite, fix: applied.fix }, applied.fix.files),
          commitMessage: `driftlock: apply fix for ${drift.callSite.method}`,
          files: applied.fix.files.map((f) => ({ path: f.path, content: f.changes })),
        });
        console.log(`  [PR] ${pr.status}: ${pr.url}`);
        if (pr.status === "opened" || pr.status === "already_open") {
          await store.updateDriftStatus(driftId, "pr_opened", pr.number);
          store.emitEvent?.("pr_opened", { driftId, prNumber: pr.number, url: pr.url });
          prCount += 1;
        } else if (pr.status === "merged") {
          await store.updateDriftStatus(driftId, "merged", pr.number);
          store.emitEvent?.("pr_merged", { driftId, prNumber: pr.number, url: pr.url });
          const current = result.shapes.get(drift.callSite.id);
          if (current) {
            await snapshotStore.save(dbId, current, {
              testCommand: command,
              exitCode: result.exitCode,
              duration: result.duration,
              trafficCaptured: result.trafficCaptured,
            });
          }
        }
      }
    }

    await store.finishRun({
      id: run.id,
      status: result.exitCode === 0 ? "succeeded" : "failed",
      exitCode: result.exitCode,
      notes: `${result.callSites.length} call sites, ${driftCount} drifts, ${prCount} PRs`,
    });
    console.log(`  [PUSH] done: ${result.callSites.length} call sites, ${driftCount} drifts, ${prCount} PRs`);
  } catch (e) {
    await store
      .finishRun({
        id: run.id,
        status: "failed",
        exitCode: null,
        notes: e instanceof Error ? e.message : "push analysis failed",
      })
      .catch(() => {});
    throw e;
  } finally {
    await clone.cleanup();
  }
}

async function cloneRepo(owner: string, name: string, branch: string, token: string) {
  const auth = `x-access-token:${encodeURIComponent(token)}@`;
  const url = `https://${auth}github.com/${owner}/${name}.git`;
  const dir = await mkdtemp(join(tmpdir(), "driftlock-push-"));
  try {
    await simpleGit().clone(url, dir, ["--branch", branch, "--depth", "1"]);
  } catch (e) {
    await rm(dir, { recursive: true, force: true });
    throw e;
  }
  return { path: dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

function readSource(repoPath: string, filePath: string): string | null {
  try {
    const full = filePath.startsWith("/") ? filePath : join(repoPath, filePath);
    return readFileSync(full, "utf8");
  } catch {
    return null;
  }
}

async function handlePullRequest(payload: any) {
  const { action, pull_request, repository } = payload;
  const fullName: string = repository?.full_name ?? "";
  const prNumber: number | undefined = pull_request?.number;
  const merged: boolean = pull_request?.merged === true;
  const headBranch: string = pull_request?.head?.ref ?? "";

  console.log(`PR ${action}: ${pull_request?.title} in ${fullName}`);

  if (action !== "closed" || prNumber === undefined) return;

  let store: ReturnType<typeof createStore>;
  try {
    store = createStore(getDb());
  } catch (e) {
    console.log(`  [SKIP] DB unavailable, PR status not tracked:`, e);
    return;
  }
  const [owner, name] = fullName.split("/");
  if (!owner || !name) return;
  const repo = await store.getRepository(owner, name).catch(() => null);
  if (!repo) {
    console.log(`  [SKIP] ${fullName} not installed, PR #${prNumber} not tracked`);
    return;
  }

  if (merged) {
    // Source of truth for pr_merged: GitHub says the PR landed. Prefer
    // direct prNumber match; fall back to bot-branch mapping for older rows
    // that were recorded before prNumber was persisted.
    const matched = await store.updateDriftStatusByPrNumber(repo.id, prNumber, "merged");
    if (matched === 0 && headBranch.startsWith("driftlock/fix-")) {
      const open = await store.listOpenDriftsByRepo(repo.id);
      for (const row of open) {
        if (fixBranchName(row.callSiteId) === headBranch) {
          await store.updateDriftStatus(row.id, "merged", prNumber);
        }
      }
    }
    store.emitEvent?.("pr_merged", { repo: fullName, prNumber, branch: headBranch });
    console.log(`  [PR] merged #${prNumber} tracked`);
    return;
  }

  // Closed without merge on a bot branch = human rejected the fix:
  // record false_positive so precision can be measured.
  if (headBranch.startsWith("driftlock/")) {
    const matched = await store.updateDriftStatusByPrNumber(repo.id, prNumber, "false_positive");
    if (matched === 0 && headBranch.startsWith("driftlock/fix-")) {
      const open = await store.listOpenDriftsByRepo(repo.id);
      for (const row of open) {
        if (fixBranchName(row.callSiteId) === headBranch) {
          await store.updateDriftStatus(row.id, "false_positive", prNumber);
        }
      }
    }
    store.emitEvent?.("false_positive", { repo: fullName, prNumber, branch: headBranch });
    console.log(`  [PR] closed unmerged ${headBranch} marked false_positive`);
  }
}
