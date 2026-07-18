-- ============================================================
-- 046_drop_products_table.sql
-- Deprecación de la tabla `products` (#6). Ver decisión completa en
-- docs/decisions/2026-07-17-deprecate-products-table.md
--
-- La tabla `products` (migr. 004 + RLS FORCE migr. 021) está 100% muerta: cero
-- INSERT/SELECT/UPDATE en toda la app. La cantina real vive en el JSONB
-- tenants.settings.canteen_products (name/price/stock), suficiente para v1.
-- La columna cash_flows.product_id (FK -> products.id) nunca se pobló (la venta
-- de cantina llama createCashFlow sin productId) => siempre NULL, FK decorativa
-- y trampa latente. Se eliminan ambas.
--
-- Pre-launch: sin datos de producción. La tabla está vacía y la columna es
-- siempre NULL, así que el drop no pierde información real. El DROP TABLE arrastra
-- sus policies RLS, índices y checks. Las migraciones históricas 004/021 no se
-- tocan (se aplican y luego 046 dropea, consistente en un reset limpio).
-- ============================================================

-- 1. Columna vestigial cash_flows.product_id (FK a products, siempre NULL).
--    Drop explícito primero para no depender de CASCADE sobre products.
ALTER TABLE cash_flows
  DROP COLUMN IF EXISTS product_id;

-- 2. Tabla products (+ policies RLS, índices, checks). Sin dependientes tras (1).
DROP TABLE IF EXISTS products;
