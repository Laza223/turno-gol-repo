-- ============================================================
-- 051_drop_canteen_jsonb.sql
-- Cleanup final del rediseño "Caja y Cantina": borra la key JSONB
-- tenants.settings->'canteen_products', muerta desde la migración 048
-- (el backfill de 048 copió el catálogo a la tabla canteen_products y
-- ningún código la lee/escribe desde entonces — una release de margen).
-- Spec: docs/superpowers/specs/2026-07-22-caja-cantina-redesign-design.md
-- Decisión: docs/decisions/2026-07-22-caja-cantina-redesign.md
--
-- Idempotente: `settings - 'canteen_products'` sobre una key ausente es no-op.
-- ============================================================

UPDATE tenants
SET settings = settings - 'canteen_products'
WHERE settings ? 'canteen_products';
