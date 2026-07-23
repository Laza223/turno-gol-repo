-- ============================================================
-- 049_daily_cash_opens.sql
-- Apertura de caja (rediseño Caja y Cantina): fondo inicial en efectivo
-- por día. Sin fondo inicial el arqueo nunca puede dar exacto (siempre hay
-- plata de cambio en la caja al abrir).
-- Spec: docs/superpowers/specs/2026-07-22-caja-cantina-redesign-design.md
--
-- La apertura es EDITABLE mientras el día está abierto (typo del fondo);
-- por eso es tabla propia y no columnas del close (daily_cash_closes es
-- inmutable por REVOKE, migr. 008). Al cerrar, closeDailyRegister snapshotea
-- opening_cash y expected_cash en la fila del close — el recibo queda
-- autocontenido e inmutable. El guard de "no abrir/editar con día cerrado"
-- corre a nivel service bajo el advisory lock daily_close:{tenantId}.
-- ============================================================

CREATE TABLE daily_cash_opens (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES tenants(id),
  date         date        NOT NULL,
  opening_cash integer     NOT NULL DEFAULT 0,  -- centavos ARS
  note         text,
  opened_by    uuid        NOT NULL REFERENCES staff_users(id),
  opened_at    timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_daily_open_per_tenant UNIQUE (tenant_id, date),
  CONSTRAINT chk_opening_cash_nonneg  CHECK (opening_cash >= 0)
);

CREATE INDEX idx_daily_opens_tenant ON daily_cash_opens(tenant_id, date);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON daily_cash_opens
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE daily_cash_opens ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_cash_opens FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'daily_cash_opens' AND policyname = 'daily_cash_opens_select'
  ) THEN
    CREATE POLICY daily_cash_opens_select ON daily_cash_opens
      FOR SELECT
      USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'daily_cash_opens' AND policyname = 'daily_cash_opens_insert'
  ) THEN
    CREATE POLICY daily_cash_opens_insert ON daily_cash_opens
      FOR INSERT
      WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'daily_cash_opens' AND policyname = 'daily_cash_opens_update'
  ) THEN
    CREATE POLICY daily_cash_opens_update ON daily_cash_opens
      FOR UPDATE
      USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);
  END IF;
END $$;
-- Sin policy de DELETE: la apertura no se borra (se edita mientras el día
-- está abierto y queda como registro histórico después).

REVOKE DELETE ON daily_cash_opens FROM turnogol_app;

-- Snapshot en el cierre. Nullable = cierre legacy (anterior a esta migración):
-- la UI branchea por NULL y muestra el formato viejo — NUNCA reinterpretar
-- diff_amount de filas viejas con la fórmula nueva.
ALTER TABLE daily_cash_closes ADD COLUMN opening_cash  integer;
ALTER TABLE daily_cash_closes ADD COLUMN expected_cash integer;
-- El REVOKE UPDATE/DELETE de 008/037 sobre daily_cash_closes sigue intacto.
