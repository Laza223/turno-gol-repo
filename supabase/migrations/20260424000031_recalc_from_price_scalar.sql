-- ============================================================
-- 031_recalc_from_price_scalar.sql
-- Cambio #13: el pricing JSONB pasó de `prices: {"60":x,"120":y}` (objeto por
-- duración) a `price: <centavos>` (escalar, turno único de 60 min). La función de
-- denormalización recalc_tenant_from_price() (def. en 019, ampliada en 020) extraía
-- el precio con `jsonb_each_text(rule -> 'prices')`, que con el formato nuevo no
-- devuelve filas → tenants.from_price_cents quedaba NULL (rompe orden/filtro por
-- precio y el "Desde $X" de las cards).
--
-- Cambia (a) la EXTRACCIÓN del precio en la función de denormalización (escalar
-- `rule ->> 'price'`) y (b) el DEFAULT de la columna courts.pricing, que seguía con
-- el formato viejo `prices:{...}` (migración 004). No se altera data existente de la
-- columna (el JSONB es flexible). Surfaces/formats sin cambios.
-- ============================================================

-- (b) DEFAULT de courts.pricing al formato escalar nuevo (antes: prices:{60,120}).
ALTER TABLE courts ALTER COLUMN pricing SET DEFAULT '{
  "rules": [
    {"days": ["mon","tue","wed","thu"], "from": "08:00", "to": "18:00", "price": 800000},
    {"days": ["mon","tue","wed","thu"], "from": "18:00", "to": "23:00", "price": 1200000},
    {"days": ["fri","sat","sun"],       "from": "08:00", "to": "23:00", "price": 1500000}
  ]
}'::jsonb;

CREATE OR REPLACE FUNCTION recalc_tenant_from_price(p_tenant_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE tenants t
  SET from_price_cents = sub.min_price,
      court_surfaces   = COALESCE(sub.surfaces, '{}'),
      court_formats    = COALESCE(sub.formats, '{}')
  FROM (
    SELECT
      MIN((rule ->> 'price')::int)             AS min_price,
      array_agg(DISTINCT c.surface_type::text) AS surfaces,
      array_agg(DISTINCT c.capacity)           AS formats
    FROM courts c
    LEFT JOIN LATERAL jsonb_array_elements(c.pricing -> 'rules') AS rule ON true
    WHERE c.tenant_id = p_tenant_id
      AND c.status = 'online'
  ) sub
  WHERE t.id = p_tenant_id;
$$;

COMMENT ON FUNCTION recalc_tenant_from_price(uuid) IS
  'Recalcula tenants.from_price_cents = MIN(price escalar) + court_surfaces + court_formats de las canchas online del complejo.';

-- Backfill: recomputar facets de complejos existentes con el formato escalar.
UPDATE tenants t
SET from_price_cents = sub.min_price,
    court_surfaces   = COALESCE(sub.surfaces, '{}'),
    court_formats    = COALESCE(sub.formats, '{}')
FROM (
  SELECT
    c.tenant_id,
    MIN((rule ->> 'price')::int)             AS min_price,
    array_agg(DISTINCT c.surface_type::text) AS surfaces,
    array_agg(DISTINCT c.capacity)           AS formats
  FROM courts c
  LEFT JOIN LATERAL jsonb_array_elements(c.pricing -> 'rules') AS rule ON true
  WHERE c.status = 'online'
  GROUP BY c.tenant_id
) sub
WHERE t.id = sub.tenant_id;
