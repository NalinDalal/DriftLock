import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  jsonb,
  timestamp,
  boolean,
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

export const runStatusEnum = pgEnum("run_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
]);

export const permissionEnum = pgEnum("repo_permission", [
  "read",
  "read-write",
  "suggest-only",
]);

export const installations = pgTable("installations", {
  id: uuid("id").primaryKey().defaultRandom(),
  installationId: integer("installation_id").notNull().unique(),
  accountLogin: varchar("account_login", { length: 255 }).notNull(),
  accountType: varchar("account_type", { length: 50 }).notNull(),
  appId: integer("app_id").notNull(),
  targetSelection: varchar("target_selection", { length: 50 }).notNull().default("selected"),
  permissions: jsonb("permissions").notNull().default({}),
  events: text("events").array().notNull().default([]),
  active: varchar("active", { length: 20 }).notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const repositories = pgTable("repositories", {
  id: uuid("id").primaryKey().defaultRandom(),
  owner: varchar("owner", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  fullName: varchar("full_name", { length: 510 }).notNull().unique(),
  description: text("description"),
  isPrivate: boolean("is_private").notNull().default(true),
  defaultBranch: varchar("default_branch", { length: 255 }).notNull().default("main"),
  language: text("language").array().notNull().default([]),
  installationId: integer("installation_id").references(() => installations.installationId),
  watched: boolean("watched").notNull().default(true),
  permission: permissionEnum("permission").notNull().default("read-write"),
  schedule: varchar("schedule", { length: 50 }).notNull().default("on-change"),
  lastAnalyzedAt: timestamp("last_analyzed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const callSites = pgTable("call_sites", {
  id: varchar("id", { length: 64 }).primaryKey(),
  repositoryId: uuid("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull(),
  line: integer("line").notNull(),
  method: varchar("method", { length: 255 }).notNull(),
  endpoint: varchar("endpoint", { length: 510 }),
  httpMethod: httpMethodEnum("http_method"),
  requestShape: jsonb("request_shape").notNull().default({}),
  responseFields: text("response_fields").array().notNull().default([]),
  snapshotState: varchar("snapshot_state", { length: 30 })
    .notNull()
    .default("pending-capture"),
  testFiles: text("test_files").array().notNull().default([]),
  lastCheckedAt: timestamp("last_checked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const snapshots = pgTable("snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  callSiteId: varchar("call_site_id", { length: 64 })
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
  id: varchar("id", { length: 128 }).primaryKey(),
  callSiteId: varchar("call_site_id", { length: 64 })
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
  status: driftStatusEnum("drift_status").notNull().default("detected"),
});

export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  repositoryId: uuid("repository_id")
    .notNull()
    .references(() => repositories.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
  status: runStatusEnum("status").notNull().default("pending"),
  exitCode: integer("exit_code"),
  notes: text("notes"),
});

export const settings = pgTable("settings", {
  key: varchar("key", { length: 255 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  keyPrefix: varchar("key_prefix", { length: 24 }).notNull().unique(),
  keyHash: text("key_hash").notNull(),
  masked: varchar("masked", { length: 64 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const webhookEndpoints = pgTable("webhook_endpoints", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  url: text("url").notNull(),
  repositoryId: uuid("repository_id").references(() => repositories.id, { onDelete: "set null" }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const webhookSchemas = pgTable("webhook_schemas", {
  id: uuid("id").primaryKey().defaultRandom(),
  endpointId: varchar("endpoint_id", { length: 64 })
    .notNull()
    .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
  eventType: varchar("event_type", { length: 255 }).notNull(),
  flattenedSchema: jsonb("flattened_schema").notNull(),
  capturedAt: timestamp("captured_at").notNull().defaultNow(),
}, (t) => ({
  endpointEvent: { columns: [t.endpointId, t.eventType], unique: true },
}));

export const webhookDrifts = pgTable("webhook_drifts", {
  id: uuid("id").primaryKey().defaultRandom(),
  endpointId: varchar("endpoint_id", { length: 64 })
    .notNull()
    .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
  eventType: varchar("event_type", { length: 255 }).notNull(),
  diff: jsonb("diff").notNull(),
  previousSchema: jsonb("previous_schema").notNull(),
  newSchema: jsonb("new_schema").notNull(),
  detectedAt: timestamp("detected_at").notNull().defaultNow(),
  status: varchar("status", { length: 30 }).notNull().default("detected"),
});