-- ============================================================
-- 043_update_plan_pricing.sql
-- Nuevos precios y rangos de planes (decisión fundador jul-2026):
--   predio   → hasta 2 canchas,  $55.000/mes  ($44.000/mes anual)
--   complejo → hasta 5 canchas,  $85.000/mes  ($68.000/mes anual)
--   estadio  → ilimitado,        $115.000/mes ($92.000/mes anual)
-- Centavos ARS; anual = 20% off. features jsonb intacto.
-- price_versions es historial INSERT-only sobre los PRECIOS (inmutables);
-- setear valid_until en la versión anterior es el cierre de vigencia
-- previsto por doc13 §2.5 (valid_until NULL = la única vigente por plan).
-- Idempotente: UPDATEs absolutos + INSERT con guard NOT EXISTS.
-- Pre-deploy: sin tenants reales; preapprovals MP existentes no cambian
-- retroactivamente (el monto se fija al crear la suscripción).
-- ============================================================

UPDATE plans SET max_courts = 2, price_monthly = 5500000,  price_annual = 4400000 WHERE slug = 'predio';
UPDATE plans SET max_courts = 5, price_monthly = 8500000,  price_annual = 6800000 WHERE slug = 'complejo';
-- estadio: max_courts sigue NULL (ilimitado)
UPDATE plans SET price_monthly = 11500000, price_annual = 9200000 WHERE slug = 'estadio';

-- Cerrar la vigencia de las versiones anteriores (no toca precios históricos).
UPDATE price_versions pv
SET valid_until = DATE '2026-07-10'
FROM plans p
WHERE pv.plan_id = p.id
  AND pv.valid_until IS NULL
  AND pv.valid_from < DATE '2026-07-11';

-- Nueva versión vigente (mismo patrón que 007: SELECT desde plans ya actualizado).
INSERT INTO price_versions (plan_id, price_monthly, price_annual, valid_from, reason)
SELECT p.id, p.price_monthly, p.price_annual, DATE '2026-07-11',
       'Ajuste de precios y rangos pre-lanzamiento (jul 2026)'
FROM plans p
WHERE p.slug IN ('predio', 'complejo', 'estadio')
  AND NOT EXISTS (
    SELECT 1 FROM price_versions pv
    WHERE pv.plan_id = p.id AND pv.valid_from = DATE '2026-07-11'
  );
