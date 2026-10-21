ALTER TABLE "campaign" ADD COLUMN "origin" text DEFAULT 'seed' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "summary" jsonb;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "reviewed_at" timestamp with time zone;