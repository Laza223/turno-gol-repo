-- ============================================================
-- 093_canteen_products_category.sql
-- Categoría opcional de cantina (decisión del dueño 2026-09-25,
-- docs/gtm/ejecucion/10-aprendizajes.md): el modal de Vender agrupa por
-- rubro (Bebidas, Cervezas, Comida…) en vez de mostrar el catálogo entero
-- en una sola grilla. Texto corto sobre un PRODUCTO, no sobre una persona —
-- la restricción de texto libre de Ley 25.326 (ver abonados.notes, migr. 048)
-- no aplica acá.
--
-- Nullable, sin backfill: aditiva, sin expand/contract
-- (docs/operations/MIGRATIONS.md), mismo patrón que 092. El código viejo que
-- no la conoce sigue funcionando igual, sencillamente sin poblarla.
--
-- Grants y RLS son de TABLA/FILA (canteen_products_select/insert/update de
-- la 048, filtran por tenant_id) — una columna nueva no necesita política
-- propia ni REVOKE adicional.
-- ============================================================

ALTER TABLE canteen_products ADD COLUMN IF NOT EXISTS category text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_canteen_category_length'
  ) THEN
    ALTER TABLE canteen_products ADD CONSTRAINT chk_canteen_category_length CHECK (
      category IS NULL OR length(trim(category)) BETWEEN 1 AND 40
    );
  END IF;
END $$;

COMMENT ON COLUMN canteen_products.category IS
  'Rubro opcional del producto (Bebidas, Cervezas, Comida…) para agrupar el modal de Vender. NULL = sin categorizar, se muestra aparte. Decisión del dueño 2026-09-25, docs/gtm/ejecucion/10-aprendizajes.md.';
