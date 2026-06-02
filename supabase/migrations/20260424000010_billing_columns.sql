-- ============================================================
-- 010_billing_columns.sql
-- P18 / B4 — Billing module + tenant lifecycle.
-- Adds time-anchor columns required by the dunning sweep + recurring billing.
--
-- Port of supabase/migrations/20260424000009_billing_columns.sql
-- (see docs/MIGRATIONS.md). Idempotent: safe to re-apply.
-- ============================================================

ALTER TABLE tenant_subscriptions
  ADD COLUMN IF NOT EXISTS dunning_started_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_payment_failed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_payment_at         TIMESTAMPTZ;

-- Partial index — sweep only scans subs in dunning.
CREATE INDEX IF NOT EXISTS idx_tenant_subs_dunning
  ON tenant_subscriptions(dunning_started_at)
  WHERE dunning_started_at IS NOT NULL;

COMMENT ON COLUMN tenant_subscriptions.dunning_started_at IS
  'Anchor for dunning escalation sweep. Set when entering past_due. Cleared on recovery to active.';
COMMENT ON COLUMN tenant_subscriptions.last_payment_failed_at IS
  'Last MP recurring charge rejection. Bumped on every payment.rejected webhook.';
COMMENT ON COLUMN tenant_subscriptions.last_payment_at IS
  'Last successful MP recurring charge. Bumped on every payment.approved webhook for the preapproval.';
