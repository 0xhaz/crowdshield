-- Scam intelligence graph: PostgreSQL 16 + pgvector + pgcrypto
-- Host in Malaysia (PDPA). Identifiers are stored as keyed hashes for lookup;
-- raw values are encrypted and only decrypted for authorised investigators.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------- reference types ----------
CREATE TYPE entity_type AS ENUM (
  'phone', 'whatsapp', 'telegram', 'bank_account', 'ewallet',
  'url', 'domain', 'app', 'social_profile', 'crypto_wallet'
);
CREATE TYPE entity_status AS ENUM ('suspected', 'under_review', 'confirmed', 'cleared', 'expired');
CREATE TYPE scam_type AS ENUM (
  'macau_impersonation', 'investment', 'parcel', 'job_task', 'love_romance',
  'ecommerce', 'loan', 'phishing_link', 'malware_apk', 'account_takeover', 'bec_supplier', 'other'
);
CREATE TYPE source_kind AS ENUM (
  'pdrm_semakmule', 'nsrc_case', 'bank_confirmed', 'regulator_alert',
  'threat_feed', 'user_report_verified', 'user_report', 'news_extraction', 'model_inference'
);
CREATE TYPE entity_role AS ENUM (
  'caller', 'messenger', 'payee_account', 'link_sent', 'app_installed',
  'profile_used', 'wallet_used', 'impersonated_official'
);

-- ---------- sources and reporters ----------
CREATE TABLE source (
  id            smallserial PRIMARY KEY,
  kind          source_kind NOT NULL,
  name          text NOT NULL,              -- e.g. 'Maybank fraud ops', 'OpenPhish'
  base_weight   real NOT NULL CHECK (base_weight BETWEEN 0 AND 1),
  active        boolean NOT NULL DEFAULT true
);

CREATE TABLE reporter (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL CHECK (kind IN ('consumer', 'bank', 'ewallet', 'telco', 'agency', 'system')),
  org_id          uuid,                     -- for institutional reporters
  phone_verified  boolean NOT NULL DEFAULT false,
  trust           real NOT NULL DEFAULT 0.30 CHECK (trust BETWEEN 0 AND 1),
  reports_total   int NOT NULL DEFAULT 0,
  reports_upheld  int NOT NULL DEFAULT 0,
  reports_rejected int NOT NULL DEFAULT 0,
  device_fingerprint_hash bytea,            -- sybil detection
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------- entities (nodes) ----------
CREATE TABLE entity (
  id              bigserial PRIMARY KEY,
  type            entity_type NOT NULL,
  lookup_hash     bytea NOT NULL,           -- HMAC-SHA256(pepper, normalised value)
  value_enc       bytea,                    -- pgp_sym_encrypt(normalised value, key)
  display_masked  text NOT NULL,            -- '+60 12-***-4567', 'MBB ****8812', 'bit.ly/…'
  attrs           jsonb NOT NULL DEFAULT '{}', -- bank_code, telco prefix, domain age, apk package…
  status          entity_status NOT NULL DEFAULT 'suspected',
  protected       boolean NOT NULL DEFAULT false, -- official numbers/accounts that scammers spoof
  first_seen      timestamptz NOT NULL DEFAULT now(),
  last_seen       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (type, lookup_hash)
);

-- ---------- cases (incidents) ----------
CREATE TABLE scam_case (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       smallint NOT NULL REFERENCES source(id),
  reporter_id     uuid REFERENCES reporter(id),
  external_ref    text,                     -- NSRC/bank case number
  scam_type       scam_type,
  loss_myr        numeric(14,2),
  occurred_at     timestamptz,
  reported_at     timestamptz NOT NULL DEFAULT now(),
  language        text,                     -- ms, en, zh, ta, mixed
  narrative_redacted text,                  -- PII stripped before any model call
  verification    text NOT NULL DEFAULT 'unverified'
                  CHECK (verification IN ('unverified', 'evidence_attached', 'reviewed', 'confirmed', 'rejected')),
  campaign_id     bigint
);

CREATE TABLE case_evidence (
  id              bigserial PRIMARY KEY,
  case_id         uuid NOT NULL REFERENCES scam_case(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('screenshot', 'audio', 'transcript', 'receipt', 'document')),
  storage_uri     text NOT NULL,            -- encrypted object store in MY
  extracted       jsonb                     -- VL/ASR output: entities, script text
);

-- observation = "this entity played this role in this case" (the evidence edge)
CREATE TABLE observation (
  id              bigserial PRIMARY KEY,
  case_id         uuid NOT NULL REFERENCES scam_case(id) ON DELETE CASCADE,
  entity_id       bigint NOT NULL REFERENCES entity(id),
  role            entity_role NOT NULL,
  source_id       smallint NOT NULL REFERENCES source(id),
  reporter_id     uuid REFERENCES reporter(id),
  observed_at     timestamptz NOT NULL DEFAULT now(),
  weight          real,                     -- computed at insert, see scoring
  UNIQUE (case_id, entity_id, role)
);
CREATE INDEX ON observation (entity_id, observed_at DESC);

-- ---------- derived entity-to-entity edges ----------
CREATE TABLE edge (
  src_id          bigint NOT NULL REFERENCES entity(id),
  dst_id          bigint NOT NULL REFERENCES entity(id),
  kind            text NOT NULL CHECK (kind IN ('co_case', 'money_flow', 'same_campaign', 'same_device', 'redirects_to')),
  alpha           real NOT NULL,            -- propagation strength 0..1
  n_cases         int NOT NULL DEFAULT 1,
  amount_myr      numeric(14,2),            -- money_flow only (bank-supplied)
  last_seen       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (src_id, dst_id, kind)
);
CREATE INDEX ON edge (dst_id);

-- ---------- scripts and campaigns ----------
CREATE TABLE script_snippet (
  id              bigserial PRIMARY KEY,
  case_id         uuid REFERENCES scam_case(id) ON DELETE CASCADE,
  text_redacted   text NOT NULL,
  language        text,
  embedding       vector(1024),             -- e.g. Qwen3-Embedding via Token Factory
  campaign_id     bigint
);
CREATE INDEX ON script_snippet USING hnsw (embedding vector_cosine_ops);

CREATE TABLE campaign (
  id              bigserial PRIMARY KEY,
  label           text NOT NULL,            -- 'Fake LHDN refund call, Oct 2026'
  scam_type       scam_type,
  first_seen      timestamptz NOT NULL,
  last_seen       timestamptz NOT NULL,
  reports_24h     int NOT NULL DEFAULT 0,
  baseline_daily  real NOT NULL DEFAULT 0,
  spike_z         real NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'active'
);

-- ---------- scores (precomputed for <50 ms lookups) ----------
CREATE TABLE entity_score (
  entity_id       bigint PRIMARY KEY REFERENCES entity(id),
  p_direct        real NOT NULL,
  p_graph         real NOT NULL,
  clearing        real NOT NULL DEFAULT 1,
  risk            smallint NOT NULL CHECK (risk BETWEEN 0 AND 100),
  tier            text NOT NULL CHECK (tier IN ('no_known_risk', 'reported', 'caution', 'high', 'confirmed', 'protected_official')),
  confidence      text NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  top_scam_types  scam_type[] NOT NULL DEFAULT '{}',
  n_cases         int NOT NULL DEFAULT 0,
  n_independent_reporters int NOT NULL DEFAULT 0,
  explanation     jsonb NOT NULL,           -- top evidence lines, never reporter identities
  model_version   text NOT NULL,
  computed_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------- appeals and audit ----------
CREATE TABLE appeal (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       bigint NOT NULL REFERENCES entity(id),
  claimant_verified boolean NOT NULL DEFAULT false, -- proved ownership (OTP to number, bank KYC letter)
  reason          text NOT NULL,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'upheld', 'rejected')),
  decided_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  decided_at      timestamptz
);

CREATE TABLE audit_log (
  id              bigserial PRIMARY KEY,
  actor           uuid,
  action          text NOT NULL,            -- lookup, decrypt_value, status_change, appeal_decision…
  entity_id       bigint,
  detail          jsonb,
  policy_version  text NOT NULL,
  at              timestamptz NOT NULL DEFAULT now()
);

-- ---------- post-incident tracing ----------
-- Timeline of everything that happened in a case, from the victim's side.
CREATE TABLE incident_event (
  id              bigserial PRIMARY KEY,
  case_id         uuid NOT NULL REFERENCES scam_case(id) ON DELETE CASCADE,
  at              timestamptz NOT NULL,     -- exact time from call log / chat / bank record
  channel         text NOT NULL CHECK (channel IN ('voice_call', 'whatsapp_call', 'sms', 'whatsapp_msg',
                                                    'telegram', 'social', 'website', 'app_install', 'transfer', 'other')),
  kind            text NOT NULL,            -- first_contact, transfer_to_officer, pressure, link_clicked, transfer, report…
  entity_id       bigint REFERENCES entity(id),
  duration_sec    int,
  detail_redacted text,
  evidence_id     bigint REFERENCES case_evidence(id)
);
CREATE INDEX ON incident_event (case_id, at);

-- NSRC / police references and near-miss flag.
ALTER TABLE scam_case ADD COLUMN nsrc_ref text, ADD COLUMN police_report_no text,
                      ADD COLUMN near_miss boolean NOT NULL DEFAULT false,   -- scam attempted, no money lost
                      ADD COLUMN share_consent_at timestamptz;               -- explicit consent to share with NSRC/PDRM

-- Victim location kept coarse (state/district) for hotspot analytics; never street-level.
ALTER TABLE scam_case ADD COLUMN victim_state text, ADD COLUMN victim_district text,
                      ADD COLUMN victim_age_band text CHECK (victim_age_band IN ('<25','25-39','40-59','60+'));

-- Money trail across accounts (bank-supplied, consortium members / National Fraud Portal).
CREATE TABLE fund_hop (
  id              bigserial PRIMARY KEY,
  case_id         uuid NOT NULL REFERENCES scam_case(id) ON DELETE CASCADE,
  hop_no          smallint NOT NULL,        -- 1 = victim -> first mule
  from_entity     bigint NOT NULL REFERENCES entity(id),
  to_entity       bigint REFERENCES entity(id),
  amount_myr      numeric(14,2) NOT NULL,
  at              timestamptz NOT NULL,
  rail            text CHECK (rail IN ('duitnow', 'ibg', 'fpx', 'instant_transfer', 'ewallet', 'card', 'crypto', 'cash')),
  txn_ref         text,                     -- bank/DuitNow transaction reference: needed for NSRC/NFP tracing
  sender_bank     text,
  receiver_bank   text,
  frozen_myr      numeric(14,2) NOT NULL DEFAULT 0,
  reported_by_org uuid
);
CREATE INDEX ON fund_hop (case_id, hop_no);

-- Where money left the system. Restricted: visible to the reporting bank and law enforcement only.
CREATE TABLE cashout_event (
  id              bigserial PRIMARY KEY,
  case_id         uuid NOT NULL REFERENCES scam_case(id) ON DELETE CASCADE,
  entity_id       bigint NOT NULL REFERENCES entity(id),
  at              timestamptz NOT NULL,
  method          text NOT NULL CHECK (method IN ('atm', 'branch', 'crypto_exchange', 'money_changer', 'merchant', 'overseas_transfer')),
  location_ref    text,                     -- ATM ID / branch code / exchange name, as supplied by the bank
  state           text,
  amount_myr      numeric(14,2),
  access_level    text NOT NULL DEFAULT 'law_enforcement'
);

-- Hand-off to PDRM / NSRC and what came back.
CREATE TABLE le_referral (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         uuid NOT NULL REFERENCES scam_case(id) ON DELETE CASCADE,
  agency          text NOT NULL,            -- NSRC 997, PDRM CCID, MCMC, BNM
  external_ref    text,                     -- police report no. / NSRC ref
  sent_at         timestamptz NOT NULL DEFAULT now(),
  evidence_pack_uri text,                   -- signed, hashed bundle
  pack_sha256     bytea,
  status          text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'acknowledged', 'investigating', 'charged', 'closed')),
  recovered_myr   numeric(14,2) NOT NULL DEFAULT 0
);

-- Seed source weights (tune with outcome data)
INSERT INTO source (kind, name, base_weight) VALUES
 ('pdrm_semakmule',      'PDRM Semak Mule',              0.95),
 ('bank_confirmed',      'Member bank confirmed mule',   0.90),
 ('nsrc_case',           'NSRC case reference',          0.85),
 ('regulator_alert',     'BNM FCA / SC Investor Alert',  0.80),
 ('threat_feed',         'Phishing / malware feeds',     0.60),
 ('news_extraction',     'News and police statements',   0.50),
 ('user_report_verified','User report with evidence',    0.40),
 ('user_report',         'User report, no evidence',     0.25),
 ('model_inference',     'Model-flagged (not evidence)', 0.00);
