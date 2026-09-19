CREATE TYPE "public"."confidence" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."drift_status" AS ENUM('detected', 'fix_generated', 'pr_opened', 'merged', 'closed', 'false_positive');--> statement-breakpoint
CREATE TYPE "public"."fix_type" AS ENUM('field_rename', 'type_coercion', 'null_check', 'default_value', 'custom');--> statement-breakpoint
CREATE TYPE "public"."http_method" AS ENUM('GET', 'POST', 'PUT', 'DELETE', 'PATCH');--> statement-breakpoint
CREATE TYPE "public"."repo_permission" AS ENUM('read', 'read-write', 'suggest-only');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('pending', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"key_prefix" varchar(24) NOT NULL,
	"key_hash" text NOT NULL,
	"masked" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_prefix_unique" UNIQUE("key_prefix")
);
--> statement-breakpoint
CREATE TABLE "call_sites" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"repository_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"line" integer NOT NULL,
	"method" varchar(255) NOT NULL,
	"endpoint" varchar(510),
	"http_method" "http_method",
	"request_shape" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_fields" text[] DEFAULT '{}' NOT NULL,
	"snapshot_state" varchar(30) DEFAULT 'pending-capture' NOT NULL,
	"test_files" text[] DEFAULT '{}' NOT NULL,
	"last_checked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drift_events" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"call_site_id" varchar(64) NOT NULL,
	"old_snapshot_id" uuid NOT NULL,
	"new_snapshot_id" uuid NOT NULL,
	"diff_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"suggested_fix" jsonb,
	"confidence" "confidence" NOT NULL,
	"pr_number" integer,
	"drift_status" "drift_status" DEFAULT 'detected' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" integer NOT NULL,
	"account_login" varchar(255) NOT NULL,
	"account_type" varchar(50) NOT NULL,
	"app_id" integer NOT NULL,
	"target_selection" varchar(50) DEFAULT 'selected' NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"events" text[] DEFAULT '{}' NOT NULL,
	"active" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "installations_installation_id_unique" UNIQUE("installation_id")
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"full_name" varchar(510) NOT NULL,
	"description" text,
	"is_private" boolean DEFAULT true NOT NULL,
	"default_branch" varchar(255) DEFAULT 'main' NOT NULL,
	"language" text[] DEFAULT '{}' NOT NULL,
	"installation_id" integer,
	"watched" boolean DEFAULT true NOT NULL,
	"permission" "repo_permission" DEFAULT 'read-write' NOT NULL,
	"schedule" varchar(50) DEFAULT 'on-change' NOT NULL,
	"last_analyzed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "repositories_full_name_unique" UNIQUE("full_name")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"status" "run_status" DEFAULT 'pending' NOT NULL,
	"exit_code" integer,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_site_id" varchar(64) NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"request_shape" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_shape" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"test_command" text NOT NULL,
	"exit_code" integer NOT NULL,
	"duration" integer NOT NULL,
	"traffic_captured" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_sites" ADD CONSTRAINT "call_sites_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drift_events" ADD CONSTRAINT "drift_events_call_site_id_call_sites_id_fk" FOREIGN KEY ("call_site_id") REFERENCES "public"."call_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drift_events" ADD CONSTRAINT "drift_events_old_snapshot_id_snapshots_id_fk" FOREIGN KEY ("old_snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drift_events" ADD CONSTRAINT "drift_events_new_snapshot_id_snapshots_id_fk" FOREIGN KEY ("new_snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_installation_id_installations_installation_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("installation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_call_site_id_call_sites_id_fk" FOREIGN KEY ("call_site_id") REFERENCES "public"."call_sites"("id") ON DELETE cascade ON UPDATE no action;