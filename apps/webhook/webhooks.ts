import { createHash, createHmac, timingSafeEqual } from "crypto";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join, relative } from "path";
import simpleGit from "simple-git";
import { getDb, createStore, installations, repositories } from "@driftlock/db";
import {
    analyzeAndCompare,
    DbSnapshotStore,
    driftConfidence,
    driftSummary,
} from "@driftlock/pipeline";
import { vendorForPackage } from "@driftlock/agent";
import {
    buildAgentClient,
    createOutboundAgentFixPR,
    type AgentAIConfig,
} from "@driftlock/webhookCapture";
import { fixBranchName } from "@driftlock/git";
import { eq } from "drizzle-orm";

/**
 * Env-only model config for the outbound push path. The inbound capture path
 * can also read DB-backed settings; a push analysis runs headless, so env is
 * the whole config. Missing/incomplete config returns undefined and the
 * drift stays recorded-but-unmigrated rather than opening a guess PR.
 */
function pushAgentConfig(): AgentAIConfig | undefined {
    const provider = (process.env.AI_PROVIDER ?? "").trim();
    if (provider !== "openai" && provider !== "gemini" && provider !== "cloudflare") {
        return undefined;
    }
    const apiKeyEnv =
        provider === "cloudflare"
            ? "CLOUDFLARE_API_TOKEN"
            : provider === "gemini"
              ? "GEMINI_API_KEY"
              : "AI_API_KEY";
    const apiKey = (process.env[apiKeyEnv] ?? "").trim();
    if (!apiKey) return undefined;
    const modelEnv =
        provider === "cloudflare"
            ? "CLOUDFLARE_AI_MODEL"
            : provider === "gemini"
              ? "GEMINI_MODEL"
              : "AI_MODEL";
    const model = (process.env[modelEnv] ?? "").trim() || undefined;
    if (provider === "cloudflare") {
        const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
        if (!accountId) return undefined;
        return { provider, apiKey, accountId, model };
    }
    const baseUrl =
        provider === "openai" ? (process.env.AI_BASE_URL ?? "").trim() || undefined : undefined;
    return { provider, apiKey, model, ...(baseUrl ? { baseUrl } : {}) };
}

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function verifySignature(payload: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) {
    // Fail closed in production; dev keeps working with an explicit opt-in
    // so copy-paste quickstarts don't silently accept forged webhooks.
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_UNSIGNED_WEBHOOKS !== "true") {
      console.error("GITHUB_WEBHOOK_SECRET missing in production. Rejecting webhook (set GITHUB_WEBHOOK_SECRET or ALLOW_UNSIGNED_WEBHOOKS=true for dev)");
      return false;
    }
    console.warn("No GITHUB_WEBHOOK_SECRET set. Accepting unsigned payload (dev only — set GITHUB_WEBHOOK_SECRET in prod)");
    return true;
  }
  if (!signature) return false;

  const expected = "sha256=" +
    createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
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

    // Agent-only mode: record drift, then hand breaking/warning drifts to
    // the migration agent. A static rewrite here is exactly how wrong PRs
    // shipped; the agent searches, edits, verifies, clears the contract
    // gate, and publishes. Info-only drift stays recorded without a PR.
    const pushAi = pushAgentConfig();
    let driftCount = 0;
    let prCount = 0;
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
      const driftId = `drift-${dbId}`.slice(0, 128);
      await store.recordDrift({
        id: driftId,
        callSiteId: dbId,
        oldSnapshotId: previous?.id ?? saved.id,
        newSnapshotId: saved.id,
        diffSummary: driftSummary(drift) as unknown as Record<string, unknown>,
        suggestedFix: null,
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

      const removed = [
        ...drift.requestDiff.removedFields,
        ...drift.responseDiff.removedFields,
      ];
      const typeChanged = [
        ...drift.requestDiff.typeChanges.map((c) => ({
          field: c.field,
          from: c.oldType,
          to: c.newType,
        })),
        ...drift.responseDiff.typeChanges.map((c) => ({
          field: c.field,
          from: c.oldType,
          to: c.newType,
        })),
      ];
      if (removed.length === 0 && typeChanged.length === 0) {
        console.log(`  [DRIFT] ${drift.callSite.method} info-only, recorded without a PR`);
        continue;
      }
      const vendor = vendorForPackage(drift.callSite.packageName);
      const built = pushAi ? buildAgentClient(pushAi) : null;
      if (!built) {
        const lines = [
          `  [DRIFT] ${drift.callSite.method} recorded, 0 fixed`,
          ...removed.map((f) => `    removed: ${f}`),
          ...typeChanged.map((c) => `    type changed: ${c.field} (${c.from} → ${c.to})`),
          `  Your fix is ready — set a model key to get it as a PR:`,
          `    AI_PROVIDER=openai AI_API_KEY=sk-... (Settings → Secrets → Actions)`,
        ];
        console.log(lines.join("\n"));
        continue;
      }
      if (!vendor) {
        console.log(
          `  [AGENT] unknown package "${drift.callSite.packageName}": running without a contract (draft PR only)`,
        );
      }
      try {
        const agentResult = await createOutboundAgentFixPR({
          owner,
          repo: name,
          base: input.branch,
          repoPath: clone.path,
          drift: {
            provider: drift.callSite.packageName,
            method: drift.callSite.method,
            fromVersion: "captured baseline",
            toVersion: `observed ${new Date().toISOString()}`,
            removed,
            added: [
              ...drift.requestDiff.addedFields,
              ...drift.responseDiff.addedFields,
            ],
            typeChanged,
            currentMembers: [...Object.keys(current.request), ...Object.keys(current.response)],
          },
          token,
          ...(vendor ? { vendor } : {}),
          client: built.client,
          ...(built.model ? { model: built.model } : {}),
          onEvent: (event) => {
            if (event.type === "done") {
              console.log(`  [AGENT] ${drift.callSite.method} done outcome=${event.outcome} iterations=${event.iterations}`);
            }
          },
        });
        console.log(`  [PR] ${drift.callSite.method}: ${agentResult.status} (outcome: ${agentResult.outcome})`);
        if (agentResult.status === "opened" || agentResult.status === "already_open") {
          await store.updateDriftStatus(driftId, "pr_opened", agentResult.number);
          store.emitEvent?.("pr_opened", { driftId, prNumber: agentResult.number, url: agentResult.url });
          prCount += 1;
        }
      } catch (error) {
        // One drift's agent failure must not kill the rest of the loop;
        // the drift stays recorded and the next push retries.
        console.error(`  [AGENT] ${drift.callSite.method} failed:`, error);
      } finally {
        // The checkout is shared across drifts and the agent edits it in
        // place: restore it before the next drift sees a dirty tree or a
        // stray fix branch. Untracked files the run generated (logs,
        // snapshots) go too. Best-effort: a reset failure must not kill the
        // loop, the next drift just retries on whatever is there.
        try {
          const git = simpleGit(clone.path);
          await git.reset(["--hard", "HEAD"]);
          await git.clean("f", ["-d"]);
          await git.checkout(input.branch);
        } catch (error) {
          console.error(`  [AGENT] ${drift.callSite.method} checkout reset failed:`, error);
        }
      }
    }

    await store.finishRun({
      id: run.id,
      status: result.exitCode === 0 ? "succeeded" : "failed",
      exitCode: result.exitCode,
      notes: `${result.callSites.length} call sites, ${driftCount} drifts, ${prCount} agent PRs`,
    });
    console.log(`  [PUSH] done: ${result.callSites.length} call sites, ${driftCount} drifts, ${prCount} agent PRs`);
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
