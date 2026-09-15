CREATE TABLE IF NOT EXISTS "installations" (
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
DO $$ BEGIN
 ALTER TABLE "repositories" ADD CONSTRAINT "repositories_installation_id_installations_installation_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."installations"("installation_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
