-- Runs once on first container start. Migrations also create these (IF NOT EXISTS),
-- so a database created elsewhere still works.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE DATABASE crowdshield_test OWNER crowdshield;
