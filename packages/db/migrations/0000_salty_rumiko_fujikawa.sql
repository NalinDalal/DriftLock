CREATE TYPE "public"."confidence" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."drift_status" AS ENUM('detected', 'fix_generated', 'pr_opened', 'merged', 'closed', 'false_positive');--> statement-breakpoint
CREATE TYPE "public"."fix_type" AS ENUM('field_rename', 'type_coercion', 'null_check', 'default_value', 'custom');--> statement-breakpoint
CREATE TYPE "public"."http_method" AS ENUM('GET', 'POST', 'PUT', 'DELETE', 'PATCH');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "call_sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"line" integer NOT NULL,
	"method" varchar(255) NOT NULL,
	"endpoint" varchar(510) NOT NULL,
	"http_method" "http_method" NOT NULL,
	"request_shape" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_fields" text[] DEFAULT '{}' NOT NULL,
	"test_files" text[] DEFAULT '{}' NOT NULL,
	"last_checked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drift_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_site_id" uuid NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"old_snapshot_id" uuid NOT NULL,
	"new_snapshot_id" uuid NOT NULL,
	"diff_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"suggested_fix" jsonb,
	"confidence" "confidence" NOT NULL,
	"pr_number" integer,
	"status" "drift_status" DEFAULT 'detected' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"full_name" varchar(510) NOT NULL,
	"installation_id" integer NOT NULL,
	"default_branch" varchar(255) DEFAULT 'main' NOT NULL,
	"language" text[] DEFAULT '{}' NOT NULL,
	"last_analyzed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_site_id" uuid NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"request_shape" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_shape" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"test_command" text NOT NULL,
	"exit_code" integer NOT NULL,
	"duration" integer NOT NULL,
	"traffic_captured" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "call_sites" ADD CONSTRAINT "call_sites_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drift_events" ADD CONSTRAINT "drift_events_call_site_id_call_sites_id_fk" FOREIGN KEY ("call_site_id") REFERENCES "public"."call_sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drift_events" ADD CONSTRAINT "drift_events_old_snapshot_id_snapshots_id_fk" FOREIGN KEY ("old_snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drift_events" ADD CONSTRAINT "drift_events_new_snapshot_id_snapshots_id_fk" FOREIGN KEY ("new_snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_call_site_id_call_sites_id_fk" FOREIGN KEY ("call_site_id") REFERENCES "public"."call_sites"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
