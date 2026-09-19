import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "./index";
import {
  apiKeys,
  callSites,
  driftEvents,
  installations,
  repositories,
  runs,
  settings,
  snapshots,
} from "./schema";

export interface RepoInput {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch?: string;
  description?: string | null;
  isPrivate?: boolean;
  language?: string[];
  permission?: "read" | "read-write" | "suggest-only";
}

export interface CallSiteSummary {
  id: string;
  filePath: string;
  line: number;
  method: string;
  endpoint: string | null;
  httpMethod: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | null;
  snapshotState: string;
  requestShape: Record<string, unknown> | null;
  responseFields: string[];
  lastCheckedAt: Date | null;
}

export interface DriftEventRow {
  id: string;
  callSiteId: string;
  detectedAt: Date;
  oldSnapshotId: string;
  newSnapshotId: string;
  diffSummary: unknown;
  suggestedFix: unknown;
  confidence: "high" | "medium" | "low";
  prNumber: number | null;
  status: string;
  method: string;
  filePath: string;
  endpoint: string | null;
}

export function createStore(db: Database) {
  async function ensureRepository(input: RepoInput) {
    const existing = await db
      .select()
      .from(repositories)
      .where(eq(repositories.fullName, input.fullName))
      .limit(1);
    if (existing.length > 0) {
      await db
        .update(repositories)
        .set({
          description: input.description ?? existing[0].description,
          isPrivate: input.isPrivate ?? existing[0].isPrivate,
          language: input.language ?? existing[0].language,
          defaultBranch: input.defaultBranch ?? existing[0].defaultBranch,
          lastAnalyzedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(repositories.id, existing[0].id));
      return existing[0];
    }
    const inserted = await db
      .insert(repositories)
      .values({
        owner: input.owner,
        name: input.name,
        fullName: input.fullName,
        description: input.description ?? null,
        isPrivate: input.isPrivate ?? true,
        defaultBranch: input.defaultBranch ?? "main",
        language: input.language ?? [],
      })
      .returning();
    return inserted[0];
  }

  async function listRepositories() {
    return db.select().from(repositories).orderBy(desc(repositories.updatedAt));
  }

  async function listInstallations() {
    return db.select().from(installations);
  }

  async function listReposByOwner(owner: string) {
    return db
      .select()
      .from(repositories)
      .where(eq(repositories.owner, owner))
      .orderBy(desc(repositories.updatedAt));
  }

  async function getRepository(owner: string, name: string) {
    const rows = await db
      .select()
      .from(repositories)
      .where(
        and(eq(repositories.owner, owner), eq(repositories.name, name)),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async function getRepositoryById(id: string) {
    const rows = await db
      .select()
      .from(repositories)
      .where(eq(repositories.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async function updatePolicy(
    owner: string,
    name: string,
    patch: {
      watched?: boolean;
      permission?: "read" | "read-write" | "suggest-only";
      schedule?: string;
    },
  ) {
    await db
      .update(repositories)
      .set({ ...patch, updatedAt: new Date() })
      .where(
        and(eq(repositories.owner, owner), eq(repositories.name, name)),
      );
  }

  async function upsertCallSite(
    repositoryId: string,
    site: {
      id: string;
      filePath: string;
      line: number;
      method: string;
      endpoint?: string | null;
      httpMethod?: string | null;
      requestShape: Record<string, unknown>;
      responseFields: string[];
      snapshotState?: string;
    },
  ) {
    const shapeEmpty = Object.keys(site.requestShape).length === 0;
    const state =
      site.snapshotState ??
      (shapeEmpty ? "pending-capture" : "pending-capture");
    const existing = await db
      .select()
      .from(callSites)
      .where(eq(callSites.id, site.id))
      .limit(1);
    if (existing.length > 0) {
      await db
        .update(callSites)
        .set({
          repositoryId,
          filePath: site.filePath,
          line: site.line,
          method: site.method,
          endpoint: site.endpoint ?? existing[0].endpoint,
          httpMethod:
            (site.httpMethod as "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | null) ??
            existing[0].httpMethod,
          requestShape: site.requestShape,
          responseFields: site.responseFields,
          snapshotState: state,
          lastCheckedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(callSites.id, site.id));
      return existing[0];
    }
    const inserted = await db
      .insert(callSites)
      .values({
        id: site.id,
        repositoryId,
        filePath: site.filePath,
        line: site.line,
        method: site.method,
        endpoint: site.endpoint ?? null,
        httpMethod:
          (site.httpMethod as "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | null) ??
          null,
        requestShape: site.requestShape,
        responseFields: site.responseFields,
        snapshotState: state,
        lastCheckedAt: new Date(),
      })
      .returning();
    return inserted[0];
  }

  async function deleteObsoleteCallSites(
    repositoryId: string,
    keepIds: string[],
  ) {
    if (keepIds.length === 0) {
      return;
    }
    const rows = await db
      .select({ id: callSites.id })
      .from(callSites)
      .where(eq(callSites.repositoryId, repositoryId));
    const stale = rows
      .map((r) => r.id)
      .filter((id) => !keepIds.includes(id));
    if (stale.length === 0) {
      return;
    }
    for (const id of stale) {
      await db.delete(callSites).where(eq(callSites.id, id));
    }
  }

  async function listCallSites(
    repositoryId: string,
  ): Promise<CallSiteSummary[]> {
    const rows = await db
      .select()
      .from(callSites)
      .where(eq(callSites.repositoryId, repositoryId))
      .orderBy(callSites.filePath);
    return rows.map((row) => ({
      id: row.id,
      filePath: row.filePath,
      line: row.line,
      method: row.method,
      endpoint: row.endpoint,
      httpMethod: row.httpMethod,
      snapshotState: row.snapshotState,
      requestShape: row.requestShape as Record<string, unknown> | null,
      responseFields: row.responseFields,
      lastCheckedAt: row.lastCheckedAt,
    }));
  }

  async function setCallSiteSnapshotState(
    callSiteId: string,
    state: string,
  ) {
    await db
      .update(callSites)
      .set({ snapshotState: state, updatedAt: new Date() })
      .where(eq(callSites.id, callSiteId));
  }

  async function saveSnapshot(site: {
    callSiteId: string;
    testCommand: string;
    exitCode: number;
    duration: number;
    trafficCaptured: number;
    requestShape: Record<string, unknown>;
    responseShape: Record<string, unknown>;
  }) {
    const inserted = await db
      .insert(snapshots)
      .values({ ...site, capturedAt: new Date() })
      .returning();
    return inserted[0];
  }

  async function getLatestSnapshot(callSiteId: string) {
    const rows = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.callSiteId, callSiteId))
      .orderBy(desc(snapshots.capturedAt))
      .limit(1);
    return rows[0] ?? null;
  }

  async function getSnapshotById(id: string) {
    const rows = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async function recordDrift(input: {
    id: string;
    callSiteId: string;
    oldSnapshotId: string;
    newSnapshotId: string;
    diffSummary: Record<string, unknown>;
    suggestedFix: unknown;
    confidence: "high" | "medium" | "low";
    prNumber: number | null;
    status: string;
  }) {
    await db
      .insert(driftEvents)
      .values({
        ...input,
        detectedAt: new Date(),
        status:
          (input.status as "detected" | "fix_generated" | "pr_opened" | "merged" | "closed" | "false_positive") ??
          "detected",
        suggestedFix: input.suggestedFix ?? null,
      })
      .onConflictDoUpdate({
        target: driftEvents.id,
        set: {
          status:
            (input.status as "detected" | "fix_generated" | "pr_opened" | "merged" | "closed" | "false_positive") ??
            "detected",
          prNumber: input.prNumber,
          suggestedFix: input.suggestedFix ?? null,
          diffSummary: input.diffSummary,
        },
      });
  }

  async function listDriftEventsByRepo(
    repositoryId: string,
  ): Promise<DriftEventRow[]> {
    return db
      .select({
        id: driftEvents.id,
        callSiteId: driftEvents.callSiteId,
        detectedAt: driftEvents.detectedAt,
        oldSnapshotId: driftEvents.oldSnapshotId,
        newSnapshotId: driftEvents.newSnapshotId,
        diffSummary: driftEvents.diffSummary,
        suggestedFix: driftEvents.suggestedFix,
        confidence: driftEvents.confidence,
        prNumber: driftEvents.prNumber,
        status: driftEvents.status,
        method: callSites.method,
        filePath: callSites.filePath,
        endpoint: callSites.endpoint,
      })
      .from(driftEvents)
      .innerJoin(callSites, eq(driftEvents.callSiteId, callSites.id))
      .where(eq(callSites.repositoryId, repositoryId))
      .orderBy(desc(driftEvents.detectedAt));
  }

  async function listOpenDriftsByRepo(repositoryId: string) {
    const rows = await listDriftEventsByRepo(repositoryId);
    return rows.filter(
      (r) =>
        r.status === "detected" ||
        r.status === "fix_generated" ||
        r.status === "pr_opened",
    );
  }

  async function listPullsByRepo(repositoryId: string) {
    const rows = await listDriftEventsByRepo(repositoryId);
    return rows.filter((r) => r.prNumber !== null && r.status !== "merged");
  }

  async function countStats(repositoryId: string) {
    const callSiteCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(callSites)
      .where(eq(callSites.repositoryId, repositoryId));
    const pendingCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(callSites)
      .where(
        and(
          eq(callSites.repositoryId, repositoryId),
          eq(callSites.snapshotState, "pending-capture"),
        ),
      );
    const openDrifts = await listOpenDriftsByRepo(repositoryId);
    const pulls = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(driftEvents)
      .innerJoin(callSites, eq(driftEvents.callSiteId, callSites.id))
      .where(
        and(
          eq(callSites.repositoryId, repositoryId),
          sql`${driftEvents.prNumber} is not null`,
          neStatus(driftEvents.status, "merged"),
        ),
      );
    return {
      callSites: callSiteCount[0]?.count ?? 0,
      pendingCapture: pendingCount[0]?.count ?? 0,
      driftOpen: openDrifts.length,
      pullsOpen: pulls[0]?.count ?? 0,
    };
  }

  async function listAccounts() {
    return db
      .select({
        owner: repositories.owner,
        repoCount: sql<number>`count(*)::int`,
      })
      .from(repositories)
      .groupBy(repositories.owner);
  }

  async function recordRun(input: {
    repositoryId: string;
    status: "pending" | "running" | "succeeded" | "failed";
    exitCode?: number | null;
    notes?: string | null;
  }) {
    const inserted = await db
      .insert(runs)
      .values({
        repositoryId: input.repositoryId,
        status: input.status,
        exitCode: input.exitCode ?? null,
        notes: input.notes ?? null,
        startedAt: new Date(),
      })
      .returning();
    return inserted[0];
  }

  async function finishRun(input: {
    id: string;
    status: "succeeded" | "failed";
    exitCode?: number | null;
    notes?: string | null;
  }) {
    await db
      .update(runs)
      .set({
        status: input.status,
        exitCode: input.exitCode ?? null,
        notes: input.notes ?? null,
        finishedAt: new Date(),
      })
      .where(eq(runs.id, input.id));
  }

  async function listRecentRuns(repositoryId: string, limit = 10) {
    return db
      .select()
      .from(runs)
      .where(eq(runs.repositoryId, repositoryId))
      .orderBy(desc(runs.startedAt))
      .limit(limit);
  }

  async function getSetting<T>(key: string): Promise<T | null> {
    const rows = await db
      .select()
      .from(settings)
      .where(eq(settings.key, key))
      .limit(1);
    return rows[0] ? (rows[0].value as T) : null;
  }

  async function setSetting<T>(key: string, value: T) {
    await db
      .insert(settings)
      .values({ key, value: value as unknown as object, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: value as unknown as object, updatedAt: new Date() },
      });
  }

  async function listApiKeys() {
    return db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        masked: apiKeys.masked,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .orderBy(desc(apiKeys.createdAt));
  }

  async function createApiKey(name: string) {
    const raw = `dlk_${crypto.randomUUID().replace(/-/g, "")}`;
    const hash = await sha256(raw);
    const inserted = await db
      .insert(apiKeys)
      .values({
        name,
        keyPrefix: raw.slice(0, 12),
        keyHash: hash,
        masked: `dlk_…${raw.slice(-4)}`,
        createdAt: new Date(),
      })
      .returning();
    return { row: inserted[0], raw };
  }

  async function rotateApiKey(name: string) {
    const rows = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(eq(apiKeys.name, name));
    for (const row of rows) {
      await db.delete(apiKeys).where(eq(apiKeys.id, row.id));
    }
    return createApiKey(name);
  }

  async function findApiKey(raw: string) {
    const hash = await sha256(raw);
    const rows = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, hash))
      .limit(1);
    return rows[0] ?? null;
  }

  return {
    ensureRepository,
    listRepositories,
    listInstallations,
    listReposByOwner,
    getRepository,
    getRepositoryById,
    updatePolicy,
    upsertCallSite,
    deleteObsoleteCallSites,
    listCallSites,
    setCallSiteSnapshotState,
    saveSnapshot,
    getLatestSnapshot,
    getSnapshotById,
    recordDrift,
    listDriftEventsByRepo,
    listOpenDriftsByRepo,
    listPullsByRepo,
    countStats,
    listAccounts,
    recordRun,
    finishRun,
    listRecentRuns,
    getSetting,
    setSetting,
    listApiKeys,
    createApiKey,
    rotateApiKey,
    findApiKey,
  };
}

export type Store = ReturnType<typeof createStore>;

function neStatus(
  column: typeof driftEvents.status,
  value: string,
) {
  return sql`${column} <> ${value}`;
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}