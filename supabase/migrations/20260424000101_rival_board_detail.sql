-- ============================================================
-- 101_rival_board_detail.sql
-- RIVAL v1 (PR4, tablón). Spec: docs/superpowers/specs/2026-10-22-rival-v1-design.md
-- (§5.6 vista de una tarjeta, §5.7 filtro por complejo, §6 visibilidad).
--
-- Aditiva: dos funciones nuevas de lectura. No toca la 099 ni ninguna tabla.
--   * rival_board_match(p_id): UNA tarjeta del tablón por id (la vista pública
--     /rival/partido/<id>).
--   * rival_board_tenants(): los complejos que hoy tienen algún partido visible
--     (el filtro del tablón).
-- Las dos son SECURITY DEFINER con columnas explícitas, igual que rival_board:
-- nunca devuelven `invite_code` ni al organizador.
--
-- Rollback (a mano):
--   DROP FUNCTION IF EXISTS rival_board_tenants(), rival_board_match(uuid);
-- ============================================================

-- Una tarjeta del tablón. Los filtros de visibilidad tienen que moverse junto con
-- los de rival_board (099): quien abre la tarjeta por id ve exactamente lo que
-- vería en la lista, ni más ni menos.
CREATE OR REPLACE FUNCTION rival_board_match(p_id uuid)
RETURNS TABLE (
  id               uuid,
  tenant_id        uuid,
  tenant_name      text,
  tenant_slug      text,
  starts_at        timestamptz,
  format           integer,
  capacity         integer,
  level            text,
  seeking          text,
  seeking_position text,
  confirmed_count  integer,
  has_stamp        boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.id, m.tenant_id, t.name, t.slug, m.starts_at, m.format, m.capacity, m.level,
         m.seeking, m.seeking_position, m.confirmed_count,
         EXISTS (
           SELECT 1 FROM bookings b
           WHERE b.id = m.booking_id AND b.status = 'confirmed' AND b.starts_at = m.starts_at
         )
  FROM rival_matches m
  JOIN tenants t ON t.id = m.tenant_id
  WHERE m.id = p_id
    -- Estos filtros son los de rival_board: si cambian allá, cambian acá.
    AND m.on_board
    AND t.status::text IN ('active', 'trialing', 'canceled')
    AND t.marketplace_visible
    AND COALESCE((t.settings ->> 'onboarding_completed')::boolean, false)
    AND m.seeking IS NOT NULL
    AND m.status = 'open'
    AND m.hidden_at IS NULL
    AND m.starts_at > now()
    AND (m.seeking = 'rival' OR m.confirmed_count < m.capacity)
$$;

-- Complejos con al menos un partido visible en el tablón. Mismos filtros que
-- rival_board: si cambian allá, cambian acá.
CREATE OR REPLACE FUNCTION rival_board_tenants()
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT t.id, t.name
  FROM tenants t
  WHERE t.status::text IN ('active', 'trialing', 'canceled')
    AND t.marketplace_visible
    AND COALESCE((t.settings ->> 'onboarding_completed')::boolean, false)
    AND EXISTS (
      SELECT 1 FROM rival_matches m
      WHERE m.tenant_id = t.id
        AND m.on_board
        AND m.seeking IS NOT NULL
        AND m.status = 'open'
        AND m.hidden_at IS NULL
        AND m.starts_at > now()
        AND (m.seeking = 'rival' OR m.confirmed_count < m.capacity)
    )
  ORDER BY t.name, t.id
$$;

-- Patrón de la 099: nada para PUBLIC/anon/authenticated; solo los roles de la app.
DO $$
DECLARE
  f text;
  r text;
BEGIN
  FOREACH f IN ARRAY ARRAY['rival_board_match(uuid)', 'rival_board_tenants()'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f);
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM %I', f, r);
      END IF;
    END LOOP;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO turnogol_app', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'turnogol_worker') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO turnogol_worker', f);
    END IF;
  END LOOP;
END $$;
