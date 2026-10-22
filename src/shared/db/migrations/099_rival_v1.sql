-- ============================================================
-- 099_rival_v1.sql
-- RIVAL v1 (PR1, base de datos). Spec: docs/superpowers/specs/2026-10-22-rival-v1-design.md
-- (§3 campos, §4 estados, §6 visibilidad, §8 denuncias y bans, §12 diseño técnico).
-- Decisiones: docs/decisions/2026-10-22-rival-v1.md (7 bans, 8 visibilidad, 9 denuncias).
--
-- Aditiva: 6 tablas nuevas, 5 columnas nullable en `players` (sin backfill) y el
-- flag `rival` global en false. No toca datos existentes.
--
-- ── Modelo de acceso ────────────────────────────────────────
-- Tablas HÍBRIDAS (RLS por `app.current_player_id`, ENABLE + FORCE, policies con
-- el wrap `(SELECT ...)` de la 052). Sin sesión de jugador no se lee ni se
-- escribe ninguna fila directo. Lo que un tercero puede ver va SOLO por
-- funciones SECURITY DEFINER con columnas explícitas (rival_public_match,
-- rival_board, rival_roster, rival_join_by_invite, rival_my_matches). Las funciones definer y los
-- triggers corren como el dueño de las tablas (BYPASSRLS/superuser en toda
-- instalación real, mismo supuesto que la 018 de open_matches).
--
-- ── Triggers: quién es "el actor" ───────────────────────────
-- Las reglas de negocio se aplican cuando hay `app.current_player_id` y la
-- escritura NO es interna.
--   * Sin actor: contexto de sistema (worker, super-admin, tests con el pool
--     admin). Un rol sin BYPASSRLS nunca llega acá con filas: la RLS lo corta
--     antes. Se saltea la lógica de negocio.
--   * Escritura interna (alta del organizador, promoción del banco, recuento,
--     cierre de la búsqueda, ocultar por denuncias, SET NULL de la FK de la
--     reserva): la reconoce `rival_is_internal_write()`, en la cláusula WHEN
--     de los triggers BEFORE de rival_matches y rival_participants. Es verdad
--     cuando la escritura la dispara OTRO trigger (`pg_trigger_depth() > 0`) Y
--     se ejecuta como el dueño de las tablas (`current_user`). Lo segundo es lo
--     que no se fabrica: los triggers de este archivo son SECURITY DEFINER, así
--     que sus escrituras corren como el dueño; un trigger temporal de
--     `turnogol_app` (que tiene TEMP) corre como `turnogol_app` y por más
--     profundo que anide sigue pasando por las reglas. Ni la profundidad ni un
--     GUC `rival.*` alcanzan solos: la primera se anida y el segundo lo puede
--     setear cualquier rol. La única función que escribe como dueño y llama la
--     app es `rival_join_by_invite`, que se niega a correr dentro de un trigger.
--     (El dueño se lee de la tabla, sin nombrarlo: en local y en Supabase
--     cambia.)
--
-- ── Orden de locks ──────────────────────────────────────────
-- Todo camino que toca participantes de un partido toma PRIMERO la fila del
-- partido (`rival_lock_match` desde el service; los triggers ya la toman). Si no,
-- una baja (fila del participante, después el partido) se cruza con la
-- promoción del banco (partido, después el participante) y Postgres mata una
-- con 40P01.
--
-- ── Errores de dominio ──────────────────────────────────────
-- RAISE EXCEPTION con MESSAGE = código estable (SQLSTATE P0001):
--   rival_not_found, rival_no_session, rival_expired, rival_canceled,
--   rival_full, rival_banned, rival_limit_active, rival_limit_requests,
--   rival_forbidden_transition, rival_immutable, rival_not_on_board,
--   rival_hidden, rival_booking_mismatch, rival_court_required,
--   rival_contact_required, rival_invalid_report, rival_captain_taken.
--
-- Rollback (a mano, en este orden): ver el bloque al final de este archivo.
-- ============================================================

-- ─── players: perfil RIVAL ───────────────────────────────────
-- `avatar_url` ya existe y se reutiliza para la foto. `preferred_area` (texto
-- libre) deja de editarse; su borrado va en una migración posterior a PR3.
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS rival_accepted_at   timestamptz,
  ADD COLUMN IF NOT EXISTS rival_terms_version text,
  ADD COLUMN IF NOT EXISTS position            text
    CONSTRAINT players_position_check
    CHECK (position IN ('goalkeeper', 'defender', 'midfielder', 'forward', 'any')),
  -- Lista cerrada (nunca texto libre sobre personas). Tiene que coincidir con
  -- RIVAL_ZONES de rival-zones.ts: lo vigila tests/unit/rival-zones-sync.test.ts.
  ADD COLUMN IF NOT EXISTS zone                text
    CONSTRAINT players_zone_check CHECK (zone IN (
      'Luján', 'Jáuregui', 'Open Door', 'Torres', 'Pueblo Nuevo', 'Olivera',
      'Carlos Keen', 'General Rodríguez', 'Mercedes', 'Pilar', 'Moreno',
      'Exaltación de la Cruz', 'Otra zona'
    )),
  ADD COLUMN IF NOT EXISTS signup_source       text
    CONSTRAINT players_signup_source_check CHECK (char_length(signup_source) <= 40);

COMMENT ON COLUMN players.position IS
  'Posición declarada para RIVAL (cerrada). La ve solo el organizador de un partido al que el jugador se suma o pide sumarse.';
COMMENT ON COLUMN players.zone IS
  'Zona de la lista cerrada de rival-zones.ts (CHECK en la base: la lista vive en los dos lados y un test unitario los compara).';
COMMENT ON COLUMN players.signup_source IS
  'Origen de la cuenta (ej. ''rival''). Para las métricas de RIVAL.';

-- ─── Helpers internos (sin grant: solo los llaman otras funciones definer) ──

CREATE OR REPLACE FUNCTION rival_actor()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(current_setting('app.current_player_id', true), '')::uuid
$$;

-- Código de invitación no adivinable: 10 símbolos del alfabeto de
-- referral.schema.ts (sin I/L/O/0/1), sacados de gen_random_uuid() (CSPRNG del
-- core, sin depender de pgcrypto). Rechazo de bytes >= 248 para no sesgar el
-- módulo 31 (248 = 31 × 8). Los bytes 6 y 8 del UUID v4 tienen bits fijos.
CREATE OR REPLACE FUNCTION rival_generate_invite_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public, pg_temp
AS $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text := '';
  b bytea;
  v integer;
BEGIN
  WHILE length(code) < 10 LOOP
    b := uuid_send(gen_random_uuid());
    FOR i IN 0..15 LOOP
      CONTINUE WHEN i IN (6, 8);
      v := get_byte(b, i);
      IF v < 248 THEN
        code := code || substr(alphabet, (v % 31) + 1, 1);
        EXIT WHEN length(code) >= 10;
      END IF;
    END LOOP;
  END LOOP;
  RETURN code;
END;
$$;

-- Decisión 7: ban global + ban MANUAL vigente del complejo. Los softbans
-- automáticos (banned_by IS NULL: ausencias y cancelación tardía) NO frenan.
CREATE OR REPLACE FUNCTION rival_is_banned(p_player_id uuid, p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM players WHERE id = p_player_id AND status = 'banned')
      OR EXISTS (
        SELECT 1 FROM tenant_player_bans b
        WHERE b.tenant_id = p_tenant_id
          AND b.player_id = p_player_id
          AND b.banned_by IS NOT NULL
          AND (b.banned_until IS NULL OR b.banned_until > now())
      )
$$;

-- ─── Tablas ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rival_matches (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid        NOT NULL REFERENCES tenants(id),
  organizer_player_id uuid        NOT NULL REFERENCES players(id),
  -- SET NULL: si la reserva se BORRA (cancelar un abonado, liberar un bloqueo, la
  -- retención) el partido queda como el de una reserva cancelada: el sello se
  -- deriva en cada lectura y baja solo. No se marca `court_declared`: sería
  -- afirmar una declaración que el organizador no hizo. "Un partido tiene
  -- cancha" se exige al CREAR (trigger rival_matches_bi), no como CHECK, porque
  -- un CHECK impediría este SET NULL.
  booking_id          uuid        REFERENCES bookings(id) ON DELETE SET NULL,
  court_declared      boolean     NOT NULL DEFAULT false,
  starts_at           timestamptz NOT NULL,
  format              integer     NOT NULL,
  capacity            integer     NOT NULL,
  level               text        NOT NULL,
  invite_code         text        NOT NULL DEFAULT rival_generate_invite_code(),
  on_board            boolean     NOT NULL DEFAULT false,
  seeking             text,
  seeking_position    text,
  status              text        NOT NULL DEFAULT 'open',
  hidden_at           timestamptz,
  confirmed_count     integer     NOT NULL DEFAULT 0,
  filled_at           timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rival_matches_format_check CHECK (format BETWEEN 4 AND 11),
  CONSTRAINT rival_matches_capacity_check CHECK (capacity BETWEEN 2 AND 22),
  CONSTRAINT rival_matches_level_check CHECK (level IN ('tranqui', 'parejo', 'picante')),
  CONSTRAINT rival_matches_status_check CHECK (status IN ('open', 'canceled')),
  CONSTRAINT rival_matches_seeking_check CHECK (seeking IN ('players', 'rival')),
  CONSTRAINT rival_matches_seeking_position_check CHECK (seeking_position IN ('any', 'goalkeeper')),
  -- Publicado <=> busca algo. La posición solo existe cuando se buscan jugadores.
  CONSTRAINT rival_matches_board_seeking_check CHECK (on_board = (seeking IS NOT NULL)),
  CONSTRAINT rival_matches_seeking_position_scope_check
    CHECK ((seeking = 'players') IS TRUE = (seeking_position IS NOT NULL)),
  CONSTRAINT rival_matches_canceled_off_board_check CHECK (status = 'open' OR NOT on_board),
  CONSTRAINT rival_matches_confirmed_count_check CHECK (confirmed_count BETWEEN 0 AND capacity),
  CONSTRAINT rival_matches_invite_code_format
    CHECK (invite_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rival_matches_invite_code ON rival_matches(invite_code);
-- Tablón: complejo + hora, solo lo publicado, abierto y visible.
CREATE INDEX IF NOT EXISTS idx_rival_matches_board
  ON rival_matches(tenant_id, starts_at)
  WHERE on_board AND status = 'open' AND hidden_at IS NULL;
-- Tope de 3 activos por organizador.
CREATE INDEX IF NOT EXISTS idx_rival_matches_organizer_active
  ON rival_matches(organizer_player_id, starts_at)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_rival_matches_tenant ON rival_matches(tenant_id);

COMMENT ON TABLE rival_matches IS
  'Partido de RIVAL v1 (grupo + tablón en un solo modelo). Híbrida: RLS por app.current_player_id; los terceros leen por rival_public_match / rival_board. Ningún campo es texto libre ni precio.';
COMMENT ON COLUMN rival_matches.invite_code IS
  'Código del link /rival/p/<code>. NUNCA sale por rival_board: con el código cualquiera se saltaría la aceptación del organizador.';
COMMENT ON COLUMN rival_matches.confirmed_count IS
  'Recuento (no ±1) de participantes role=player en status confirmed, mantenido por trigger.';

CREATE TABLE IF NOT EXISTS rival_match_contacts (
  match_id        uuid        PRIMARY KEY REFERENCES rival_matches(id) ON DELETE CASCADE,
  whatsapp_digits text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rival_match_contacts_digits_check CHECK (whatsapp_digits ~ '^[0-9]{8,15}$')
);

COMMENT ON TABLE rival_match_contacts IS
  'WhatsApp del organizador de un partido publicado. Aparte porque una columna no puede tener RLS propia. Lo ve solo el organizador y el aceptado del tablón, hasta starts_at o la cancelación; se borra al cancelar, por el worker de retención al llegar starts_at y con ARCO.';

CREATE TABLE IF NOT EXISTS rival_participants (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid        NOT NULL REFERENCES tenants(id),
  match_id     uuid        NOT NULL REFERENCES rival_matches(id) ON DELETE CASCADE,
  player_id    uuid        NOT NULL REFERENCES players(id),
  role         text        NOT NULL DEFAULT 'player',
  status       text        NOT NULL,
  origin       text        NOT NULL,
  -- No se pisa al bajarse: mide "personas que se sumaron".
  confirmed_at timestamptz,
  decided_at   timestamptz,
  -- Orden de llegada al banco: lo escribe el trigger con clock_timestamp()
  -- DESPUÉS de tomar el lock del partido.
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rival_participants_role_check CHECK (role IN ('player', 'rival_captain')),
  CONSTRAINT rival_participants_status_check
    CHECK (status IN ('requested', 'confirmed', 'bench', 'declined', 'left', 'removed')),
  CONSTRAINT rival_participants_origin_check CHECK (origin IN ('invite', 'board')),
  CONSTRAINT rival_participants_captain_board_check CHECK (role = 'player' OR origin = 'board'),
  CONSTRAINT rival_participants_bench_player_check CHECK (status <> 'bench' OR role = 'player'),
  CONSTRAINT uq_rival_participants_match_player UNIQUE (match_id, player_id)
);

-- Un solo capitán rival confirmado por partido.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rival_participants_captain
  ON rival_participants(match_id)
  WHERE role = 'rival_captain' AND status = 'confirmed';
-- Tope de 5 pedidos pendientes por jugador.
CREATE INDEX IF NOT EXISTS idx_rival_participants_pending
  ON rival_participants(player_id)
  WHERE status = 'requested';
-- Recuento y orden del banco.
CREATE INDEX IF NOT EXISTS idx_rival_participants_match_status
  ON rival_participants(match_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_rival_participants_player ON rival_participants(player_id);
CREATE INDEX IF NOT EXISTS idx_rival_participants_tenant ON rival_participants(tenant_id);

COMMENT ON TABLE rival_participants IS
  'Quién está en cada partido y en qué estado (spec §4). El organizador entra solo como fila confirmed. role=rival_captain (Busca rival) no cuenta para el cupo.';

CREATE TABLE IF NOT EXISTS rival_reports (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id             uuid        NOT NULL REFERENCES rival_matches(id) ON DELETE CASCADE,
  reporter_player_id   uuid        NOT NULL REFERENCES players(id),
  -- NULL = denuncia del partido. Con valor = denuncia a esa persona dentro del partido.
  reported_player_id   uuid        REFERENCES players(id),
  reason               text        NOT NULL,
  -- La calcula la DB (trigger); el cliente no la manda.
  counts_for_autohide  boolean     NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rival_reports_reason_check
    CHECK (reason IN ('not_exists', 'spam', 'offensive', 'minor')),
  CONSTRAINT uq_rival_reports_match_reporter_reported
    UNIQUE NULLS NOT DISTINCT (match_id, reporter_player_id, reported_player_id)
);

CREATE INDEX IF NOT EXISTS idx_rival_reports_match ON rival_reports(match_id);

COMMENT ON TABLE rival_reports IS
  'Denuncias con motivo cerrado. 3 denunciantes distintos del partido con counts_for_autohide ocultan el partido (decisión 9). Sin tenant_id: el complejo se resuelve por el partido.';

CREATE TABLE IF NOT EXISTS rival_alert_subscriptions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       uuid        NOT NULL REFERENCES players(id),
  tenant_id       uuid        NOT NULL REFERENCES tenants(id),
  only_goalkeeper boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_rival_alert_subscriptions_player_tenant UNIQUE (player_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_rival_alert_subscriptions_tenant
  ON rival_alert_subscriptions(tenant_id);

-- Dedupe de alertas (uno por publicación y jugador, uno por día y jugador).
-- Del sistema, como ops_alerts (097): SIN tenant_id a propósito, no es una tabla
-- por complejo. La escribe solo el worker.
CREATE TABLE IF NOT EXISTS rival_alert_sends (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id   uuid        NOT NULL REFERENCES rival_matches(id) ON DELETE CASCADE,
  player_id  uuid        NOT NULL REFERENCES players(id),
  -- Día calendario ART del envío, lo calcula el worker.
  sent_on    date        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_rival_alert_sends_match_player UNIQUE (match_id, player_id),
  CONSTRAINT uq_rival_alert_sends_player_day UNIQUE (player_id, sent_on)
);

COMMENT ON TABLE rival_alert_sends IS
  'Dedupe de alertas de RIVAL por mail. Deny-all para turnogol_app (RLS FORCE sin policies + REVOKE ALL); solo la toca el worker.';

-- "Partidos jugados" (spec §6): reservas completadas + partidos RIVAL vencidos
-- en los que estuvo confirmado, sin contar dos veces el partido cuyo
-- booking_id es una reserva suya ya completada.
CREATE OR REPLACE FUNCTION rival_games_played(p_player_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (
    SELECT count(*)::int FROM bookings b
    WHERE b.player_id = p_player_id AND b.status = 'completed'
  ) + (
    SELECT count(*)::int
    FROM rival_participants rp
    JOIN rival_matches rm ON rm.id = rp.match_id
    WHERE rp.player_id = p_player_id
      AND rp.status = 'confirmed'
      AND rm.status = 'open'
      AND rm.starts_at <= now()
      AND NOT EXISTS (
        SELECT 1 FROM bookings bb
        WHERE bb.id = rm.booking_id AND bb.player_id = p_player_id AND bb.status = 'completed'
      )
  )
$$;

-- ─── Helpers de policies (definer: evitan la recursión matches <-> participants) ──

CREATE OR REPLACE FUNCTION rival_is_organizer(p_match_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM rival_matches m
    WHERE m.id = p_match_id AND m.organizer_player_id = rival_actor()
  )
$$;

-- Toma el lock de la fila del partido ANTES de tocar a sus participantes (ver
-- "Orden de locks" arriba). Solo bloquea un partido en el que el caller es el
-- organizador o tiene fila de participante; para cualquier otro no hace nada.
-- Definer porque un participante no lee la fila del partido (ni el invite_code).
CREATE OR REPLACE FUNCTION rival_lock_match(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := rival_actor();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'rival_no_session';
  END IF;
  PERFORM 1
    FROM rival_matches m
    WHERE m.id = p_match_id
      AND (
        m.organizer_player_id = v_actor
        OR EXISTS (
          SELECT 1 FROM rival_participants p
          WHERE p.match_id = m.id AND p.player_id = v_actor
        )
      )
    FOR UPDATE OF m;
END;
$$;

-- Contacto: organizador y aceptado del tablón (confirmed + origin board), solo
-- mientras el partido está abierto y no empezó.
CREATE OR REPLACE FUNCTION rival_can_read_contact(p_match_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM rival_matches m
    WHERE m.id = p_match_id
      AND m.status = 'open'
      AND m.starts_at > now()
      AND (
        m.organizer_player_id = rival_actor()
        OR (
          m.hidden_at IS NULL
          AND EXISTS (
            SELECT 1 FROM rival_participants p
            WHERE p.match_id = m.id
              AND p.player_id = rival_actor()
              AND p.status = 'confirmed'
              AND p.origin = 'board'
          )
        )
      )
  )
$$;

-- ─── RLS ─────────────────────────────────────────────────────

ALTER TABLE rival_matches             ENABLE ROW LEVEL SECURITY;
ALTER TABLE rival_matches             FORCE  ROW LEVEL SECURITY;
ALTER TABLE rival_match_contacts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE rival_match_contacts      FORCE  ROW LEVEL SECURITY;
ALTER TABLE rival_participants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE rival_participants        FORCE  ROW LEVEL SECURITY;
ALTER TABLE rival_reports             ENABLE ROW LEVEL SECURITY;
ALTER TABLE rival_reports             FORCE  ROW LEVEL SECURITY;
ALTER TABLE rival_alert_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rival_alert_subscriptions FORCE  ROW LEVEL SECURITY;
ALTER TABLE rival_alert_sends         ENABLE ROW LEVEL SECURITY;
ALTER TABLE rival_alert_sends         FORCE  ROW LEVEL SECURITY;
-- rival_alert_sends: sin policies = deny-all (más el REVOKE de abajo).

-- rival_matches: SOLO el organizador lee y escribe la fila. Un participante
-- (confirmado, banco o pedido) ve su partido por rival_my_matches() y el plantel
-- por rival_roster(): leer la fila directo le daría el invite_code, y con el
-- código cualquiera se salta la aceptación del organizador.
CREATE POLICY rival_matches_select ON rival_matches FOR SELECT USING (
  organizer_player_id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid)
);
CREATE POLICY rival_matches_insert ON rival_matches FOR INSERT WITH CHECK (
  organizer_player_id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid)
);
CREATE POLICY rival_matches_update ON rival_matches FOR UPDATE USING (
  organizer_player_id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid)
) WITH CHECK (
  organizer_player_id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid)
);

-- rival_participants: cada uno ve su fila; el organizador ve todas las del partido.
-- El cliente solo inserta un PEDIDO del tablón sobre sí mismo; el alta por
-- invitación entra por rival_join_by_invite.
CREATE POLICY rival_participants_select ON rival_participants FOR SELECT USING (
  player_id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid)
  OR rival_is_organizer(match_id)
);
CREATE POLICY rival_participants_insert ON rival_participants FOR INSERT WITH CHECK (
  player_id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid)
  AND origin = 'board'
  AND status = 'requested'
);
CREATE POLICY rival_participants_update ON rival_participants FOR UPDATE USING (
  player_id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid)
  OR rival_is_organizer(match_id)
) WITH CHECK (
  player_id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid)
  OR rival_is_organizer(match_id)
);

-- rival_match_contacts
CREATE POLICY rival_match_contacts_select ON rival_match_contacts FOR SELECT USING (
  rival_can_read_contact(match_id)
);
CREATE POLICY rival_match_contacts_insert ON rival_match_contacts FOR INSERT WITH CHECK (
  rival_is_organizer(match_id)
);
CREATE POLICY rival_match_contacts_update ON rival_match_contacts FOR UPDATE USING (
  rival_is_organizer(match_id)
) WITH CHECK (
  rival_is_organizer(match_id)
);

-- rival_reports: el denunciante ve y crea las suyas.
CREATE POLICY rival_reports_select ON rival_reports FOR SELECT USING (
  reporter_player_id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid)
);
CREATE POLICY rival_reports_insert ON rival_reports FOR INSERT WITH CHECK (
  reporter_player_id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid)
);

-- rival_alert_subscriptions: cada jugador administra las suyas.
CREATE POLICY rival_alert_subscriptions_own ON rival_alert_subscriptions FOR ALL USING (
  player_id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid)
) WITH CHECK (
  player_id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid)
);

-- ¿Esta escritura es interna (la hace el sistema desde otro trigger) y no del
-- cliente? Se usa SOLO en el WHEN de los triggers BEFORE de rival_matches y
-- rival_participants. Es SECURITY INVOKER a propósito: `current_user` tiene que
-- ser quien ejecuta la sentencia que dispara el trigger, no el dueño de esta
-- función. Ver "Triggers: quién es el actor" arriba.
--   * pg_trigger_depth() > 0: la sentencia vino de otro trigger (en el WHEN la
--     profundidad todavía es la de afuera: 0 para una sentencia del cliente).
--   * current_user = dueño de rival_matches: corre como el dueño, o sea dentro de
--     una función SECURITY DEFINER nuestra. turnogol_app y turnogol_worker no lo son.
CREATE OR REPLACE FUNCTION rival_is_internal_write()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT pg_trigger_depth() > 0
     AND current_user::text = (
       SELECT pg_get_userbyid(c.relowner) FROM pg_class c
       WHERE c.oid = 'public.rival_matches'::regclass
     )
$$;

-- ─── Triggers: rival_matches ─────────────────────────────────

CREATE OR REPLACE FUNCTION trg_rival_matches_bi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid := rival_actor();
  v_active integer;
  v_booking record;
BEGIN
  -- Un partido nace con cancha: una reserva o la declaración del organizador. Va
  -- primero y vale también sin actor. Después puede quedar sin reserva (la FK es
  -- SET NULL) sin que eso sea una violación.
  IF NEW.booking_id IS NULL AND NOT NEW.court_declared THEN
    RAISE EXCEPTION 'rival_court_required';
  END IF;

  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.organizer_player_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'rival_forbidden_transition';
  END IF;

  -- Lo que escribe la DB no lo manda el cliente.
  NEW.status          := 'open';
  NEW.hidden_at       := NULL;
  NEW.confirmed_count := 0;
  NEW.filled_at       := NULL;
  NEW.invite_code     := rival_generate_invite_code();

  IF NEW.starts_at <= now() THEN
    RAISE EXCEPTION 'rival_expired';
  END IF;

  IF rival_is_banned(v_actor, NEW.tenant_id) THEN
    RAISE EXCEPTION 'rival_banned';
  END IF;

  -- El sello "Reservada en TurnoGol" se deriva de esta reserva en cada lectura:
  -- tiene que ser del organizador, del complejo, confirmada y a la misma hora.
  IF NEW.booking_id IS NOT NULL THEN
    SELECT b.player_id, b.tenant_id, b.status::text AS status, b.starts_at
      INTO v_booking
      FROM bookings b WHERE b.id = NEW.booking_id;
    IF NOT FOUND
       OR v_booking.player_id IS DISTINCT FROM v_actor
       OR v_booking.tenant_id IS DISTINCT FROM NEW.tenant_id
       OR v_booking.status <> 'confirmed'
       OR v_booking.starts_at IS DISTINCT FROM NEW.starts_at THEN
      RAISE EXCEPTION 'rival_booking_mismatch';
    END IF;
  END IF;

  -- Tope de 3 activos. El advisory lock serializa creaciones concurrentes del
  -- mismo organizador (el conteo corre con snapshot nuevo tras tomarlo).
  PERFORM pg_advisory_xact_lock(hashtextextended('rival_org:' || v_actor::text, 0));
  SELECT count(*) INTO v_active
    FROM rival_matches
    WHERE organizer_player_id = v_actor AND status = 'open' AND starts_at > now();
  IF v_active >= 3 THEN
    RAISE EXCEPTION 'rival_limit_active';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER rival_matches_bi
  BEFORE INSERT ON rival_matches
  FOR EACH ROW EXECUTE FUNCTION trg_rival_matches_bi();

CREATE OR REPLACE FUNCTION trg_rival_matches_bu()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor   uuid := rival_actor();
  v_mutable constant text[] := ARRAY['on_board', 'seeking', 'seeking_position', 'status'];
  v_captain boolean;
BEGIN
  -- Las escrituras internas no llegan acá (WHEN del trigger).
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_actor IS DISTINCT FROM OLD.organizer_player_id THEN
    RAISE EXCEPTION 'rival_forbidden_transition';
  END IF;

  -- En v1 no se edita nada: solo publicar/sacar del tablón y cancelar. Tenant,
  -- organizador, booking, código, starts_at, formato, cupo, nivel, cancha
  -- declarada, hidden_at, confirmed_count y filled_at no cambian desde el cliente.
  IF (to_jsonb(NEW) - v_mutable) IS DISTINCT FROM (to_jsonb(OLD) - v_mutable) THEN
    RAISE EXCEPTION 'rival_immutable';
  END IF;

  IF OLD.status = 'canceled' THEN
    RAISE EXCEPTION 'rival_forbidden_transition';
  END IF;

  -- Vencido (starts_at <= now()) no se reabre ni se toca.
  IF OLD.starts_at <= now() THEN
    RAISE EXCEPTION 'rival_expired';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status <> 'canceled' THEN
      RAISE EXCEPTION 'rival_forbidden_transition';
    END IF;
    NEW.on_board         := false;
    NEW.seeking          := NULL;
    NEW.seeking_position := NULL;
  ELSIF NEW.on_board AND (NOT OLD.on_board OR NEW.seeking IS DISTINCT FROM OLD.seeking) THEN
    IF OLD.hidden_at IS NOT NULL THEN
      RAISE EXCEPTION 'rival_hidden';
    END IF;
    IF NEW.seeking = 'rival' THEN
      SELECT EXISTS (
        SELECT 1 FROM rival_participants
        WHERE match_id = OLD.id AND role = 'rival_captain' AND status = 'confirmed'
      ) INTO v_captain;
      IF v_captain THEN
        RAISE EXCEPTION 'rival_forbidden_transition';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- WHEN: la escritura interna (recuento, cierre de la búsqueda, ocultar por
-- denuncias, SET NULL de la FK de la reserva) no pasa por las reglas del actor.
CREATE TRIGGER rival_matches_bu
  BEFORE UPDATE ON rival_matches
  FOR EACH ROW
  WHEN (NOT rival_is_internal_write())
  EXECUTE FUNCTION trg_rival_matches_bu();

-- El organizador entra como fila confirmed (escritura interna: sin reglas de negocio).
CREATE OR REPLACE FUNCTION trg_rival_matches_ai()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO rival_participants (tenant_id, match_id, player_id, role, status, origin, confirmed_at)
  VALUES (NEW.tenant_id, NEW.id, NEW.organizer_player_id, 'player', 'confirmed', 'invite', now());
  RETURN NEW;
END;
$$;

CREATE TRIGGER rival_matches_ai
  AFTER INSERT ON rival_matches
  FOR EACH ROW EXECUTE FUNCTION trg_rival_matches_ai();

-- Al cancelar (organizador, ARCO o sistema) se borra el WhatsApp guardado.
CREATE OR REPLACE FUNCTION trg_rival_matches_au()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM rival_match_contacts WHERE match_id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER rival_matches_au
  AFTER UPDATE ON rival_matches
  FOR EACH ROW
  WHEN (NEW.status = 'canceled' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION trg_rival_matches_au();

-- Publicar exige el WhatsApp guardado (consentimiento de cada publicación).
-- Diferido: el contacto se inserta en la misma transacción que el partido.
CREATE OR REPLACE FUNCTION trg_rival_matches_contact_required()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.on_board AND (TG_OP = 'INSERT' OR NOT OLD.on_board) THEN
    IF NOT EXISTS (SELECT 1 FROM rival_match_contacts WHERE match_id = NEW.id) THEN
      RAISE EXCEPTION 'rival_contact_required';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER rival_matches_contact_required
  AFTER INSERT OR UPDATE ON rival_matches
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION trg_rival_matches_contact_required();

-- ─── Triggers: rival_match_contacts ──────────────────────────

CREATE OR REPLACE FUNCTION trg_rival_match_contacts_biu()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := rival_actor();
  m record;
BEGIN
  -- Ninguna escritura interna toca esta tabla (solo se borra, y sin trigger).
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.match_id IS DISTINCT FROM OLD.match_id THEN
    RAISE EXCEPTION 'rival_immutable';
  END IF;
  SELECT organizer_player_id, status, starts_at INTO m FROM rival_matches WHERE id = NEW.match_id;
  IF NOT FOUND OR m.organizer_player_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'rival_forbidden_transition';
  END IF;
  IF m.status <> 'open' THEN
    RAISE EXCEPTION 'rival_canceled';
  END IF;
  IF m.starts_at <= now() THEN
    RAISE EXCEPTION 'rival_expired';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER rival_match_contacts_biu
  BEFORE INSERT OR UPDATE ON rival_match_contacts
  FOR EACH ROW EXECUTE FUNCTION trg_rival_match_contacts_biu();

-- ─── Triggers: rival_participants ────────────────────────────

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

  SELECT count(*) INTO v_count
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

CREATE TRIGGER rival_participants_bi
  BEFORE INSERT ON rival_participants
  FOR EACH ROW
  WHEN (NOT rival_is_internal_write())
  EXECUTE FUNCTION trg_rival_participants_bi();

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
      SELECT count(*) INTO v_count
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

CREATE TRIGGER rival_participants_bu
  BEFORE UPDATE ON rival_participants
  FOR EACH ROW
  WHEN (NOT rival_is_internal_write())
  EXECUTE FUNCTION trg_rival_participants_bu();

-- Recuento, promoción del banco y cierre de "Busca rival". Mismo lock del
-- partido que el BEFORE (ya lo tiene esta transacción).
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
  -- estaba y entra el siguiente.
  LOOP
    SELECT count(*) INTO v_count
      FROM rival_participants
      WHERE match_id = m.id AND role = 'player' AND status = 'confirmed';
    EXIT WHEN v_count >= m.capacity;
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
        filled_at = CASE WHEN filled_at IS NULL AND v_count >= capacity THEN now() ELSE filled_at END
    WHERE id = m.id
      AND (confirmed_count IS DISTINCT FROM v_count OR (filled_at IS NULL AND v_count >= capacity));

  -- Aceptar al capitán cierra la búsqueda y saca el partido del tablón.
  IF NEW.role = 'rival_captain' AND NEW.status = 'confirmed' THEN
    UPDATE rival_matches
      SET seeking = NULL, seeking_position = NULL, on_board = false
      WHERE id = m.id AND seeking IS NOT NULL;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER rival_participants_ai
  AFTER INSERT ON rival_participants
  FOR EACH ROW EXECUTE FUNCTION trg_rival_participants_after();

CREATE TRIGGER rival_participants_au
  AFTER UPDATE ON rival_participants
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION trg_rival_participants_after();

-- ─── Triggers: rival_reports ─────────────────────────────────

CREATE OR REPLACE FUNCTION trg_rival_reports_bi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor     uuid := rival_actor();
  m           record;
  v_created   timestamptz;
BEGIN
  -- Ninguna escritura interna inserta denuncias.
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.reporter_player_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'rival_forbidden_transition';
  END IF;

  -- Lock del partido ANTES de insertar la fila: el chequeo de la FK match_id toma
  -- después un KEY SHARE, y pedir recién en el AFTER el FOR UPDATE sería una mejora
  -- de lock que se cruza con otra denuncia (deadlock). Mismo patrón que los BEFORE
  -- de participantes.
  SELECT organizer_player_id INTO m FROM rival_matches WHERE id = NEW.match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'rival_not_found';
  END IF;

  IF NEW.reported_player_id IS NOT NULL THEN
    IF NEW.reported_player_id = v_actor
       OR NOT EXISTS (
         SELECT 1 FROM rival_participants
         WHERE match_id = NEW.match_id AND player_id = NEW.reported_player_id
       ) THEN
      RAISE EXCEPTION 'rival_invalid_report';
    END IF;
  END IF;

  -- Decisión 9: cuenta de 7 días o más y al menos una reserva completada o un
  -- partido RIVAL jugado. El organizador no cuenta contra su propio partido.
  SELECT created_at INTO v_created FROM players WHERE id = v_actor;
  NEW.counts_for_autohide :=
    v_created IS NOT NULL
    AND v_created <= now() - interval '7 days'
    AND m.organizer_player_id IS DISTINCT FROM v_actor
    AND rival_games_played(v_actor) >= 1;

  RETURN NEW;
END;
$$;

CREATE TRIGGER rival_reports_bi
  BEFORE INSERT ON rival_reports
  FOR EACH ROW EXECUTE FUNCTION trg_rival_reports_bi();

-- 3 denunciantes distintos del PARTIDO (reported_player_id NULL) que cuentan
-- ocultan el partido hasta que lo revise el super-admin.
CREATE OR REPLACE FUNCTION trg_rival_reports_ai()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_distinct integer;
BEGIN
  IF NEW.reported_player_id IS NOT NULL OR NOT NEW.counts_for_autohide THEN
    RETURN NULL;
  END IF;
  -- El lock del partido ya lo tomó el BEFORE (trg_rival_reports_bi): las denuncias
  -- simultáneas llegan acá de a una y cada una ve las confirmadas. Sin actor (sistema)
  -- no hay BEFORE, así que se toma igual; si ya lo tiene esta transacción no cuesta.
  PERFORM 1 FROM rival_matches WHERE id = NEW.match_id FOR UPDATE;
  SELECT count(DISTINCT reporter_player_id) INTO v_distinct
    FROM rival_reports
    WHERE match_id = NEW.match_id AND reported_player_id IS NULL AND counts_for_autohide;
  IF v_distinct >= 3 THEN
    UPDATE rival_matches SET hidden_at = now() WHERE id = NEW.match_id AND hidden_at IS NULL;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER rival_reports_ai
  AFTER INSERT ON rival_reports
  FOR EACH ROW EXECUTE FUNCTION trg_rival_reports_ai();

-- ─── Lecturas de terceros (SECURITY DEFINER, columnas explícitas) ────

-- Datos del partido y contador, SIN personas. Sirve sin sesión. El oculto no se
-- ve por link salvo para el organizador.
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
         m.level, m.status, m.seeking, m.seeking_position, m.confirmed_count, m.filled_at,
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

-- Tablón: expone `id` y NUNCA invite_code ni al organizador. Solo publicados,
-- abiertos, no vencidos, no ocultos y con algo que buscar (faltan jugadores o
-- busca rival). Paginado por cursor (starts_at, id).
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
         m.seeking, m.seeking_position, m.confirmed_count,
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
    AND (m.seeking = 'rival' OR m.confirmed_count < m.capacity)
    AND (p_tenant_id IS NULL OR m.tenant_id = p_tenant_id)
    AND (p_after_starts_at IS NULL OR (m.starts_at, m.id) > (p_after_starts_at, p_after_id))
  ORDER BY m.starts_at, m.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100)
$$;

-- Plantel (spec §6, decisión 8). Requiere sesión.
--   * Organizador: confirmados, banco y pedidos, con posición, zona, partidos
--     jugados y desde cuándo está en TurnoGol.
--   * Participante confirmado/en el banco, o quien trae el invite_code correcto:
--     solo los confirmados (nombre corto y foto), más su propia fila.
--   * Cualquier otro: solo su propia fila, si existe. Con el `id` del tablón
--     solo NO alcanza: hace falta el código (el link).
--   * Oculto: solo el organizador.
CREATE OR REPLACE FUNCTION rival_roster(p_match_id uuid, p_invite_code text DEFAULT NULL)
RETURNS TABLE (
  participant_id uuid,
  player_id      uuid,
  role           text,
  status         text,
  origin         text,
  is_me          boolean,
  short_name     text,
  avatar_url     text,
  confirmed_at   timestamptz,
  "position"     text,
  zone           text,
  games_played   integer,
  member_since   timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_actor   uuid := rival_actor();
  m         rival_matches%ROWTYPE;
  v_is_org  boolean;
  v_allowed boolean;
BEGIN
  IF v_actor IS NULL THEN
    RETURN;
  END IF;
  SELECT * INTO m FROM rival_matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  v_is_org := m.organizer_player_id = v_actor;
  IF m.hidden_at IS NOT NULL AND NOT v_is_org THEN
    RETURN;
  END IF;
  v_allowed := v_is_org
    OR (p_invite_code IS NOT NULL AND p_invite_code = m.invite_code)
    OR EXISTS (
      SELECT 1 FROM rival_participants x
      WHERE x.match_id = m.id AND x.player_id = v_actor AND x.status IN ('confirmed', 'bench')
    );

  RETURN QUERY
  SELECT p.id, p.player_id, p.role, p.status, p.origin,
         (p.player_id = v_actor),
         -- ARCO deja first_name/last_name en '[eliminado]': el mismo rótulo que usa el
         -- resto del repo para un anonimizado, sin iniciales armadas con el marcador.
         CASE WHEN pl.status = 'anonymized' THEN 'Jugador anonimizado'
              ELSE pl.first_name || CASE WHEN COALESCE(pl.last_name, '') <> ''
                                         THEN ' ' || upper(left(pl.last_name, 1)) || '.' ELSE '' END
         END,
         pl.avatar_url,
         p.confirmed_at,
         CASE WHEN v_is_org THEN pl."position" END,
         CASE WHEN v_is_org THEN pl.zone END,
         CASE WHEN v_is_org THEN rival_games_played(pl.id) END,
         CASE WHEN v_is_org THEN pl.created_at END
  FROM rival_participants p
  JOIN players pl ON pl.id = p.player_id
  WHERE p.match_id = m.id
    AND (
      p.player_id = v_actor
      OR (v_is_org AND p.status IN ('confirmed', 'bench', 'requested'))
      OR (v_allowed AND p.status = 'confirmed')
    )
  ORDER BY p.created_at, p.id;
END;
$$;

-- "Mis partidos": los que organizo y en los que estoy, en CUALQUIER estado de
-- participante (también `requested`, `declined`, `left`, `removed`). La RLS de
-- rival_matches solo deja leer la fila a organizador y confirmado/banco: quien
-- pidió y espera no la vería, por eso es una función definer con columnas
-- explícitas. El `invite_code` solo sale para el organizador. Los partidos
-- ocultos solo los ve el organizador. Los próximos arriba (por hora), después
-- los que ya pasaron (el más reciente primero).
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
         m.status, m.on_board, m.seeking, m.seeking_position, m.confirmed_count, m.filled_at,
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

-- "Voy" por link. Idempotente: si ya hay fila, la devuelve sin tocarla (un
-- pedido del tablón NO se confirma por acá, ni un `removed`/`declined` vuelve).
-- Con cupo entra confirmed, sin cupo entra al banco (lo decide el trigger).
-- Decisión 10: quien se bajó solo (`left`) vuelve como un alta nueva. Se borra
-- su fila y se hace el INSERT de siempre, así pasa por las mismas validaciones
-- del trigger BEFORE INSERT (cupo, banco, bans, vencido, cancelado, oculto) y
-- vuelve como `player`/`invite` aunque antes fuera capitán o viniera del tablón.
-- Es atómico: si el INSERT rechaza, el DELETE se deshace y la fila `left` queda.
-- rival_participants no tiene triggers de DELETE y una fila `left` no cuenta en
-- confirmed_count, así que borrarla no promueve ni recuenta nada.
-- El DELETE lockea la fila del participante antes que el partido, al revés del
-- orden del encabezado. Es deliberado y no deadlockea: ningún camino que lockea
-- el partido primero toca una fila `left`.
CREATE OR REPLACE FUNCTION rival_join_by_invite(p_code text)
RETURNS TABLE (participant_id uuid, match_id uuid, status text, joined boolean)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_actor uuid := rival_actor();
  m       record;
  v_id    uuid;
  v_status text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'rival_no_session';
  END IF;
  -- Esta función escribe como el dueño de las tablas. Llamada desde un trigger
  -- de un cliente (turnogol_app tiene TEMP) el INSERT de abajo se vería como
  -- escritura interna y se saltearía cupo, ban y límites: solo vale de primer nivel.
  IF pg_trigger_depth() > 0 THEN
    RAISE EXCEPTION 'rival_forbidden_transition';
  END IF;

  SELECT rm.id, rm.tenant_id, rm.hidden_at, rm.organizer_player_id INTO m
    FROM rival_matches rm WHERE rm.invite_code = p_code;
  IF NOT FOUND OR (m.hidden_at IS NOT NULL AND m.organizer_player_id <> v_actor) THEN
    RAISE EXCEPTION 'rival_not_found';
  END IF;

  SELECT p.id, p.status INTO v_id, v_status
    FROM rival_participants p WHERE p.match_id = m.id AND p.player_id = v_actor;
  IF FOUND THEN
    IF v_status <> 'left' THEN
      RETURN QUERY SELECT v_id, m.id, v_status, false;
      RETURN;
    END IF;
    DELETE FROM rival_participants WHERE id = v_id;
  END IF;

  INSERT INTO rival_participants (tenant_id, match_id, player_id, role, status, origin)
  VALUES (m.tenant_id, m.id, v_actor, 'player', 'confirmed', 'invite')
  ON CONFLICT (match_id, player_id) DO NOTHING
  RETURNING id, rival_participants.status INTO v_id, v_status;

  IF v_id IS NULL THEN
    SELECT p.id, p.status INTO v_id, v_status
      FROM rival_participants p WHERE p.match_id = m.id AND p.player_id = v_actor;
    RETURN QUERY SELECT v_id, m.id, v_status, false;
    RETURN;
  END IF;

  RETURN QUERY SELECT v_id, m.id, v_status, true;
END;
$$;

-- ─── Grants ──────────────────────────────────────────────────
-- Los DEFAULT PRIVILEGES de 037/038 dan CRUD a turnogol_app y turnogol_worker
-- sobre tablas nuevas. Acá se recorta lo que la app no necesita: partidos,
-- plantel, contactos y denuncias no se borran desde la web (los borra la
-- retención por el worker) y las denuncias no se editan.
REVOKE DELETE ON rival_matches        FROM turnogol_app;
REVOKE DELETE ON rival_participants   FROM turnogol_app;
REVOKE DELETE ON rival_match_contacts FROM turnogol_app;
REVOKE UPDATE, DELETE ON rival_reports FROM turnogol_app;
REVOKE ALL ON rival_alert_sends       FROM turnogol_app;

-- Si existen (Supabase), anon/authenticated no tocan nada de RIVAL: todo entra
-- por el pool de la app o el del worker.
DO $$
DECLARE
  r text;
  t text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      FOREACH t IN ARRAY ARRAY[
        'rival_matches', 'rival_match_contacts', 'rival_participants',
        'rival_reports', 'rival_alert_subscriptions', 'rival_alert_sends'
      ] LOOP
        EXECUTE format('REVOKE ALL ON %I FROM %I', t, r);
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- Funciones: REVOKE de PUBLIC/anon/authenticated (patrón 056/080). Las que llama
-- la app (policies, DEFAULT, lecturas, join) se re-otorgan a turnogol_app y
-- turnogol_worker; los triggers y helpers internos no necesitan EXECUTE: los
-- invoca el dueño.
DO $$
DECLARE
  f text;
  r text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'rival_actor()',
    'rival_is_internal_write()',
    'rival_generate_invite_code()',
    'rival_is_banned(uuid, uuid)',
    'rival_games_played(uuid)',
    'rival_is_organizer(uuid)',
    'rival_lock_match(uuid)',
    'rival_can_read_contact(uuid)',
    'rival_public_match(text)',
    'rival_board(uuid, timestamptz, uuid, integer)',
    'rival_roster(uuid, text)',
    'rival_join_by_invite(text)',
    'rival_my_matches()',
    'trg_rival_matches_bi()',
    'trg_rival_matches_bu()',
    'trg_rival_matches_ai()',
    'trg_rival_matches_au()',
    'trg_rival_matches_contact_required()',
    'trg_rival_match_contacts_biu()',
    'trg_rival_participants_bi()',
    'trg_rival_participants_bu()',
    'trg_rival_participants_after()',
    'trg_rival_reports_bi()',
    'trg_rival_reports_ai()'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f);
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM %I', f, r);
      END IF;
    END LOOP;
  END LOOP;

  FOREACH f IN ARRAY ARRAY[
    'rival_generate_invite_code()',
    'rival_is_internal_write()',
    'rival_is_organizer(uuid)',
    'rival_lock_match(uuid)',
    'rival_can_read_contact(uuid)',
    'rival_public_match(text)',
    'rival_board(uuid, timestamptz, uuid, integer)',
    'rival_roster(uuid, text)',
    'rival_join_by_invite(text)',
    'rival_my_matches()'
  ] LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO turnogol_app', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'turnogol_worker') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO turnogol_worker', f);
    END IF;
  END LOOP;
END $$;

-- ─── Feature flag ────────────────────────────────────────────
-- Global en false. Solo global: RIVAL es cross-tenant (spec §12). Idempotente,
-- como el 096.
INSERT INTO feature_flags (key, value, tenant_id)
SELECT 'rival', false, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM feature_flags WHERE key = 'rival' AND tenant_id IS NULL
);

-- ============================================================
-- ROLLBACK (probado a mano; no es parte de la migración). Orden inverso:
--
--   DELETE FROM feature_flags WHERE key = 'rival';
--   DROP TABLE IF EXISTS rival_alert_sends, rival_alert_subscriptions,
--     rival_reports, rival_participants, rival_match_contacts, rival_matches CASCADE;
--   DROP FUNCTION IF EXISTS
--     rival_my_matches(), rival_join_by_invite(text), rival_roster(uuid, text),
--     rival_board(uuid, timestamptz, uuid, integer), rival_public_match(text),
--     rival_can_read_contact(uuid), rival_lock_match(uuid), rival_is_organizer(uuid),
--     rival_games_played(uuid), rival_is_banned(uuid, uuid),
--     rival_generate_invite_code(), rival_is_internal_write(), rival_actor(),
--     trg_rival_reports_ai(), trg_rival_reports_bi(), trg_rival_participants_after(),
--     trg_rival_participants_bu(), trg_rival_participants_bi(), trg_rival_match_contacts_biu(),
--     trg_rival_matches_contact_required(), trg_rival_matches_au(), trg_rival_matches_ai(),
--     trg_rival_matches_bu(), trg_rival_matches_bi();
--   ALTER TABLE players
--     DROP COLUMN IF EXISTS signup_source, DROP COLUMN IF EXISTS zone,
--     DROP COLUMN IF EXISTS position, DROP COLUMN IF EXISTS rival_terms_version,
--     DROP COLUMN IF EXISTS rival_accepted_at;
-- ============================================================
