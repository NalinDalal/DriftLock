import type { CallSiteSummary as DbCallSite, DriftEventRow } from "@driftlock/db";
import type { Store } from "@driftlock/db";

export interface AccountDto {
  owner: string;
  kind: "user" | "organization";
  installedAt: string;
  repoCount: number;
  driftOpen: number;
  pullsOpen: number;
}

export interface RepoDto {
  owner: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  defaultBranch: string;
  watched: boolean;
  permission: "read" | "read-write" | "suggest-only";
  schedule: string;
  stats: {
    callSites: number;
    driftOpen: number;
    pullsOpen: number;
    pendingCapture: number;
    healthy: boolean;
    lastProbeAt: string | null;
  };
}

export async function repoDto(
  store: Store,
  repo: NonNullable<Awaited<ReturnType<Store["getRepository"]>>>,
): Promise<RepoDto> {
  const stats = await store.countStats(repo.id);
  return {
    owner: repo.owner,
    name: repo.name,
    description: repo.description,
    isPrivate: repo.isPrivate,
    defaultBranch: repo.defaultBranch,
    watched: repo.watched,
    permission: repo.permission,
    schedule: repo.schedule,
    stats: {
      ...stats,
      healthy: stats.driftOpen === 0,
      lastProbeAt: repo.lastAnalyzedAt
        ? repo.lastAnalyzedAt.toISOString()
        : null,
    },
  };
}

export interface CallSiteSummaryDto {
  id: string;
  filePath: string;
  line: number;
  method: string;
  packageName: string;
  endpoint: string | null;
  httpMethod: string | null;
  snapshot: string;
  requestShape: Array<{ field: string; type: string }> | null;
  responseFields: string[];
}

export function callSiteDto(row: DbCallSite): CallSiteSummaryDto {
  return {
    id: row.id,
    filePath: row.filePath,
    line: row.line,
    method: row.method,
    packageName: packageNameOf(row.method),
    endpoint: row.endpoint,
    httpMethod: row.httpMethod,
    snapshot: row.snapshotState,
    requestShape: flattenShape(row.requestShape),
    responseFields: row.responseFields,  };
}

function flattenShape(
  shape: Record<string, unknown> | null,
): Array<{ field: string; type: string }> | null {
  if (!shape) {
    return null;
  }
  const fields = Object.entries(shape);
  if (fields.length === 0) {
    return null;
  }
  return fields.map(([field, node]) => ({
    field,
    type:
      typeof node === "object" &&
      node !== null &&
      "kind" in node &&
      typeof (node as { kind: unknown }).kind === "string"
        ? ((node as { kind: string }).kind)
        : typeof node,
  }));
}

export interface DriftEventDto {
  id: string;
  callSiteId: string;
  method: string;
  packageName: string;
  detectedAt: string;
  confidence: "high" | "medium" | "low";
  status: string;
  summary: string;
  changes: Array<{ field: string; kind: string }>;
  prNumber: number | null;
  tag: string;
  confirmed: boolean;
}

export function driftEventDto(row: DriftEventRow): DriftEventDto {
  const summary = row.diffSummary as {
    breakingChanges?: string[];
    removedFields?: string[];
    typeChanges?: Array<{ field: string }>;
    addedFields?: string[];
  };
  const changes = changesFrom(summary);
  const breaking = summary.breakingChanges?.[0];
  const primary =
    breaking ??
    (summary.removedFields?.[0]
      ? `removed ${summary.removedFields[0]}`
      : null) ??
    (summary.typeChanges?.[0]
      ? `changed ${summary.typeChanges[0].field}`
      : null) ??
    (summary.addedFields?.[0]
      ? `added ${summary.addedFields[0]}`
      : null);
  return {
    id: row.id,
    callSiteId: row.callSiteId,
    method: row.method,
    packageName: packageNameOf(row.method),
    detectedAt: row.detectedAt.toISOString(),
    confidence: row.confidence,
    status: row.status,
    summary:
      primary ??
      "Captured shapes diverged from the recorded baseline",
    changes,
    prNumber: row.prNumber,
    tag: "traffic",
    confirmed:
      row.status === "merged" ||
      row.status === "closed" ||
      row.status === "false_positive",
  };
}

export function changesFrom(diff: {
  addedFields?: string[];
  removedFields?: string[];
  typeChanges?: Array<{ field: string }>;
  optionalityChanges?: Array<{ field: string }>;
  breakingChanges?: string[];
}): Array<{ field: string; kind: string }> {
  const changes: Array<{ field: string; kind: string }> = [];
  for (const field of diff.addedFields ?? []) {
    changes.push({ field, kind: "added" });
  }
  for (const field of diff.removedFields ?? []) {
    changes.push({ field, kind: "removed" });
  }
  for (const change of diff.typeChanges ?? []) {
    changes.push({ field: change.field, kind: "changed" });
  }
  for (const change of diff.optionalityChanges ?? []) {
    changes.push({ field: change.field, kind: "changed" });
  }
  for (const field of diff.breakingChanges ?? []) {
    changes.push({ field, kind: "breaking" });
  }
  return changes;
}

export interface PullDto {
  number: number;
  title: string;
  branch: string;
  status: "open" | "merged";
  updatedAt: string;
  url: string;
}

export function pullDto(
  row: DriftEventRow,
  owner: string,
  name: string,
): PullDto | null {
  if (row.prNumber === null) {
    return null;
  }
  return {
    number: row.prNumber,
    title: `driftlock: apply fix for ${row.method}`,
    branch: `driftlock/fix-${row.callSiteId}`,
    status: row.status === "merged" ? "merged" : "open",
    updatedAt: row.detectedAt.toISOString(),
    url: `https://github.com/${owner}/${name}/pull/${row.prNumber}`,
  };
}

export function packageNameOf(method: string): string {
  return method.split(".")[0] ?? method;
}

export interface ApiKeyDto {
  id: string;
  name: string;
  keyMasked: string;
  createdAt: string;
}

export function apiKeyDto(row: {
  id: string;
  name: string;
  masked: string;
  createdAt: Date;
}): ApiKeyDto {
  return {
    id: row.id,
    name: row.name,
    keyMasked: row.masked,
    createdAt: row.createdAt.toISOString(),
  };
}