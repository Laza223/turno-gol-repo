-- ============================================================
-- 011_notification_sending_enum.sql
-- B10 — Add `sending` claim state to notification_status enum.
--
-- Port of supabase/migrations/20260525000001_notification_sending_enum.sql
-- (see docs/MIGRATIONS.md). Idempotent: ADD VALUE IF NOT EXISTS.
--
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction block in
-- some PostgreSQL versions; psql -f executes file statements outside an
-- explicit BEGIN here, which is fine.
-- ============================================================

ALTER TYPE notification_status ADD VALUE IF NOT EXISTS 'sending' AFTER 'queued';

COMMENT ON TYPE notification_status IS
  'Lifecycle: queued -> sending -> sent | delivered | failed. The `sending` claim prevents double-dispatch under sweep races (B5/B10).';
