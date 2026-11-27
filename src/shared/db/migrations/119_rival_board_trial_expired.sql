-- ============================================================
-- 119_rival_board_trial_expired.sql
-- Fin del freemium (docs/decisions/2026-11-27-prueba-30-dias-y-precios.md):
-- el complejo en `trial_expired` sigue visible en el buscador, así que el tablón
-- de RIVAL también lo lista (mismo criterio que `publicTenantVisibilityConds`
-- y `VISIBLE_TENANT_STATUSES` de search.service.ts; las listas se mueven juntas).
-- Despublicar es `tenants.marketplace_visible = false`, que estas funciones ya
-- respetan.
--
-- Se redefinen las tres funciones de la 111 (`rival_board`, `rival_board_match`,
-- `rival_board_tenants`) con el MISMO cuerpo y `'trial_expired'` sumado a la
-- lista de estados. `'free'` queda hasta que el PR que migra las filas lo saque.
-- CREATE OR REPLACE resetea proconfig: se repite `SET search_path`. Owner y
-- grants se conservan.
--
-- Necesita la 118 (valor `trial_expired`) ya aplicada.
--
-- Rollback (a mano): re-ejecutar las tres funciones de la 111.
-- ============================================================

CREATE OR REPLACE FUNCTION rival_board(
  p_tenant_id       uuid DEFAULT NULL,
  p_after_starts_at timestamptz DEFAULT NULL,
  p_after_id        uuid DEFAULT NULL,
  p_limit           integer DEFAULT 30
)
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
         m.seeking, m.seeking_position, m.confirmed_count + m.offline_count,
         EXISTS (
           SELECT 1 FROM bookings b
           WHERE b.id = m.booking_id AND b.status = 'confirmed' AND b.starts_at = m.starts_at
         )
  FROM rival_matches m
  JOIN tenants t ON t.id = m.tenant_id
  WHERE m.on_board
    -- Mismo criterio que publicTenantVisibilityConds() (search.service.ts): un
    -- complejo que el jugador no podría encontrar (suspendido, bloqueado, sin
    -- onboarding, fuera del marketplace) no muestra partidos en el tablón. Las
    -- DOS listas tienen que moverse juntas. rival_public_match NO filtra por esto
    -- a propósito: quien ya tiene el link del grupo sigue pudiendo abrirlo.
    AND t.status::text IN ('active', 'trialing', 'canceled', 'trial_expired', 'free')
    AND t.marketplace_visible
    AND COALESCE((t.settings ->> 'onboarding_completed')::boolean, false)
    AND m.seeking IS NOT NULL
    AND m.status = 'open'
    AND m.hidden_at IS NULL
    AND m.starts_at > now()
    AND (m.seeking = 'rival' OR m.confirmed_count + m.offline_count < m.capacity)
    AND (p_tenant_id IS NULL OR m.tenant_id = p_tenant_id)
    AND (p_after_starts_at IS NULL OR (m.starts_at, m.id) > (p_after_starts_at, p_after_id))
  ORDER BY m.starts_at, m.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100)
$$;

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
         m.seeking, m.seeking_position, m.confirmed_count + m.offline_count,
         EXISTS (
           SELECT 1 FROM bookings b
           WHERE b.id = m.booking_id AND b.status = 'confirmed' AND b.starts_at = m.starts_at
         )
  FROM rival_matches m
  JOIN tenants t ON t.id = m.tenant_id
  WHERE m.id = p_id
    -- Estos filtros son los de rival_board: si cambian allá, cambian acá.
    AND m.on_board
    AND t.status::text IN ('active', 'trialing', 'canceled', 'trial_expired', 'free')
    AND t.marketplace_visible
    AND COALESCE((t.settings ->> 'onboarding_completed')::boolean, false)
    AND m.seeking IS NOT NULL
    AND m.status = 'open'
    AND m.hidden_at IS NULL
    AND m.starts_at > now()
    AND (m.seeking = 'rival' OR m.confirmed_count + m.offline_count < m.capacity)
$$;

CREATE OR REPLACE FUNCTION rival_board_tenants()
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT t.id, t.name
  FROM tenants t
  WHERE t.status::text IN ('active', 'trialing', 'canceled', 'trial_expired', 'free')
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
        AND (m.seeking = 'rival' OR m.confirmed_count + m.offline_count < m.capacity)
    )
  ORDER BY t.name, t.id
$$;
