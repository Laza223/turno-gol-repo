-- ============================================================
-- 042_simplify_abonados.sql
-- Revierte la 033 (Tarea #4 "Saldo a favor" de abonados) + quita monthly_price.
-- El modelo de crédito/saldo y el precio mensual venían de ATC (multi-deporte) y
-- no aplican a un complejo de fútbol. Pre-deploy: sin datos, el cast no falla.
-- ============================================================

-- 1. Recrear cashflow_category SIN 'abonado_payment'.
-- Postgres no permite DROP VALUE de un enum: renombrar viejo, crear nuevo,
-- castear la única columna que lo usa (cash_flows.category), dropear viejo.
-- El CHECK debe caer antes del swap de tipo y recrearse después.
ALTER TABLE cash_flows DROP CONSTRAINT chk_cashflow_type_category;

ALTER TYPE cashflow_category RENAME TO cashflow_category_old;
CREATE TYPE cashflow_category AS ENUM (
  'booking',
  'product_sale',
  'other',
  'no_show_correction',
  'operating_expense'
);
ALTER TABLE cash_flows
  ALTER COLUMN category TYPE cashflow_category
  USING category::text::cashflow_category;
DROP TYPE cashflow_category_old;

ALTER TABLE cash_flows ADD CONSTRAINT chk_cashflow_type_category CHECK (
  (type::text = 'income' AND category::text IN ('booking', 'product_sale', 'other'))
  OR (type::text = 'adjustment' AND category::text IN ('other', 'no_show_correction'))
  OR (type::text = 'expense' AND category::text = 'operating_expense')
);

-- 2. cash_flows.abonado_id: índice parcial + columna (dropea la FK inline).
DROP INDEX IF EXISTS idx_cash_flows_abonado;
ALTER TABLE cash_flows DROP COLUMN IF EXISTS abonado_id;

-- 3. bookings.credit_applied (+ su CHECK de no-negatividad).
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS chk_booking_credit_non_negative;
ALTER TABLE bookings DROP COLUMN IF EXISTS credit_applied;

-- 4. abonados: credit_balance (+ CHECK) y monthly_price.
ALTER TABLE abonados DROP CONSTRAINT IF EXISTS chk_abonado_credit_non_negative;
ALTER TABLE abonados DROP COLUMN IF EXISTS credit_balance;
ALTER TABLE abonados DROP COLUMN IF EXISTS monthly_price;
