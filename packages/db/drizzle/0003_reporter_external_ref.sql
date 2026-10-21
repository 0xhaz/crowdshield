ALTER TABLE "reporter" DROP CONSTRAINT "reporter_kind_check";--> statement-breakpoint
ALTER TABLE "reporter" ADD COLUMN "external_ref_hash" "bytea";--> statement-breakpoint
ALTER TABLE "reporter" ADD CONSTRAINT "reporter_externalRefHash_unique" UNIQUE("external_ref_hash");--> statement-breakpoint
ALTER TABLE "reporter" ADD CONSTRAINT "reporter_kind_check" CHECK ("reporter"."kind" IN ('consumer', 'bank', 'ewallet', 'telco', 'agency', 'sme', 'system'));