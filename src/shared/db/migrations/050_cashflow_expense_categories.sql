-- ============================================================
-- 050_cashflow_expense_categories.sql
-- Gastos categorizados (rediseño Caja y Cantina): un complejo maneja más
-- que "Gasto operativo" — mercadería, sueldos, servicios, mantenimiento.
-- Spec: docs/superpowers/specs/2026-07-22-caja-cantina-redesign-design.md
--
-- 'operating_expense' QUEDA en el CHECK: valida las filas históricas (el
-- constraint se evalúa contra los datos existentes al crearse) y sigue
-- mostrándose "Gasto operativo". La UI nueva solo ofrece las 5 categorías
-- nuevas. Sin migración de datos.
-- ============================================================

ALTER TYPE cashflow_category ADD VALUE IF NOT EXISTS 'merchandise';
ALTER TYPE cashflow_category ADD VALUE IF NOT EXISTS 'salaries';
ALTER TYPE cashflow_category ADD VALUE IF NOT EXISTS 'utilities';
ALTER TYPE cashflow_category ADD VALUE IF NOT EXISTS 'maintenance';
ALTER TYPE cashflow_category ADD VALUE IF NOT EXISTS 'other_expense';

-- El CHECK compara via ::text: un valor de enum recién agregado no puede
-- usarse como literal del enum en la misma transacción (55P04) — mismo
-- workaround que la migración 025.
ALTER TABLE cash_flows DROP CONSTRAINT chk_cashflow_type_category;
ALTER TABLE cash_flows ADD CONSTRAINT chk_cashflow_type_category CHECK (
  (type::text = 'income' AND category::text IN ('booking', 'product_sale', 'other'))
  OR (type::text = 'adjustment' AND category::text IN ('other', 'no_show_correction'))
  OR (type::text = 'expense' AND category::text IN
      ('operating_expense', 'merchandise', 'salaries', 'utilities', 'maintenance', 'other_expense'))
);
