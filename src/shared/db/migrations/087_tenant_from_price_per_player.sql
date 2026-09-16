-- ============================================================
-- 087_tenant_from_price_per_player.sql
-- Las cards públicas pasan a mostrar el precio POR JUGADOR como número
-- principal ("$4.300 por jugador", con el total del turno como línea
-- secundaria): el jugador piensa en lo que pone cada uno, no en el alquiler de
-- la cancha entera.
--
-- Hasta ahora ese número se calculaba en el cliente dividiendo
-- `tenants.from_price_cents` por el formato MÁS CHICO del complejo
-- (`court_formats`), y los dos mínimos pueden venir de canchas DISTINTAS:
-- un complejo con F5 a $45.000 ($4.500/jugador) y F7 a $60.000 ($4.286/jugador)
-- informaba $4.500 cuando el mínimo real es $4.300. Tolerable como dato
-- secundario; no como el número principal.
--
-- Se denormaliza el mínimo REAL de precio-por-jugador junto a los otros facets:
-- `courts` está bajo RLS y la búsqueda pública solo lee `tenants` (por eso
-- existe esta función), y aparear precio y formato exige la MISMA fila de
-- `courts`, cosa que los dos arrays ya denormalizados perdieron.
--
-- Sin división por cero: `courts_format_check` (migr. 032) acota format a 4..11.
-- La columna guarda el mínimo crudo; el redondeo a $100 es presentación y vive
-- en `src/lib/format.ts` (`min(ceil(x)) = ceil(min(x))`, así que da igual el
-- orden).
--
-- `CREATE OR REPLACE` (NO `DROP FUNCTION`) a propósito: conserva el ACL del
-- hardening de la migr. 056 (REVOKE a anon/authenticated).
--
-- Proyecto forward-only (sin runner de DOWN); ver bloque DOWN comentado al final.
-- ============================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS from_price_per_player_cents integer;

COMMENT ON COLUMN tenants.from_price_per_player_cents IS
  'Denormalizado por recalc_tenant_from_price(): MIN(precio de regla / (format*2)) de las canchas online. NULL exactamente cuando from_price_cents es NULL.';

CREATE OR REPLACE FUNCTION recalc_tenant_from_price(p_tenant_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE tenants t
  SET from_price_cents            = sub.min_price,
      from_price_per_player_cents = sub.min_per_player,
      court_surfaces              = COALESCE(sub.surfaces, '{}'),
      court_formats               = COALESCE(sub.formats, '{}')
  FROM (
    SELECT
      MIN((rule ->> 'price')::int)                                 AS min_price,
      CEIL(MIN((rule ->> 'price')::numeric / (c.format * 2)))::int AS min_per_player,
      array_agg(DISTINCT c.surface_type::text)                     AS surfaces,
      array_agg(DISTINCT c.format)                                 AS formats
    FROM courts c
    LEFT JOIN LATERAL jsonb_array_elements(c.pricing -> 'rules') AS rule ON true
    WHERE c.tenant_id = p_tenant_id
      AND c.status = 'online'
  ) sub
  WHERE t.id = p_tenant_id;
$$;

COMMENT ON FUNCTION recalc_tenant_from_price(uuid) IS
  'Recalcula tenants.from_price_cents = MIN(price escalar), from_price_per_player_cents = MIN(price / (format*2)), court_surfaces y court_formats (= format, Fútbol N) de las canchas online del complejo.';

-- El trigger no escuchaba `format`, la columna que desde la migr. 032 alimenta
-- court_formats y ahora también el precio por jugador. Hoy no falla solo porque
-- updateCourt() escribe capacity = format*2 en el mismo UPDATE: una dependencia
-- implícita que se cierra acá.
DROP TRIGGER IF EXISTS courts_recalc_from_price ON courts;
CREATE TRIGGER courts_recalc_from_price
  AFTER INSERT OR DELETE OR UPDATE OF pricing, status, tenant_id, surface_type, capacity, format ON courts
  FOR EACH ROW EXECUTE FUNCTION trg_courts_recalc_from_price();

-- Backfill del complejo entero (mismo shape que el de la migr. 031).
UPDATE tenants t
SET from_price_per_player_cents = sub.min_per_player
FROM (
  SELECT
    c.tenant_id,
    CEIL(MIN((rule ->> 'price')::numeric / (c.format * 2)))::int AS min_per_player
  FROM courts c
  LEFT JOIN LATERAL jsonb_array_elements(c.pricing -> 'rules') AS rule ON true
  WHERE c.status = 'online'
  GROUP BY c.tenant_id
) sub
WHERE t.id = sub.tenant_id;

-- ── DOWN (referencia — el proyecto aplica migraciones forward-only) ─────────
-- DROP TRIGGER IF EXISTS courts_recalc_from_price ON courts;
-- CREATE TRIGGER courts_recalc_from_price
--   AFTER INSERT OR DELETE OR UPDATE OF pricing, status, tenant_id, surface_type, capacity ON courts
--   FOR EACH ROW EXECUTE FUNCTION trg_courts_recalc_from_price();
-- (recalc_tenant_from_price volvería a la definición de la migr. 032)
-- ALTER TABLE tenants DROP COLUMN from_price_per_player_cents;
