-- ============================================================
-- 020_public_backend_review_fixes.sql
-- Correcciones de la revisión adversarial del backend público (016-019).
--
-- #1 CRÍTICO: el search público filtraba superficie/formato con
--    EXISTS(SELECT ... FROM courts ...). courts es tenant-isolated por RLS y NO
--    tiene policy pública: bajo el rol no-superusuario de producción (sin
--    app.current_tenant_id) el EXISTS siempre da FALSE → 0 resultados. Solución:
--    denormalizar surfaces/formats de las canchas 'online' en columnas del tenant
--    (tabla global sin RLS), igual que from_price_cents, y filtrar con overlap (&&).
--
-- #2 ALTO: open_matches_creator_update solo chequeaba creator_player_id; el creador
--    podía repuntar booking_id/tenant_id a otra reserva/tenant. Se agrega trigger
--    BEFORE UPDATE que hace inmutables booking_id, tenant_id y creator_player_id.
--
-- #6 BAJO: "el creador no puede sumarse" estaba solo en la app. Se mueve el invariante
--    al trigger enforce_open_match_join (backstop a nivel DB).
--
-- #7 BAJO: el trigger DELETE reabría un partido 'full' ya expirado. Se guarda con expiry.
-- ============================================================

-- ─── #1: facets denormalizados en tenants ───────────────────────
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS court_surfaces text[]    NOT NULL DEFAULT '{}';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS court_formats  integer[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN tenants.court_surfaces IS
  'Superficies distintas de las canchas online (denormalizado para filtros públicos). Mantenido por trigger courts_recalc_from_price.';
COMMENT ON COLUMN tenants.court_formats IS
  'Capacidades (formato) distintas de las canchas online (denormalizado). Mantenido por trigger courts_recalc_from_price.';

-- recalc ahora computa precio mínimo + superficies + formatos de canchas online.
-- LEFT JOIN LATERAL preserva la cancha aunque su pricing esté vacío (facets cuentan
-- igual; el precio simplemente queda NULL para esa cancha).
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
      MIN(price_kv.v::int)                    AS min_price,
      array_agg(DISTINCT c.surface_type::text) AS surfaces,
      array_agg(DISTINCT c.capacity)           AS formats
    FROM courts c
    LEFT JOIN LATERAL jsonb_array_elements(c.pricing -> 'rules') AS rule ON true
    LEFT JOIN LATERAL jsonb_each_text(rule -> 'prices') AS price_kv(k, v) ON true
    WHERE c.tenant_id = p_tenant_id
      AND c.status = 'online'
  ) sub
  WHERE t.id = p_tenant_id;
$$;

COMMENT ON FUNCTION recalc_tenant_from_price(uuid) IS
  'Recalcula tenants.from_price_cents + court_surfaces + court_formats desde las canchas online del complejo.';

-- El trigger ahora también dispara ante cambios de surface_type / capacity.
DROP TRIGGER IF EXISTS courts_recalc_from_price ON courts;
CREATE TRIGGER courts_recalc_from_price
  AFTER INSERT OR DELETE OR UPDATE OF pricing, status, tenant_id, surface_type, capacity ON courts
  FOR EACH ROW EXECUTE FUNCTION trg_courts_recalc_from_price();

-- Backfill de facets para complejos existentes.
UPDATE tenants t
SET from_price_cents = sub.min_price,
    court_surfaces   = COALESCE(sub.surfaces, '{}'),
    court_formats    = COALESCE(sub.formats, '{}')
FROM (
  SELECT
    c.tenant_id,
    MIN(price_kv.v::int)                     AS min_price,
    array_agg(DISTINCT c.surface_type::text) AS surfaces,
    array_agg(DISTINCT c.capacity)           AS formats
  FROM courts c
  LEFT JOIN LATERAL jsonb_array_elements(c.pricing -> 'rules') AS rule ON true
  LEFT JOIN LATERAL jsonb_each_text(rule -> 'prices') AS price_kv(k, v) ON true
  WHERE c.status = 'online'
  GROUP BY c.tenant_id
) sub
WHERE t.id = sub.tenant_id;

-- ─── #2: inmutabilidad de open_matches (booking_id/tenant_id/creator) ──
-- La policy creator_update solo valida creator_player_id; este trigger impide
-- repuntar la reserva/tenant de un partido ya creado (spoofing en la vitrina pública).
CREATE OR REPLACE FUNCTION enforce_open_match_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.booking_id        IS DISTINCT FROM OLD.booking_id
     OR NEW.tenant_id         IS DISTINCT FROM OLD.tenant_id
     OR NEW.creator_player_id IS DISTINCT FROM OLD.creator_player_id THEN
    RAISE EXCEPTION 'booking_id, tenant_id y creator_player_id de un partido abierto son inmutables'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION enforce_open_match_immutable() IS
  'Hace inmutables booking_id/tenant_id/creator_player_id de open_matches (la policy de UPDATE solo valida creator).';

DROP TRIGGER IF EXISTS open_match_immutable ON open_matches;
CREATE TRIGGER open_match_immutable
  BEFORE UPDATE ON open_matches
  FOR EACH ROW EXECUTE FUNCTION enforce_open_match_immutable();

-- ─── #6 + #7: reescritura de los triggers de open_match_players ──
-- #6: enforce_open_match_join ahora también rechaza que el creador se sume.
CREATE OR REPLACE FUNCTION enforce_open_match_join()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  m RECORD;
BEGIN
  SELECT status, slots_filled, slots_total, expires_at, creator_player_id
    INTO m
    FROM open_matches
    WHERE id = NEW.open_match_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El partido abierto % no existe', NEW.open_match_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.player_id = m.creator_player_id THEN
    RAISE EXCEPTION 'El creador no puede sumarse a su propio partido'
      USING ERRCODE = 'check_violation';
  END IF;

  IF m.status <> 'open' THEN
    RAISE EXCEPTION 'El partido no está abierto (estado %)', m.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF m.expires_at IS NOT NULL AND m.expires_at <= now() THEN
    RAISE EXCEPTION 'El partido ya expiró'
      USING ERRCODE = 'check_violation';
  END IF;

  IF m.slots_filled >= m.slots_total THEN
    RAISE EXCEPTION 'El partido ya está completo'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- #7: al bajarse un jugador, solo reabrir si el partido NO expiró.
CREATE OR REPLACE FUNCTION sync_open_match_slots()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE open_matches
      SET slots_filled = slots_filled + 1,
          status = CASE WHEN slots_filled + 1 >= slots_total THEN 'full'::open_match_status ELSE status END
      WHERE id = NEW.open_match_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE open_matches
      SET slots_filled = GREATEST(slots_filled - 1, 0),
          status = CASE
            WHEN status = 'full'
                 AND slots_filled - 1 < slots_total
                 AND (expires_at IS NULL OR expires_at > now())
            THEN 'open'::open_match_status
            ELSE status
          END
      WHERE id = OLD.open_match_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
