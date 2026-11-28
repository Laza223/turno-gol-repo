-- ============================================================
-- 121_booking_settlements_and_abonado_billing.sql
-- Acuerdos mensuales, packs de turnos y marca de turnos saldados.
-- Sin columna de texto libre sobre personas (Ley 25.326): quien y cuando
-- quedan en created_by_staff / voided_by_staff y en audit_logs.
-- Un turno dado por perdido (108_booking_write_offs) no se salda y uno saldado
-- no se da por perdido: lo hace la capa de servicio, no esta migracion.
-- ============================================================

-- 1. Modo de cobro recurrente y monto acordado en abonados.
ALTER TABLE abonados
  ADD COLUMN billing_mode text NOT NULL DEFAULT 'per_session'
    CONSTRAINT chk_abonados_billing_mode CHECK (billing_mode IN ('per_session', 'monthly', 'pack')),
  ADD COLUMN agreed_amount integer NOT NULL DEFAULT 0
    CONSTRAINT chk_abonados_agreed_amount_non_negative CHECK (agreed_amount >= 0);

-- 2. Tabla de acuerdos saldados / packs / pagos mensuales / lotes.
CREATE TABLE booking_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  abonado_id uuid REFERENCES abonados(id) ON DELETE SET NULL,
  court_id uuid REFERENCES courts(id) ON DELETE SET NULL,
  kind text NOT NULL
    CONSTRAINT chk_booking_settlements_kind CHECK (kind IN ('pack', 'monthly', 'bookings')),
  payment_origin text NOT NULL
    CONSTRAINT chk_booking_settlements_origin CHECK (payment_origin IN ('caja', 'already_settled')),
  amount integer NOT NULL DEFAULT 0
    CONSTRAINT chk_booking_settlements_amount CHECK (
      (payment_origin = 'caja' AND amount > 0)
      OR (payment_origin = 'already_settled' AND amount >= 0)
    ),
  credits_total integer
    CONSTRAINT chk_booking_settlements_credits CHECK (
      (kind = 'pack' AND credits_total IS NOT NULL AND credits_total >= 1)
      OR (kind <> 'pack' AND credits_total IS NULL)
    ),
  period_start date,
  period_end date,
  CONSTRAINT chk_booking_settlements_period CHECK (
    (kind = 'monthly' AND period_start IS NOT NULL AND period_end IS NOT NULL AND period_end >= period_start)
    OR (kind <> 'monthly' AND period_start IS NULL AND period_end IS NULL)
  ),
  created_by_staff uuid NOT NULL REFERENCES staff_users(id),
  voided_at timestamptz,
  voided_by_staff uuid REFERENCES staff_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_settlements_tenant_created
  ON booking_settlements (tenant_id, created_at);

CREATE INDEX idx_booking_settlements_abonado_active
  ON booking_settlements (tenant_id, abonado_id)
  WHERE abonado_id IS NOT NULL AND voided_at IS NULL;

ALTER TABLE booking_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_settlements FORCE ROW LEVEL SECURITY;

CREATE POLICY booking_settlements_tenant ON booking_settlements FOR ALL TO turnogol_app
  USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON booking_settlements TO turnogol_app, turnogol_worker;
REVOKE ALL ON booking_settlements FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON booking_settlements FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON booking_settlements FROM authenticated; END IF;
END $$;

-- 3. Referencias desde bookings y cash_flows hacia booking_settlements.
ALTER TABLE bookings
  ADD COLUMN settlement_id uuid REFERENCES booking_settlements(id) ON DELETE SET NULL;

CREATE INDEX idx_bookings_settlement
  ON bookings (settlement_id)
  WHERE settlement_id IS NOT NULL;

ALTER TABLE cash_flows
  ADD COLUMN settlement_id uuid REFERENCES booking_settlements(id);

CREATE INDEX idx_cash_flows_settlement
  ON cash_flows (settlement_id)
  WHERE settlement_id IS NOT NULL;

-- 4. Permitir adjuntar/desvincular settlement_id en turnos completed vía GUC dedicado,
--    conservando todas las invariantes de 089_booking_price_edit.sql
--    (ultima redefinicion vigente: 108/109 no la tocan).
CREATE OR REPLACE FUNCTION enforce_booking_invariants_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_old_stripped JSONB;
  v_new_stripped JSONB;
BEGIN
  IF NEW.price_snapshot IS DISTINCT FROM OLD.price_snapshot THEN
    IF NOT (
      (
        OLD.status IN ('confirmed', 'pending_payment')
        AND (
          NEW.starts_at IS DISTINCT FROM OLD.starts_at
          OR NEW.court_id IS DISTINCT FROM OLD.court_id
        )
      )
      OR (
        OLD.status = 'confirmed'
        AND COALESCE(current_setting('app.booking_edit', true), 'off') = 'on'
      )
    ) THEN
      RAISE EXCEPTION 'price_snapshot es inmutable (intento de modificar de % a %)',
        OLD.price_snapshot, NEW.price_snapshot
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF OLD.status IN (
       'completed',
       'no_show',
       'expired',
       'canceled_refunded',
       'canceled_no_refund'
     )
  THEN
    IF OLD.status = 'completed'
       AND NEW.status = 'no_show'
       AND NOW() - OLD.updated_at < INTERVAL '24 hours'
    THEN
      RETURN NEW;
    END IF;

    IF OLD.status = 'no_show'
       AND NEW.status = 'completed'
       AND NOW() - OLD.updated_at < INTERVAL '24 hours'
    THEN
      RETURN NEW;
    END IF;

    IF OLD.status = 'completed'
       AND COALESCE(current_setting('app.booking_settlement', true), 'off') = 'on'
       AND (to_jsonb(NEW) - 'settlement_id' - 'updated_at')
         = (to_jsonb(OLD) - 'settlement_id' - 'updated_at')
    THEN
      RETURN NEW;
    END IF;

    v_old_stripped := to_jsonb(OLD) - 'player_id' - 'updated_at';
    v_new_stripped := to_jsonb(NEW) - 'player_id' - 'updated_at';

    IF NEW.player_id IS NULL AND v_new_stripped = v_old_stripped THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Booking en estado terminal (%) no puede modificarse', OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION enforce_booking_invariants_fn() IS
  'Invariantes de bookings (089 + 121): terminal-state guard + price_snapshot inmutable, con excepciones P5/RI#1 (24h completed<->no_show), ARCO (player_id NULL), reschedule, booking_edit (confirmed) y booking_settlement (solo settlement_id en completed).';
