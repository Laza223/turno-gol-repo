-- Local dev only: pre-create the app-level roles that
-- src/shared/db/migrations/008_revokes.sql (and 037+) assume already exist.
-- Supabase CLI runs this ("Seeding globals from roles.sql...") before
-- applying supabase/migrations/, so `supabase db reset`/`start` can
-- complete migrations end-to-end from a clean volume. Mirrors what CI does
-- via an inline psql bootstrap (see .github/workflows/ci.yml) and what
-- scripts/bootstrap-test-db.mjs does for the non-CLI local test path.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'turnogol_app') THEN
    CREATE ROLE turnogol_app NOLOGIN;
  END IF;
END $$;
