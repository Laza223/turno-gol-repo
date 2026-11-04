-- ============================================================
-- 106_rival_offline_count.sql
-- RIVAL: "ya somos X" como número, sin datos de personas.
-- Decisión: docs/decisions/2026-11-03-rival-simple-sin-landing.md (PR0 del plan).
--
-- `rival_matches.offline_count` = lugares cubiertos FUERA de la app, SIN contar
-- al organizador (que ya es una fila `confirmed` en rival_participants). Sirve
-- para que "Faltan N" no mienta cuando los amigos del organizador no tienen
-- cuenta: antes el tablón mostraba capacity − confirmed_count ("Faltan 9").
--
-- Todo lo que comparaba `confirmed_count` con `capacity` pasa a comparar
-- `confirmed_count + offline_count`:
--   * trg_rival_participants_bi  (alta: confirmed/bench por link, rival_full del tablón)
--   * trg_rival_participants_bu  (aceptar un pedido: rival_full)
--   * trg_rival_participants_after (promoción del banco, filled_at)
--   * rival_board / rival_board_match / rival_board_tenants (filtro "hay lugar")
--   * rival_public_match / rival_my_matches / rival_board / rival_board_match:
--     la columna `confirmed_count` que DEVUELVEN pasa a ser "lugares cubiertos"
--     (confirmed + offline). El nombre se mantiene a propósito: así no cambia el
--     tipo de retorno de ninguna función (CREATE OR REPLACE conserva los grants)
--     ni el contrato con el código viejo durante la ventana de deploy.
--
-- Expand-contract: columna NOT NULL DEFAULT 0 (las filas existentes quedan en 0 =
-- comportamiento de hoy). El código viejo corre contra este schema sin cambios.
-- CREATE OR REPLACE resetea proconfig: todas las funciones re-declaran SET search_path.
-- offline_count no lo edita el cliente: trg_rival_matches_bu lo congela (compara
-- to_jsonb(NEW) - mutables). Solo se fija al INSERT, que el BEFORE INSERT no pisa.
--
-- Retención/ARCO: no agrega datos personales (es un entero).
--
-- Rollback (a mano): ver el bloque al final de este archivo.
-- ============================================================

ALTER TABLE rival_matches
  ADD COLUMN IF NOT EXISTS offline_count integer NOT NULL DEFAULT 0;

ALTER TABLE rival_matches
  ADD CONSTRAINT rival_matches_offline_count_check
    CHECK (offline_count >= 0 AND offline_count < capacity),
  ADD CONSTRAINT rival_matches_filled_check
    CHECK (confirmed_count + offline_count <= capacity);

COMMENT ON COLUMN rival_matches.offline_count IS
  'Lugares cubiertos fuera de la app, sin contar al organizador (que ya es un participante confirmed). Un número: sin nombres ni datos de personas. Se fija al crear y no se edita.';

-- ─── Triggers de cupo ────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_rival_participants_bi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor   uuid := rival_actor();
  m         rival_matches%ROWTYPE;
  v_count   integer;
  v_pending integer;
BEGIN
  -- Las escrituras internas (alta del organizador) no llegan acá (WHEN del trigger).
  IF v_actor IS NULL THEN
    -- Sistema: solo se deriva el complejo del partido.
    SELECT tenant_id INTO NEW.tenant_id FROM rival_matches WHERE id = NEW.match_id;
    RETURN NEW;
  END IF;

  IF NEW.player_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'rival_forbidden_transition';
  END IF;

  -- Lock del partido: cupo, banco y promoción son atómicos por partido.
  SELECT * INTO m FROM rival_matches WHERE id = NEW.match_id FOR UPDATE;
  IF NOT FOUND OR m.hidden_at IS NOT NULL THEN
    RAISE EXCEPTION 'rival_not_found';
  END IF;
  IF m.status <> 'open' THEN
    RAISE EXCEPTION 'rival_canceled';
  END IF;
  IF m.starts_at <= now() THEN
    RAISE EXCEPTION 'rival_expired';
  END IF;
  IF rival_is_banned(v_actor, m.tenant_id) THEN
    RAISE EXCEPTION 'rival_banned';
  END IF;

  NEW.tenant_id    := m.tenant_id;
  NEW.decided_at   := NULL;
  NEW.confirmed_at := NULL;
  NEW.created_at   := clock_timestamp();

  -- Lugares cubiertos: confirmados en la app + los de fuera de la app.
  SELECT count(*) + m.offline_count INTO v_count
    FROM rival_participants
    WHERE match_id = m.id AND role = 'player' AND status = 'confirmed';

  IF NEW.origin = 'invite' THEN
    NEW.role   := 'player';
    NEW.status := CASE WHEN v_count < m.capacity THEN 'confirmed' ELSE 'bench' END;
    IF NEW.status = 'confirmed' THEN
      NEW.confirmed_at := now();
    END IF;
  ELSE
    IF NEW.status <> 'requested' THEN
      RAISE EXCEPTION 'rival_forbidden_transition';
    END IF;
    IF NOT (m.on_board AND m.seeking IS NOT NULL) THEN
      RAISE EXCEPTION 'rival_not_on_board';
    END IF;
    NEW.role := CASE m.seeking WHEN 'rival' THEN 'rival_captain' ELSE 'player' END;
    IF NEW.role = 'player' AND v_count >= m.capacity THEN
      RAISE EXCEPTION 'rival_full';
    END IF;
    -- Tope de 5 pedidos pendientes (los de partidos ya vencidos o caídos no cuentan).
    PERFORM pg_advisory_xact_lock(hashtextextended('rival_req:' || v_actor::text, 0));
    SELECT count(*) INTO v_pending
      FROM rival_participants p
      JOIN rival_matches pm ON pm.id = p.match_id
      WHERE p.player_id = v_actor AND p.status = 'requested'
        AND pm.status = 'open' AND pm.starts_at > now();
    IF v_pending >= 5 THEN
      RAISE EXCEPTION 'rival_limit_requests';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trg_rival_participants_bu()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid := rival_actor();
  m        rival_matches%ROWTYPE;
  v_count  integer;
  v_is_org boolean;
  v_is_self boolean;
BEGIN
  -- Las escrituras internas (promoción del banco) no llegan acá (WHEN del trigger).
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  -- Del cliente solo cambia `status`; confirmed_at/decided_at los escribe el trigger.
  IF (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
    RAISE EXCEPTION 'rival_immutable';
  END IF;
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT * INTO m FROM rival_matches WHERE id = OLD.match_id FOR UPDATE;
  IF m.status <> 'open' THEN
    RAISE EXCEPTION 'rival_canceled';
  END IF;
  IF m.starts_at <= now() THEN
    RAISE EXCEPTION 'rival_expired';
  END IF;

  v_is_org  := v_actor = m.organizer_player_id;
  v_is_self := v_actor = OLD.player_id;

  -- El organizador no se baja: para irse cancela el partido.
  IF OLD.player_id = m.organizer_player_id THEN
    RAISE EXCEPTION 'rival_forbidden_transition';
  END IF;

  IF OLD.status = 'requested' AND NEW.status = 'confirmed' AND v_is_org AND NOT v_is_self THEN
    -- Decisión 7: el ban de ahora (global o manual del complejo) también frena
    -- al aceptar un pedido que se hizo antes del ban.
    IF rival_is_banned(OLD.player_id, m.tenant_id) THEN
      RAISE EXCEPTION 'rival_banned';
    END IF;
    IF OLD.role = 'player' THEN
      SELECT count(*) + m.offline_count INTO v_count
        FROM rival_participants
        WHERE match_id = m.id AND role = 'player' AND status = 'confirmed';
      IF v_count >= m.capacity THEN
        RAISE EXCEPTION 'rival_full';
      END IF;
    ELSIF EXISTS (
      SELECT 1 FROM rival_participants
      WHERE match_id = m.id AND role = 'rival_captain' AND status = 'confirmed'
    ) THEN
      RAISE EXCEPTION 'rival_captain_taken';
    END IF;
    NEW.confirmed_at := COALESCE(OLD.confirmed_at, now());
    NEW.decided_at   := now();
  ELSIF OLD.status = 'requested' AND NEW.status = 'declined' AND v_is_org AND NOT v_is_self THEN
    NEW.decided_at := now();
  ELSIF OLD.status IN ('requested', 'confirmed', 'bench') AND NEW.status = 'left' AND v_is_self THEN
    NULL;
  ELSIF OLD.status IN ('confirmed', 'bench') AND NEW.status = 'removed' AND v_is_org AND NOT v_is_self THEN
    NEW.decided_at := now();
  ELSE
    -- Incluye bench -> confirmed (solo la promoción del sistema) y que nadie
    -- se promueva a sí mismo.
    RAISE EXCEPTION 'rival_forbidden_transition';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trg_rival_participants_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  m      rival_matches%ROWTYPE;
  v_count integer;
  v_next uuid;
BEGIN
  -- La promoción de abajo dispara este mismo trigger: el lazo de afuera ya
  -- recuenta al final. Esto es solo cortar la recursión, no autoriza nada: una
  -- promoción bench -> confirmed del cliente la rechaza el BEFORE antes de llegar acá.
  IF TG_OP = 'UPDATE' AND pg_trigger_depth() > 1
     AND OLD.status = 'bench' AND NEW.status = 'confirmed' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO m FROM rival_matches WHERE id = NEW.match_id FOR UPDATE;

  -- Al liberarse un lugar entra el primero del banco, por orden de llegada. Se
  -- saltea a quien tiene un ban vigente (decisión 7): sigue en el banco como
  -- estaba y entra el siguiente. El cupo cuenta también los lugares de fuera de la app.
  LOOP
    SELECT count(*) INTO v_count
      FROM rival_participants
      WHERE match_id = m.id AND role = 'player' AND status = 'confirmed';
    EXIT WHEN v_count + m.offline_count >= m.capacity;
    SELECT id INTO v_next
      FROM rival_participants
      WHERE match_id = m.id AND role = 'player' AND status = 'bench'
        AND NOT rival_is_banned(player_id, m.tenant_id)
      ORDER BY created_at, id
      LIMIT 1;
    EXIT WHEN v_next IS NULL;
    UPDATE rival_participants
      SET status = 'confirmed', confirmed_at = COALESCE(confirmed_at, now())
      WHERE id = v_next;
  END LOOP;

  SELECT count(*) INTO v_count
    FROM rival_participants
    WHERE match_id = m.id AND role = 'player' AND status = 'confirmed';
  UPDATE rival_matches
    SET confirmed_count = v_count,
        filled_at = CASE WHEN filled_at IS NULL AND v_count + offline_count >= capacity THEN now() ELSE filled_at END
    WHERE id = m.id
      AND (confirmed_count IS DISTINCT FROM v_count
           OR (filled_at IS NULL AND v_count + offline_count >= capacity));

  -- Aceptar al capitán cierra la búsqueda y saca el partido del tablón.
  IF NEW.role = 'rival_captain' AND NEW.status = 'confirmed' THEN
    UPDATE rival_matches
      SET seeking = NULL, seeking_position = NULL, on_board = false
      WHERE id = m.id AND seeking IS NOT NULL;
  END IF;

  RETURN NULL;
END;
$$;

-- ─── Lecturas: `confirmed_count` devuelto = lugares cubiertos ─────────────

CREATE OR REPLACE FUNCTION rival_public_match(p_code text)
RETURNS TABLE (
  id               uuid,
  tenant_id        uuid,
  tenant_name      text,
  tenant_slug      text,
  tenant_city      text,
  starts_at        timestamptz,
  format           integer,
  capacity         integer,
  level            text,
  status           text,
  seeking          text,
  seeking_position text,
  confirmed_count  integer,
  filled_at        timestamptz,
  court_declared   boolean,
  has_stamp        boolean,
  is_organizer     boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.id, m.tenant_id, t.name, t.slug, t.city, m.starts_at, m.format, m.capacity,
         m.level, m.status, m.seeking, m.seeking_position,
         m.confirmed_count + m.offline_count,
         m.filled_at,
         m.court_declared,
         -- El sello no se guarda: se deriva del estado actual de la reserva.
         EXISTS (
           SELECT 1 FROM bookings b
           WHERE b.id = m.booking_id AND b.status = 'confirmed' AND b.starts_at = m.starts_at
         ),
         (m.organizer_player_id = rival_actor())
  FROM rival_matches m
  JOIN tenants t ON t.id = m.tenant_id
  WHERE m.invite_code = p_code
    AND (m.hidden_at IS NULL OR m.organizer_player_id = rival_actor())
$$;

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
    AND t.status::text IN ('active', 'trialing', 'canceled')
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

CREATE OR REPLACE FUNCTION rival_my_matches()
RETURNS TABLE (
  id               uuid,
  tenant_id        uuid,
  tenant_name      text,
  tenant_slug      text,
  starts_at        timestamptz,
  format           integer,
  capacity         integer,
  level            text,
  status           text,
  on_board         boolean,
  seeking          text,
  seeking_position text,
  confirmed_count  integer,
  filled_at        timestamptz,
  court_declared   boolean,
  has_stamp        boolean,
  is_organizer     boolean,
  invite_code      text,
  is_hidden        boolean,
  participant_id   uuid,
  my_role          text,
  my_status        text,
  my_origin        text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT m.id, m.tenant_id, t.name, t.slug, m.starts_at, m.format, m.capacity, m.level,
         m.status, m.on_board, m.seeking, m.seeking_position,
         m.confirmed_count + m.offline_count,
         m.filled_at,
         m.court_declared,
         EXISTS (
           SELECT 1 FROM bookings b
           WHERE b.id = m.booking_id AND b.status = 'confirmed' AND b.starts_at = m.starts_at
         ),
         (m.organizer_player_id = rival_actor()),
         CASE WHEN m.organizer_player_id = rival_actor() THEN m.invite_code END,
         (m.hidden_at IS NOT NULL),
         p.id, p.role, p.status, p.origin
  FROM rival_matches m
  JOIN tenants t ON t.id = m.tenant_id
  LEFT JOIN rival_participants p ON p.match_id = m.id AND p.player_id = rival_actor()
  WHERE rival_actor() IS NOT NULL
    AND (m.organizer_player_id = rival_actor() OR p.id IS NOT NULL)
    AND (m.hidden_at IS NULL OR m.organizer_player_id = rival_actor())
  ORDER BY (m.starts_at <= now()),
           CASE WHEN m.starts_at > now() THEN m.starts_at END ASC,
           m.starts_at DESC,
           m.id
  LIMIT 200
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
    AND t.status::text IN ('active', 'trialing', 'canceled')
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
        AND (m.seeking = 'rival' OR m.confirmed_count + m.offline_count < m.capacity)
    )
  ORDER BY t.name, t.id
$$;

-- ============================================================
-- ROLLBACK (a mano; no es parte de la migración). Orden:
--   1. Volver las 8 funciones a su cuerpo anterior: re-ejecutar de
--      099_rival_v1.sql trg_rival_participants_bi / _bu / _after, rival_public_match,
--      rival_board, rival_my_matches, y de 101_rival_board_detail.sql
--      rival_board_match y rival_board_tenants (CREATE OR REPLACE, mismo tipo de
--      retorno: se conservan los grants).
--   2. ALTER TABLE rival_matches
--        DROP CONSTRAINT IF EXISTS rival_matches_filled_check,
--        DROP CONSTRAINT IF EXISTS rival_matches_offline_count_check,
--        DROP COLUMN IF EXISTS offline_count;
-- Con partidos creados con offline_count > 0, el paso 1 los vuelve a mostrar con
-- "Faltan" de más: hacerlo antes del paso 2 y solo si no se puede avanzar.
-- ============================================================
