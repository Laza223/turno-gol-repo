-- ============================================================
-- 111_free_plan_columns.sql
-- Plan gratis del freemium (docs/decisions/2026-11-08-freemium-spec-y-estado-free.md).
-- Necesita la 110 (valor `free` de tenant_status) ya commiteada.
--
-- 1. Columnas de `tenants` (global, sin RLS) para el plan gratis:
--    - online_cap_month: mes ART ('YYYY-MM') en que el complejo gratis llegó al
--      tope de reservas online. Vale solo ese mes: el mes siguiente se ignora.
--      Es un cache para las superficies públicas; la autoridad es el COUNT del
--      alta online.
--    - online_paused_at: pausa automática de las reservas online (muchas
--      cancelaciones del dueño en el mes). NULL = no pausado.
--    - online_pause_reset_at: cuándo el dueño confirmó que tiene sus "ocupado"
--      al día; las cancelaciones anteriores no cuentan para la próxima pausa.
--    - last_staff_seen_at: última visita del staff al panel (como mucho una
--      escritura por día). Mide el "sin uso" del gratis abandonado.
-- 2. RIVAL: el tablón lista partidos de complejos gratis, igual que el buscador
--    (`VISIBLE_TENANT_STATUSES`). Se redefinen las tres funciones de la 106 que
--    filtran por estado, con el MISMO cuerpo y `'free'` sumado. CREATE OR REPLACE
--    resetea proconfig: se repite `SET search_path`. Owner y grants se conservan.
--
-- Aditiva: el código viejo no lee las columnas (Drizzle solo selecciona las que
-- conoce) y ningún tenant está en `free` hasta el release del freemium.
--
-- Rollback (a mano):
--   ALTER TABLE tenants DROP COLUMN online_cap_month, DROP COLUMN online_paused_at,
--     DROP COLUMN online_pause_reset_at, DROP COLUMN last_staff_seen_at;
--   y re-ejecutar rival_board / rival_board_match / rival_board_tenants de la 106.
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN online_cap_month text,
  ADD COLUMN online_paused_at timestamptz,
  ADD COLUMN online_pause_reset_at timestamptz,
  ADD COLUMN last_staff_seen_at timestamptz;

ALTER TABLE tenants
  ADD CONSTRAINT chk_tenants_online_cap_month
  CHECK (online_cap_month IS NULL OR online_cap_month ~ '^\d{4}-(0[1-9]|1[0-2])$');

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
    AND t.status::text IN ('active', 'trialing', 'canceled', 'free')
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
    AND t.status::text IN ('active', 'trialing', 'canceled', 'free')
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
  WHERE t.status::text IN ('active', 'trialing', 'canceled', 'free')
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
