-- Bank-traced money trails (apps/api money-trail). The 'bank_trace' source row (weight 0.25) is
-- inserted by the app on first use: Postgres can't use a new enum value in the transaction that adds it.
ALTER TYPE "public"."entity_role" ADD VALUE 'traced_recipient';--> statement-breakpoint
ALTER TYPE "public"."source_kind" ADD VALUE 'bank_trace' BEFORE 'regulator_alert';