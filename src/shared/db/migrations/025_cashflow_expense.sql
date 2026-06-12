-- Rediseño de Caja: la caja registra egresos ("Gasto operativo").
-- Supersede el Fix #7 ("TurnoGol no registra gastos"): el admin necesita
-- ver ingresos - egresos = saldo neto del día parado en la barra del club.
--
-- Los productos rápidos de cantina NO llevan tabla: viven en
-- tenants.settings->'canteen_products' (JSONB, sin migración).

ALTER TYPE cashflow_type ADD VALUE IF NOT EXISTS 'expense';
ALTER TYPE cashflow_category ADD VALUE IF NOT EXISTS 'operating_expense';

-- El CHECK compara via ::text: un valor de enum recién agregado no puede
-- usarse como literal del enum en la misma transacción (55P04).
ALTER TABLE cash_flows DROP CONSTRAINT chk_cashflow_type_category;
ALTER TABLE cash_flows ADD CONSTRAINT chk_cashflow_type_category CHECK (
  (type::text = 'income' AND category::text IN ('booking', 'product_sale', 'other'))
  OR (type::text = 'adjustment' AND category::text IN ('other', 'no_show_correction'))
  OR (type::text = 'expense' AND category::text = 'operating_expense')
);

ALTER TABLE daily_cash_closes
  ADD COLUMN IF NOT EXISTS total_expense integer NOT NULL DEFAULT 0;

ALTER TABLE daily_cash_closes
  ADD CONSTRAINT chk_expense_non_negative CHECK (total_expense >= 0);
