-- ============================================================
-- 033_abonado_credit_balance.sql
-- Tarea #4 — "Saldo a favor" de abonados (modelo ATC).
--
-- 1. abonados.credit_balance: saldo a favor del abonado (centavos ARS). Se
--    acredita cuando el complejo recibe plata por adelantado y se consume,
--    semana a semana, al descontar manualmente una sesión ("Mantener saldo").
--    El saldo vive en el ABONADO, no en el jugador (un jugador con 2 abonados
--    tiene 2 saldos independientes que no se transfieren).
--
-- 2. cash_flows.abonado_id + categoría 'abonado_payment': la carga de saldo
--    genera un CashFlow income vinculado al abonado → entra a la caja del día.
--    El DESCUENTO semanal NO genera CashFlow (la plata ya entró al cargar el
--    saldo); evita doble contabilización.
--
-- 3. bookings.credit_applied: centavos descontados del saldo del abonado para
--    ESTA instancia del turno fijo. Idempotente por instancia (si > 0 ya se
--    descontó). Mantiene el invariante:
--      abonados.credit_balance =
--        SUM(cash_flows.amount WHERE abonado_id, category='abonado_payment')
--        - SUM(bookings.credit_applied WHERE abonado_id)
--
-- Idempotente: ADD COLUMN/CONSTRAINT IF NOT EXISTS donde aplica.
-- ============================================================

-- 1. Saldo a favor del abonado (no negativo).
ALTER TABLE abonados
  ADD COLUMN IF NOT EXISTS credit_balance integer NOT NULL DEFAULT 0;

ALTER TABLE abonados
  DROP CONSTRAINT IF EXISTS chk_abonado_credit_non_negative;
ALTER TABLE abonados
  ADD CONSTRAINT chk_abonado_credit_non_negative CHECK (credit_balance >= 0);

COMMENT ON COLUMN abonados.credit_balance IS
  'Saldo a favor del abonado en centavos de ARS (modelo ATC). Se carga vía CashFlow abonado_payment y se consume al descontar sesiones (bookings.credit_applied). No se transfiere entre abonados.';

-- 2. Vínculo del CashFlow al abonado + nueva categoría.
ALTER TABLE cash_flows
  ADD COLUMN IF NOT EXISTS abonado_id uuid REFERENCES abonados(id);

CREATE INDEX IF NOT EXISTS idx_cash_flows_abonado
  ON cash_flows (tenant_id, abonado_id)
  WHERE abonado_id IS NOT NULL;

ALTER TYPE cashflow_category ADD VALUE IF NOT EXISTS 'abonado_payment';

-- El CHECK compara via ::text: un valor de enum recién agregado no puede usarse
-- como literal del enum en la misma transacción (55P04). Mismo patrón que 025.
ALTER TABLE cash_flows DROP CONSTRAINT chk_cashflow_type_category;
ALTER TABLE cash_flows ADD CONSTRAINT chk_cashflow_type_category CHECK (
  (type::text = 'income' AND category::text IN ('booking', 'product_sale', 'other', 'abonado_payment'))
  OR (type::text = 'adjustment' AND category::text IN ('other', 'no_show_correction'))
  OR (type::text = 'expense' AND category::text = 'operating_expense')
);

-- 3. Descuento de saldo por instancia de turno fijo (no negativo).
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS credit_applied integer NOT NULL DEFAULT 0;

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS chk_booking_credit_non_negative;
ALTER TABLE bookings
  ADD CONSTRAINT chk_booking_credit_non_negative CHECK (credit_applied >= 0);

COMMENT ON COLUMN bookings.credit_applied IS
  'Centavos descontados del saldo a favor del abonado para esta instancia del turno fijo (Tarea #4 "Mantener saldo"). NO genera CashFlow. > 0 = ya descontado.';
