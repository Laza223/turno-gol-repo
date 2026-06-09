-- ============================================================
-- 009_billing_columns.sql
-- P18 — Billing module + tenant lifecycle.
-- Adds time-anchor columns required by the dunning sweep + recurring billing.
-- ============================================================

ALTER TABLE tenant_subscriptions
  ADD COLUMN dunning_started_at      TIMESTAMPTZ,
  ADD COLUMN last_payment_failed_at  TIMESTAMPTZ,
  ADD COLUMN last_payment_at         TIMESTAMPTZ;

-- Partial index — sweep only scans subs in dunning.
CREATE INDEX idx_tenant_subs_dunning
  ON tenant_subscriptions(dunning_started_at)
  WHERE dunning_started_at IS NOT NULL;

COMMENT ON COLUMN tenant_subscriptions.dunning_started_at IS
  'Anchor for dunning escalation sweep. Set when entering past_due. Cleared on recovery to active.';
COMMENT ON COLUMN tenant_subscriptions.last_payment_failed_at IS
  'Last MP recurring charge rejection. Bumped on every payment.rejected webhook.';
COMMENT ON COLUMN tenant_subscriptions.last_payment_at IS
  'Last successful MP recurring charge. Bumped on every payment.approved webhook for the preapproval.';
