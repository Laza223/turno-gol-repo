-- ============================================================
-- 032_court_surface_format.sql
-- Cambio #16: separar la cobertura del enum surface_type. El enum pasa a describir
--   SOLO el piso (se reemplaza 'indoor' por 'tile' = baldosa) y la cobertura +
--   iluminación se modelan como atributos booleanos por cancha.
--   Enum resultante: synthetic_grass | natural_grass | cement | tile
--
-- Cambio #17: campo explícito `format` (Fútbol N, 4..11). Hasta ahora `capacity`
--   guardaba el N del formato (court.schema validaba 5,7,8,9,11). Ahora `format`
--   guarda el N y `capacity` pasa a ser jugadores totales = format × 2. El trigger
--   de denormalización (recalc_tenant_from_price, def. en 019/020/031) pasa a
--   denormalizar `format` en tenants.court_formats (antes capacity — mismo valor
--   numérico para la data app, pero ahora capacity está duplicado).
--
-- Proyecto forward-only (sin runner de DOWN); ver bloque DOWN comentado al final.
-- ============================================================

-- ── #16: atributos de cancha (cobertura + iluminación) ──────────────────────
ALTER TABLE courts ADD COLUMN is_covered   boolean NOT NULL DEFAULT false;
ALTER TABLE courts ADD COLUMN has_lighting boolean NOT NULL DEFAULT true;

-- Las canchas 'indoor' eran techadas de césped sintético: reasignar la superficie
-- y marcar is_covered ANTES de repurpose del valor del enum.
UPDATE courts SET is_covered = true            WHERE surface_type = 'indoor';
UPDATE courts SET surface_type = 'synthetic_grass' WHERE surface_type = 'indoor';

-- Reutilizar el valor 'indoor' (ya sin filas) como 'tile'. RENAME VALUE evita
-- recrear el tipo (PostgreSQL no permite DROP VALUE de un enum).
ALTER TYPE surface_type RENAME VALUE 'indoor' TO 'tile';

-- ── #17: format explícito + capacity = format × 2 ───────────────────────────
-- DEFAULT 5 (Fútbol 5) para inserts que no especifican format (paridad con el
-- DEFAULT de status). createCourt() siempre lo setea explícito.
ALTER TABLE courts ADD COLUMN format integer NOT NULL DEFAULT 5;

-- Backfill: capacity guardaba el N del formato → copiar a format y recomputar
-- capacity como jugadores totales (format × 2).
UPDATE courts SET format = capacity WHERE capacity BETWEEN 4 AND 11;
UPDATE courts SET capacity = format * 2;

ALTER TABLE courts
  ADD CONSTRAINT courts_format_check CHECK (format IN (4, 5, 6, 7, 8, 9, 10, 11));

-- ── #17: la denormalización de facets usa format (no capacity) ──────────────
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
      array_agg(DISTINCT c.format)             AS formats
    FROM courts c
    LEFT JOIN LATERAL jsonb_array_elements(c.pricing -> 'rules') AS rule ON true
    WHERE c.tenant_id = p_tenant_id
      AND c.status = 'online'
  ) sub
  WHERE t.id = p_tenant_id;
$$;

COMMENT ON FUNCTION recalc_tenant_from_price(uuid) IS
  'Recalcula tenants.from_price_cents = MIN(price escalar) + court_surfaces + court_formats (= format, Fútbol N) de las canchas online del complejo.';

-- Backfill de court_formats con format (numéricamente igual a la data previa,
-- pero deja el facet alineado al nuevo origen).
UPDATE tenants t
SET court_formats = COALESCE(sub.formats, '{}')
FROM (
  SELECT c.tenant_id, array_agg(DISTINCT c.format) AS formats
  FROM courts c
  WHERE c.status = 'online'
  GROUP BY c.tenant_id
) sub
WHERE t.id = sub.tenant_id;

-- ── DOWN (referencia — el proyecto aplica migraciones forward-only) ─────────
-- ALTER TABLE courts DROP CONSTRAINT courts_format_check;
-- ALTER TABLE courts DROP COLUMN format;
-- ALTER TABLE courts DROP COLUMN has_lighting;
-- ALTER TABLE courts DROP COLUMN is_covered;
-- ALTER TYPE surface_type RENAME VALUE 'tile' TO 'indoor';
-- (recalc_tenant_from_price volvería a array_agg(DISTINCT c.capacity))
