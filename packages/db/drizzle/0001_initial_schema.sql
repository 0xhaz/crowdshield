CREATE TYPE "public"."entity_role" AS ENUM('caller', 'messenger', 'payee_account', 'link_sent', 'app_installed', 'profile_used', 'wallet_used', 'impersonated_official');--> statement-breakpoint
CREATE TYPE "public"."entity_status" AS ENUM('suspected', 'under_review', 'confirmed', 'cleared', 'expired');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('phone', 'whatsapp', 'telegram', 'bank_account', 'ewallet', 'url', 'domain', 'app', 'social_profile', 'crypto_wallet');--> statement-breakpoint
CREATE TYPE "public"."scam_type" AS ENUM('macau_impersonation', 'investment', 'parcel', 'job_task', 'love_romance', 'ecommerce', 'loan', 'phishing_link', 'malware_apk', 'account_takeover', 'bec_supplier', 'other');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('pdrm_semakmule', 'nsrc_case', 'bank_confirmed', 'regulator_alert', 'threat_feed', 'user_report_verified', 'user_report', 'news_extraction', 'model_inference');--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "app_user_email_unique" UNIQUE("email"),
	CONSTRAINT "app_user_role_check" CHECK ("app_user"."role" IN ('bank_analyst', 'bank_supervisor', 'sme_owner', 'sme_member', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "org" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_kind_check" CHECK ("org"."kind" IN ('bank', 'ewallet', 'sme', 'agency', 'platform'))
);
--> statement-breakpoint
CREATE TABLE "appeal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" bigint NOT NULL,
	"claimant_verified" boolean DEFAULT false NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"decided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "appeal_status_check" CHECK ("appeal"."status" IN ('open', 'upheld', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor" uuid,
	"org_id" uuid,
	"action" text NOT NULL,
	"entity_id" bigint,
	"detail" jsonb,
	"policy_version" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"scam_type" "scam_type",
	"first_seen" timestamp with time zone NOT NULL,
	"last_seen" timestamp with time zone NOT NULL,
	"reports_24h" integer DEFAULT 0 NOT NULL,
	"baseline_daily" real DEFAULT 0 NOT NULL,
	"spike_z" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_evidence" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"storage_uri" text NOT NULL,
	"sha256" "bytea",
	"extracted" jsonb,
	CONSTRAINT "case_evidence_kind_check" CHECK ("case_evidence"."kind" IN ('screenshot', 'audio', 'transcript', 'receipt', 'document'))
);
--> statement-breakpoint
CREATE TABLE "edge" (
	"src_id" bigint NOT NULL,
	"dst_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"alpha" real NOT NULL,
	"n_cases" integer DEFAULT 1 NOT NULL,
	"amount_myr" numeric(14, 2),
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edge_src_id_dst_id_kind_pk" PRIMARY KEY("src_id","dst_id","kind"),
	CONSTRAINT "edge_kind_check" CHECK ("edge"."kind" IN ('co_case', 'money_flow', 'same_campaign', 'same_device', 'redirects_to')),
	CONSTRAINT "edge_alpha_check" CHECK ("edge"."alpha" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "entity" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" "entity_type" NOT NULL,
	"lookup_hash" "bytea" NOT NULL,
	"value_enc" "bytea",
	"display_masked" text NOT NULL,
	"attrs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "entity_status" DEFAULT 'suspected' NOT NULL,
	"protected" boolean DEFAULT false NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_type_lookup_hash_key" UNIQUE("type","lookup_hash")
);
--> statement-breakpoint
CREATE TABLE "entity_score" (
	"entity_id" bigint PRIMARY KEY NOT NULL,
	"p_direct" real NOT NULL,
	"p_graph" real NOT NULL,
	"clearing" real DEFAULT 1 NOT NULL,
	"risk" smallint NOT NULL,
	"tier" text NOT NULL,
	"confidence" text NOT NULL,
	"top_scam_types" "scam_type"[] DEFAULT '{}' NOT NULL,
	"n_cases" integer DEFAULT 0 NOT NULL,
	"n_independent_reporters" integer DEFAULT 0 NOT NULL,
	"explanation" jsonb NOT NULL,
	"model_version" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_score_risk_check" CHECK ("entity_score"."risk" BETWEEN 0 AND 100),
	CONSTRAINT "entity_score_tier_check" CHECK ("entity_score"."tier" IN ('no_known_risk', 'reported', 'caution', 'high', 'confirmed', 'protected_official')),
	CONSTRAINT "entity_score_confidence_check" CHECK ("entity_score"."confidence" IN ('low', 'medium', 'high'))
);
--> statement-breakpoint
CREATE TABLE "observation" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"entity_id" bigint NOT NULL,
	"role" "entity_role" NOT NULL,
	"source_id" smallint NOT NULL,
	"reporter_id" uuid,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"weight" real,
	CONSTRAINT "observation_case_id_entity_id_role_key" UNIQUE("case_id","entity_id","role")
);
--> statement-breakpoint
CREATE TABLE "reporter" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"org_id" uuid,
	"phone_verified" boolean DEFAULT false NOT NULL,
	"trust" real DEFAULT 0.3 NOT NULL,
	"reports_total" integer DEFAULT 0 NOT NULL,
	"reports_upheld" integer DEFAULT 0 NOT NULL,
	"reports_rejected" integer DEFAULT 0 NOT NULL,
	"device_fingerprint_hash" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reporter_kind_check" CHECK ("reporter"."kind" IN ('consumer', 'bank', 'ewallet', 'telco', 'agency', 'system')),
	CONSTRAINT "reporter_trust_check" CHECK ("reporter"."trust" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "scam_case" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" smallint NOT NULL,
	"reporter_id" uuid,
	"org_id" uuid,
	"external_ref" text,
	"scam_type" "scam_type",
	"loss_myr" numeric(14, 2),
	"occurred_at" timestamp with time zone,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"language" text,
	"narrative_redacted" text,
	"verification" text DEFAULT 'unverified' NOT NULL,
	"campaign_id" bigint,
	"nsrc_ref" text,
	"police_report_no" text,
	"near_miss" boolean DEFAULT false NOT NULL,
	"share_consent_at" timestamp with time zone,
	"victim_state" text,
	"victim_district" text,
	"victim_age_band" text,
	CONSTRAINT "scam_case_verification_check" CHECK ("scam_case"."verification" IN ('unverified', 'evidence_attached', 'reviewed', 'confirmed', 'rejected')),
	CONSTRAINT "scam_case_victim_age_band_check" CHECK ("scam_case"."victim_age_band" IN ('<25', '25-39', '40-59', '60+'))
);
--> statement-breakpoint
CREATE TABLE "script_snippet" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"case_id" uuid,
	"text_redacted" text NOT NULL,
	"language" text,
	"embedding" vector(1024),
	"campaign_id" bigint
);
--> statement-breakpoint
CREATE TABLE "source" (
	"id" "smallserial" PRIMARY KEY NOT NULL,
	"kind" "source_kind" NOT NULL,
	"name" text NOT NULL,
	"base_weight" real NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "source_base_weight_check" CHECK ("source"."base_weight" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE TABLE "cashout_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"entity_id" bigint NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"method" text NOT NULL,
	"location_ref" text,
	"state" text,
	"amount_myr" numeric(14, 2),
	"access_level" text DEFAULT 'law_enforcement' NOT NULL,
	"reported_by_org" uuid,
	CONSTRAINT "cashout_event_method_check" CHECK ("cashout_event"."method" IN ('atm', 'branch', 'crypto_exchange', 'money_changer', 'merchant', 'overseas_transfer'))
);
--> statement-breakpoint
CREATE TABLE "fund_hop" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"hop_no" smallint NOT NULL,
	"from_entity" bigint NOT NULL,
	"to_entity" bigint,
	"amount_myr" numeric(14, 2) NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"rail" text,
	"txn_ref" text,
	"sender_bank" text,
	"receiver_bank" text,
	"frozen_myr" numeric(14, 2) DEFAULT '0' NOT NULL,
	"reported_by_org" uuid,
	CONSTRAINT "fund_hop_rail_check" CHECK ("fund_hop"."rail" IN ('duitnow', 'ibg', 'fpx', 'instant_transfer', 'ewallet', 'card', 'crypto', 'cash'))
);
--> statement-breakpoint
CREATE TABLE "incident_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"channel" text NOT NULL,
	"kind" text NOT NULL,
	"entity_id" bigint,
	"duration_sec" integer,
	"detail_redacted" text,
	"evidence_id" bigint,
	CONSTRAINT "incident_event_channel_check" CHECK ("incident_event"."channel" IN ('voice_call', 'whatsapp_call', 'sms', 'whatsapp_msg', 'telegram', 'social', 'website', 'app_install', 'transfer', 'other'))
);
--> statement-breakpoint
CREATE TABLE "le_referral" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"agency" text NOT NULL,
	"external_ref" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evidence_pack_uri" text,
	"pack_sha256" "bytea",
	"status" text DEFAULT 'sent' NOT NULL,
	"recovered_myr" numeric(14, 2) DEFAULT '0' NOT NULL,
	CONSTRAINT "le_referral_status_check" CHECK ("le_referral"."status" IN ('sent', 'acknowledged', 'investigating', 'charged', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "alert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text DEFAULT 'payee_check' NOT NULL,
	"entity_id" bigint NOT NULL,
	"case_id" uuid,
	"risk" smallint NOT NULL,
	"tier" text NOT NULL,
	"call_signal" boolean DEFAULT false NOT NULL,
	"amount_myr" numeric(14, 2),
	"rail" text,
	"request" jsonb,
	"verdict" jsonb,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_to" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "alert_kind_check" CHECK ("alert"."kind" IN ('payee_check', 'campaign', 'mule_pattern')),
	CONSTRAINT "alert_tier_check" CHECK ("alert"."tier" IN ('no_known_risk', 'reported', 'caution', 'high', 'confirmed', 'protected_official')),
	CONSTRAINT "alert_status_check" CHECK ("alert"."status" IN ('open', 'in_review', 'held', 'released', 'frozen', 'confirmed_mule', 'cleared')),
	CONSTRAINT "alert_risk_check" CHECK ("alert"."risk" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "intervention" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"alert_id" uuid,
	"case_id" uuid,
	"entity_id" bigint,
	"action" text NOT NULL,
	"actor" uuid,
	"note" text,
	"policy_version" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intervention_action_check" CHECK ("intervention"."action" IN ('warn', 'hold', 'release', 'callback', 'freeze', 'confirm_mule', 'clear', 'report_nsrc', 'report_nfp')),
	CONSTRAINT "intervention_target_check" CHECK ("intervention"."alert_id" IS NOT NULL OR "intervention"."case_id" IS NOT NULL OR "intervention"."entity_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "invoice_check" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"supplier_id" uuid,
	"submitted_by" uuid,
	"channel" text NOT NULL,
	"evidence_uri" text,
	"extracted" jsonb,
	"result" jsonb,
	"risk" text,
	"bank_detail_changed" boolean DEFAULT false NOT NULL,
	"amount_myr" numeric(14, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_check_channel_check" CHECK ("invoice_check"."channel" IN ('web', 'whatsapp', 'telegram', 'email')),
	CONSTRAINT "invoice_check_risk_check" CHECK ("invoice_check"."risk" IN ('low', 'caution', 'high'))
);
--> statement-breakpoint
CREATE TABLE "payment_hold" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"invoice_check_id" uuid NOT NULL,
	"status" text DEFAULT 'on_hold' NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_hold_invoiceCheckId_unique" UNIQUE("invoice_check_id"),
	CONSTRAINT "payment_hold_status_check" CHECK ("payment_hold"."status" IN ('on_hold', 'verified', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "supplier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"ssm_no" text,
	"tin" text,
	"bank_code" text,
	"account_hash" "bytea",
	"account_masked" text,
	"account_holder_name" text,
	"callback_phone" text,
	"email_domain" text,
	"status" text DEFAULT 'unverified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_org_id_ssm_no_key" UNIQUE("org_id","ssm_no"),
	CONSTRAINT "supplier_status_check" CHECK ("supplier"."status" IN ('unverified', 'verified', 'flagged', 'blocked'))
);
--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeal" ADD CONSTRAINT "appeal_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_evidence" ADD CONSTRAINT "case_evidence_case_id_scam_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."scam_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edge" ADD CONSTRAINT "edge_src_id_entity_id_fk" FOREIGN KEY ("src_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edge" ADD CONSTRAINT "edge_dst_id_entity_id_fk" FOREIGN KEY ("dst_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_score" ADD CONSTRAINT "entity_score_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation" ADD CONSTRAINT "observation_case_id_scam_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."scam_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation" ADD CONSTRAINT "observation_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation" ADD CONSTRAINT "observation_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation" ADD CONSTRAINT "observation_reporter_id_reporter_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."reporter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporter" ADD CONSTRAINT "reporter_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scam_case" ADD CONSTRAINT "scam_case_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scam_case" ADD CONSTRAINT "scam_case_reporter_id_reporter_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."reporter"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scam_case" ADD CONSTRAINT "scam_case_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scam_case" ADD CONSTRAINT "scam_case_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_snippet" ADD CONSTRAINT "script_snippet_case_id_scam_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."scam_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_snippet" ADD CONSTRAINT "script_snippet_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashout_event" ADD CONSTRAINT "cashout_event_case_id_scam_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."scam_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashout_event" ADD CONSTRAINT "cashout_event_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashout_event" ADD CONSTRAINT "cashout_event_reported_by_org_org_id_fk" FOREIGN KEY ("reported_by_org") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_hop" ADD CONSTRAINT "fund_hop_case_id_scam_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."scam_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_hop" ADD CONSTRAINT "fund_hop_from_entity_entity_id_fk" FOREIGN KEY ("from_entity") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_hop" ADD CONSTRAINT "fund_hop_to_entity_entity_id_fk" FOREIGN KEY ("to_entity") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fund_hop" ADD CONSTRAINT "fund_hop_reported_by_org_org_id_fk" FOREIGN KEY ("reported_by_org") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_event" ADD CONSTRAINT "incident_event_case_id_scam_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."scam_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_event" ADD CONSTRAINT "incident_event_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_event" ADD CONSTRAINT "incident_event_evidence_id_case_evidence_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."case_evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "le_referral" ADD CONSTRAINT "le_referral_case_id_scam_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."scam_case"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_case_id_scam_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."scam_case"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_assigned_to_app_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervention" ADD CONSTRAINT "intervention_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervention" ADD CONSTRAINT "intervention_alert_id_alert_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alert"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervention" ADD CONSTRAINT "intervention_case_id_scam_case_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."scam_case"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervention" ADD CONSTRAINT "intervention_entity_id_entity_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervention" ADD CONSTRAINT "intervention_actor_app_user_id_fk" FOREIGN KEY ("actor") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_check" ADD CONSTRAINT "invoice_check_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_check" ADD CONSTRAINT "invoice_check_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_check" ADD CONSTRAINT "invoice_check_submitted_by_app_user_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_hold" ADD CONSTRAINT "payment_hold_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_hold" ADD CONSTRAINT "payment_hold_invoice_check_id_invoice_check_id_fk" FOREIGN KEY ("invoice_check_id") REFERENCES "public"."invoice_check"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_hold" ADD CONSTRAINT "payment_hold_decided_by_app_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_org_id_org_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."org"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_user_org_id_idx" ON "app_user" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_id_at_idx" ON "audit_log" USING btree ("entity_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "edge_dst_id_idx" ON "edge" USING btree ("dst_id");--> statement-breakpoint
CREATE INDEX "observation_entity_id_observed_at_idx" ON "observation" USING btree ("entity_id","observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "scam_case_campaign_id_idx" ON "scam_case" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "script_snippet_embedding_idx" ON "script_snippet" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "script_snippet_campaign_id_idx" ON "script_snippet" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "fund_hop_case_id_hop_no_idx" ON "fund_hop" USING btree ("case_id","hop_no");--> statement-breakpoint
CREATE INDEX "incident_event_case_id_at_idx" ON "incident_event" USING btree ("case_id","at");--> statement-breakpoint
CREATE INDEX "alert_org_id_status_created_at_idx" ON "alert" USING btree ("org_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "alert_entity_id_idx" ON "alert" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "intervention_alert_id_idx" ON "intervention" USING btree ("alert_id");--> statement-breakpoint
CREATE INDEX "intervention_case_id_idx" ON "intervention" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "invoice_check_org_id_created_at_idx" ON "invoice_check" USING btree ("org_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "payment_hold_org_id_status_idx" ON "payment_hold" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "supplier_org_id_tin_idx" ON "supplier" USING btree ("org_id","tin");--> statement-breakpoint
CREATE INDEX "supplier_name_trgm_idx" ON "supplier" USING gin ("name" gin_trgm_ops);