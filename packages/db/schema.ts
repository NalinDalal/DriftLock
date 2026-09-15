import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  jsonb,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";

export const httpMethodEnum = pgEnum("http_method", [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
]);

export const confidenceEnum = pgEnum("confidence", ["high", "medium", "low"]);

export const driftStatusEnum = pgEnum("drift_status", [
  "detected",
  "fix_generated",
  "pr_opened",
  "merged",
  "closed",
  "false_positive",
]);

export const fixTypeEnum = pgEnum("fix_type", [
  "field_rename",
  "type_coercion",
  "null_check",
  "default_value",
  "custom",
]);

export const repositories = pgTable("repositories", {
  id: uuid("id").primaryKey().defaultRandom(),
  owner: varchar("owner", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  fullName: varchar("full_name", { length: 510 }).notNull(),
  installationId: integer("installation_id").notNull(),
  defaultBranch: varchar("default_branch", { length: 255 }).notNull().default("main"),
  language: text("language").array().notNull().default([]),
  lastAnalyzedAt: timestamp("last_analyzed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const callSites = pgTable("call_sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  repositoryId: uuid("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull(),
  line: integer("line").notNull(),
  method: varchar("method", { length: 255 }).notNull(),
  endpoint: varchar("endpoint", { length: 510 }).notNull(),
  httpMethod: httpMethodEnum("http_method").notNull(),
  requestShape: jsonb("request_shape").notNull().default({}),
  responseFields: text("response_fields").array().notNull().default([]),
  testFiles: text("test_files").array().notNull().default([]),
  lastCheckedAt: timestamp("last_checked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const snapshots = pgTable("snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  callSiteId: uuid("call_site_id")
    .notNull()
    .references(() => callSites.id, { onDelete: "cascade" }),
  capturedAt: timestamp("captured_at").notNull().defaultNow(),
  requestShape: jsonb("request_shape").notNull().default({}),
  responseShape: jsonb("response_shape").notNull().default({}),
  testCommand: text("test_command").notNull(),
  exitCode: integer("exit_code").notNull(),
  duration: integer("duration").notNull(),
  trafficCaptured: integer("traffic_captured").notNull().default(0),
});

export const driftEvents = pgTable("drift_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  callSiteId: uuid("call_site_id")
    .notNull()
    .references(() => callSites.id, { onDelete: "cascade" }),
  detectedAt: timestamp("detected_at").notNull().defaultNow(),
  oldSnapshotId: uuid("old_snapshot_id")
    .notNull()
    .references(() => snapshots.id),
  newSnapshotId: uuid("new_snapshot_id")
    .notNull()
    .references(() => snapshots.id),
  diffSummary: jsonb("diff_summary").notNull().default({}),
  suggestedFix: jsonb("suggested_fix"),
  confidence: confidenceEnum("confidence").notNull(),
  prNumber: integer("pr_number"),
  status: driftStatusEnum("status").notNull().default("detected"),
});
