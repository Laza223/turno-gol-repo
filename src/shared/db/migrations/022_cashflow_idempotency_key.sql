-- Fix #55: agregar client_idempotency_key a cash_flows para deduplicar
-- doble-submit o reintento de red en RegisterMovementModal.

ALTER TABLE cash_flows
  ADD COLUMN IF NOT EXISTS client_idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_flows_idempotency_key
  ON cash_flows (client_idempotency_key)
  WHERE client_idempotency_key IS NOT NULL;
