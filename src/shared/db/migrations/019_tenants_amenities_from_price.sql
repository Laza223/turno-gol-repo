-- ============================================================
-- 019_tenants_amenities_from_price.sql
-- Campos nuevos en tenants para la interfaz pública estilo ATC + trigger de
-- denormalización del precio mínimo.
--
--   amenities       JSONB  — servicios del complejo (duchas, estacionamiento, bar,
--                            parrilla, vestuario, wifi, techado, iluminacion).
--   from_price_cents INT   — precio mínimo (centavos ARS) para "Desde $X" en cards.
--                            Denormalizado desde courts.pricing (opción A del
--                            VALIDATION_REPORT). NULL = sin canchas online.
--
-- El precio mínimo se recalcula con un trigger sobre courts (INSERT/DELETE y
-- UPDATE de pricing/status/tenant_id): toma el MIN de TODOS los valores de
-- prices (60 y 120) de las canchas 'online' del complejo. tenants es tabla global
-- sin RLS; las funciones son SECURITY DEFINER para no depender del GRANT del invoker.
-- ============================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS amenities        jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS from_price_cents integer;

COMMENT ON COLUMN tenants.amenities IS
  'Servicios del complejo: {duchas, estacionamiento, bar, parrilla, vestuario, wifi, techado, iluminacion} (bool).';
COMMENT ON COLUMN tenants.from_price_cents IS
  'Precio mínimo denormalizado (centavos ARS) para "Desde $X". Mantenido por trigger courts_recalc_from_price. NULL = sin canchas online.';

-- ─── recalc_tenant_from_price(tenant) ───────────────────────────
-- MIN de todos los precios (60/120) de las canchas 'online' del complejo.
-- Si no hay canchas online, el agregado da NULL → from_price_cents = NULL.
CREATE OR REPLACE FUNCTION recalc_tenant_from_price(p_tenant_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE tenants t
  SET from_price_cents = sub.min_price
  FROM (
    SELECT MIN(price_kv.v::int) AS min_price
    FROM courts c
    CROSS JOIN LATERAL jsonb_array_elements(c.pricing -> 'rules') AS rule
    CROSS JOIN LATERAL jsonb_each_text(rule -> 'prices') AS price_kv(k, v)
    WHERE c.tenant_id = p_tenant_id
      AND c.status = 'online'
  ) sub
  WHERE t.id = p_tenant_id;
$$;

COMMENT ON FUNCTION recalc_tenant_from_price(uuid) IS
  'Recalcula tenants.from_price_cents = MIN(prices) de las canchas online del complejo.';

-- ─── trigger sobre courts ───────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_courts_recalc_from_price()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalc_tenant_from_price(OLD.tenant_id);
    RETURN OLD;
  END IF;
  PERFORM recalc_tenant_from_price(NEW.tenant_id);
  -- Cambio de tenant (raro): recalcular ambos.
  IF TG_OP = 'UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    PERFORM recalc_tenant_from_price(OLD.tenant_id);
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trg_courts_recalc_from_price() IS
  'Recalcula tenants.from_price_cents cuando cambia pricing/status/tenant_id de una cancha (o INSERT/DELETE).';

DROP TRIGGER IF EXISTS courts_recalc_from_price ON courts;
CREATE TRIGGER courts_recalc_from_price
  AFTER INSERT OR DELETE OR UPDATE OF pricing, status, tenant_id ON courts
  FOR EACH ROW EXECUTE FUNCTION trg_courts_recalc_from_price();

-- ─── Backfill de complejos existentes ───────────────────────────
UPDATE tenants t
SET from_price_cents = sub.min_price
FROM (
  SELECT c.tenant_id, MIN(price_kv.v::int) AS min_price
  FROM courts c
  CROSS JOIN LATERAL jsonb_array_elements(c.pricing -> 'rules') AS rule
  CROSS JOIN LATERAL jsonb_each_text(rule -> 'prices') AS price_kv(k, v)
  WHERE c.status = 'online'
  GROUP BY c.tenant_id
) sub
WHERE t.id = sub.tenant_id;
