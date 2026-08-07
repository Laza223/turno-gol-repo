-- ============================================================
-- 071_align_plan_tiers_with_atc.sql
-- Alinea los CORTES de plan con los de ATC y ajusta precios
-- (decisión del dueño, 2026-08-07 — docs/planning/2026-08-07-analisis-rubro-y-decisiones.md §4):
--   predio   → hasta 3 canchas,  $63.000/mes  ($50.400/mes anual)
--   complejo → hasta 6 canchas,  $99.000/mes  ($79.200/mes anual)
--   estadio  → ilimitado,        $129.000/mes ($103.200/mes anual)
--
-- POR QUÉ los cortes y no solo los precios: ATC corta en 1-3/4-6/7+ y nosotros
-- cortábamos en 1-2/3-5/6+. Con los cortes cruzados la comparación de precio
-- daba distinta según la cantidad de canchas, y en DOS franjas (3 y 6) TurnoGol
-- salía más caro que ATC — franjas que caen dentro del ICP, con 3 canchas siendo
-- el PISO del segmento pagador (doc1 §1). Alineando los cortes, la comparación
-- pasa a ser franja contra franja y TurnoGol queda ~11% abajo en las tres.
--
-- Referencia de ATC al momento de decidir: $71.000 / $111.000 / $145.000
-- (navegado por el founder desde IP argentina, 2026-08-07). IVA: su sitio
-- sigue sin aclararlo — la comparación asume el mismo tratamiento en ambos.
--
-- Centavos ARS; anual = 20% off. features jsonb intacto.
-- price_versions es historial INSERT-only sobre los PRECIOS (inmutables);
-- setear valid_until en la versión anterior es el cierre de vigencia previsto
-- por doc13 §2.5 (valid_until NULL = la única vigente por plan).
-- Idempotente: UPDATEs absolutos + INSERT con guard NOT EXISTS.
--
-- SEGURIDAD DEL CAMBIO DE max_courts: los tres límites ENSANCHAN (2→3, 5→6,
-- ilimitado sigue ilimitado). Ningún tenant existente puede quedar por encima
-- del límite de su plan por efecto de esta migración; si algún día se achica un
-- rango, ese caso hay que resolverlo explícitamente antes del UPDATE.
--
-- SUSCRIPCIONES MP EXISTENTES: no cambian retroactivamente — el monto se fija
-- al crear el preapproval. Un tenant ya suscripto sigue pagando lo que firmó
-- hasta que cambie de plan. Es el comportamiento correcto y el mismo que
-- asumió la 043.
-- ============================================================

UPDATE plans SET max_courts = 3, price_monthly = 6300000,  price_annual = 5040000  WHERE slug = 'predio';
UPDATE plans SET max_courts = 6, price_monthly = 9900000,  price_annual = 7920000  WHERE slug = 'complejo';
-- estadio: max_courts sigue NULL (ilimitado)
UPDATE plans SET price_monthly = 12900000, price_annual = 10320000 WHERE slug = 'estadio';

-- Cerrar la vigencia de las versiones anteriores (no toca precios históricos).
UPDATE price_versions pv
SET valid_until = DATE '2026-08-06'
FROM plans p
WHERE pv.plan_id = p.id
  AND pv.valid_until IS NULL
  AND pv.valid_from < DATE '2026-08-07';

-- Nueva versión vigente (mismo patrón que 043/007: SELECT desde plans ya actualizado).
INSERT INTO price_versions (plan_id, price_monthly, price_annual, valid_from, reason)
SELECT p.id, p.price_monthly, p.price_annual, DATE '2026-08-07',
       'Alineación de cortes con ATC (1-3/4-6/7+) y ajuste de precios (ago 2026)'
FROM plans p
WHERE p.slug IN ('predio', 'complejo', 'estadio')
  AND NOT EXISTS (
    SELECT 1 FROM price_versions pv
    WHERE pv.plan_id = p.id AND pv.valid_from = DATE '2026-08-07'
  );
