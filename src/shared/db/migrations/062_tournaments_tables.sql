-- ============================================================
-- 062_tournaments_tables.sql
-- Módulo Torneos, fase 1: cimientos y ocupación de la grilla.
-- Decisión: docs/decisions/2026-07-24-torneos.md
--
--   * tournaments            — la competencia: formato, fechas, reglas de
--                              puntaje y desempate, cupo, inscripción.
--   * tournament_teams       — equipos inscriptos. El capitán puede (o no)
--                              estar vinculado a un player real: los planteles
--                              amateur no tienen cuenta y no se los va a
--                              obligar a registrarse antes de la 1ra fecha.
--   * tournament_team_players — plantel. full_name es lo único obligatorio;
--                              player_id queda nullable por lo mismo.
--
-- Tesis del módulo: el torneo es un PRODUCTOR DE RESERVAS. bookings tiene el
-- exclusion constraint no_overlapping_bookings (migr. 041), así que todo lo
-- que ocupe una cancha tiene que ser una fila en bookings o se puede
-- sobrevender el turno. De ahí bookings.tournament_id + booking_type
-- 'tournament': mismo mecanismo que abonado_id + 'fixed' (migr. 004), con la
-- misma estrategia de skip-on-conflict y de cancelación por fecha.
--
-- El torneo posee HORAS ENTERAS (una reserva por hora y cancha, precio 0); los
-- partidos viven adentro de esas horas y se agregan en 063. Por eso un
-- relámpago con partidos de 25 min no rompe el turno de 60 min fijo
-- (SLOT_DURATION_MINUTES): los partidos no reservan, consumen tiempo reservado.
--
-- Nace apagado: el flag global 'tournaments' se siembra en false y se prende
-- por complejo con una fila de override (patrón 015_feature_flags).
-- ============================================================

-- ─── Enums ───────────────────────────────────────────────────

-- 'relámpago' NO es un formato: es un preset de la UI sobre estos tres
-- (duración de partido corta + varias canchas en paralelo en un solo día).
CREATE TYPE tournament_format AS ENUM ('league', 'knockout', 'groups_playoff');

-- 'canceled' con una L (convención del repo).
CREATE TYPE tournament_status AS ENUM
  ('draft', 'registration', 'in_progress', 'finished', 'canceled');

CREATE TYPE tournament_team_status AS ENUM
  ('registered', 'confirmed', 'withdrawn', 'disqualified');

-- ─── tournaments ─────────────────────────────────────────────

CREATE TABLE tournaments (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid        NOT NULL REFERENCES tenants(id),
  name                        text        NOT NULL,
  slug                        text        NOT NULL,  -- portal público (fase 4)
  format                      tournament_format NOT NULL,
  status                      tournament_status NOT NULL DEFAULT 'draft',

  starts_on                   date        NOT NULL,
  ends_on                     date,                  -- NULL = abierto (liga en curso)
  registration_deadline       date,
  max_teams                   integer,               -- NULL = sin cupo

  -- Duración del PARTIDO, independiente del turno de 60 min de la grilla.
  match_duration_minutes      integer     NOT NULL DEFAULT 60,
  rest_between_matches_minutes integer    NOT NULL DEFAULT 0,

  inscription_fee             integer     NOT NULL DEFAULT 0,  -- centavos ARS

  -- Reglas de puntaje. Configurables: no todos los complejos usan 3-1-0.
  points_win                  smallint    NOT NULL DEFAULT 3,
  points_draw                 smallint    NOT NULL DEFAULT 1,
  points_loss                 smallint    NOT NULL DEFAULT 0,

  -- Criterios de desempate ORDENADOS, aplicados después de los puntos.
  -- Valores válidos los valida el service (Zod), no la DB: la lista puede
  -- crecer sin migración.
  tiebreakers                 text[]      NOT NULL
    DEFAULT ARRAY['goal_diff', 'goals_for', 'head_to_head', 'fair_play', 'drawn_lots']::text[],

  -- Disciplina (fase 3). Viven acá porque son config del torneo, no del evento.
  yellow_cards_for_suspension smallint    NOT NULL DEFAULT 3,
  red_card_suspension_matches smallint    NOT NULL DEFAULT 1,

  -- Walkover: resultado por defecto cuando un equipo no se presenta.
  walkover_goals_for          smallint    NOT NULL DEFAULT 3,

  is_public                   boolean     NOT NULL DEFAULT false,
  notes                       text,

  created_by_staff            uuid        REFERENCES staff_users(id),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_tournament_name_nonempty CHECK (length(trim(name)) > 0),
  CONSTRAINT chk_tournament_slug_format   CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT chk_tournament_dates         CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT chk_tournament_deadline      CHECK (registration_deadline IS NULL OR registration_deadline <= starts_on),
  CONSTRAINT chk_tournament_max_teams     CHECK (max_teams IS NULL OR max_teams BETWEEN 2 AND 256),
  CONSTRAINT chk_tournament_match_duration CHECK (match_duration_minutes BETWEEN 10 AND 120),
  CONSTRAINT chk_tournament_rest          CHECK (rest_between_matches_minutes BETWEEN 0 AND 240),
  CONSTRAINT chk_tournament_fee_nonneg    CHECK (inscription_fee >= 0),
  CONSTRAINT chk_tournament_points        CHECK (points_win >= points_draw AND points_draw >= points_loss AND points_loss >= 0),
  CONSTRAINT chk_tournament_tiebreakers   CHECK (cardinality(tiebreakers) > 0),
  CONSTRAINT chk_tournament_yellow_limit  CHECK (yellow_cards_for_suspension BETWEEN 1 AND 20),
  CONSTRAINT chk_tournament_red_matches   CHECK (red_card_suspension_matches BETWEEN 0 AND 20),
  CONSTRAINT chk_tournament_walkover      CHECK (walkover_goals_for BETWEEN 0 AND 20)
);

-- El slug es único POR COMPLEJO (dos complejos pueden tener su "clausura-2026").
-- La ruta pública de la fase 4 va anidada bajo el complejo, no suelta.
CREATE UNIQUE INDEX uq_tournaments_tenant_slug ON tournaments(tenant_id, slug);

CREATE INDEX idx_tournaments_tenant        ON tournaments(tenant_id, starts_on DESC);
CREATE INDEX idx_tournaments_tenant_status ON tournaments(tenant_id, status);
CREATE INDEX idx_tournaments_public        ON tournaments(tenant_id, slug) WHERE is_public;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON tournaments
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─── tournament_teams ────────────────────────────────────────

CREATE TABLE tournament_teams (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES tenants(id),
  tournament_id     uuid        NOT NULL REFERENCES tournaments(id),
  name              text        NOT NULL,

  -- Capitán / contacto. player_id es OPCIONAL a propósito: vincularlo es lo
  -- único que de verdad rinde del CRM (historial, contacto, avisos), y exigirlo
  -- trabaría el alta el sábado a la mañana.
  contact_player_id uuid        REFERENCES players(id),
  contact_name      text,
  contact_phone     text,

  status            tournament_team_status NOT NULL DEFAULT 'registered',
  group_label       text,                  -- zona: 'A', 'B', … (se puebla en 063)
  seed              integer,               -- siembra para el sorteo
  notes             text,

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_team_name_nonempty CHECK (length(trim(name)) > 0),
  CONSTRAINT chk_team_seed_positive CHECK (seed IS NULL OR seed > 0),
  CONSTRAINT chk_team_group_label   CHECK (group_label IS NULL OR length(trim(group_label)) > 0)
);

-- Dos equipos con el mismo nombre en el mismo torneo es siempre un error de
-- carga. Case-insensitive: "Los Pibes" y "los pibes" son el mismo.
CREATE UNIQUE INDEX uq_tournament_teams_name
  ON tournament_teams(tournament_id, lower(trim(name)));

CREATE INDEX idx_tournament_teams_tournament ON tournament_teams(tournament_id, status);
CREATE INDEX idx_tournament_teams_tenant     ON tournament_teams(tenant_id);
CREATE INDEX idx_tournament_teams_player     ON tournament_teams(contact_player_id)
  WHERE contact_player_id IS NOT NULL;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON tournament_teams
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─── tournament_team_players ─────────────────────────────────

CREATE TABLE tournament_team_players (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid        NOT NULL REFERENCES tenants(id),
  team_id       uuid        NOT NULL REFERENCES tournament_teams(id),

  -- full_name es la fuente de verdad del plantel; player_id es el enganche
  -- opcional con una cuenta real.
  full_name     text        NOT NULL,
  player_id     uuid        REFERENCES players(id),
  dni           text,
  shirt_number  smallint,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_team_player_name_nonempty CHECK (length(trim(full_name)) > 0),
  CONSTRAINT chk_team_player_shirt         CHECK (shirt_number IS NULL OR shirt_number BETWEEN 0 AND 999)
);

CREATE INDEX idx_tournament_team_players_team   ON tournament_team_players(team_id);
CREATE INDEX idx_tournament_team_players_tenant ON tournament_team_players(tenant_id);
CREATE INDEX idx_tournament_team_players_player ON tournament_team_players(player_id)
  WHERE player_id IS NOT NULL;

-- Un número de camiseta no se repite dentro del equipo (si se carga).
CREATE UNIQUE INDEX uq_tournament_team_players_shirt
  ON tournament_team_players(team_id, shirt_number)
  WHERE shirt_number IS NOT NULL;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON tournament_team_players
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─── bookings.tournament_id ──────────────────────────────────
-- Espejo exacto de abonado_id: la reserva sabe de qué torneo es, y por eso el
-- torneo se cancela con DELETE ... WHERE tournament_id = X AND date >= fecha
-- (mismo camino que cancelAbonado — evita el trigger de estados terminales y
-- conserva lo ya jugado).
--
-- FK sin ON DELETE a propósito: borrar un torneo que todavía tiene horas
-- tomadas tiene que fallar. Primero se liberan las reservas, después se borra.

ALTER TABLE bookings ADD COLUMN tournament_id uuid REFERENCES tournaments(id);

CREATE INDEX idx_bookings_tournament ON bookings(tournament_id)
  WHERE tournament_id IS NOT NULL;

-- El valor nuevo del enum NO puede usarse como literal en esta misma
-- transacción (55P04) — cualquier comparación con 'tournament' va por ::text.
-- Precedente: 025_cashflow_expense.sql.
ALTER TYPE booking_type ADD VALUE IF NOT EXISTS 'tournament';

-- ─── RLS (patrón 006/014 + FORCE 021/036, initplan-wrapped 052) ──
-- Las policies nacen ya con current_setting envuelto en scalar subquery: sin
-- el (SELECT ...) la expresión se re-evalúa por fila. Ver 052.

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tournaments' AND policyname = 'tournaments_select'
  ) THEN
    CREATE POLICY tournaments_select ON tournaments
      FOR SELECT
      USING (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tournaments' AND policyname = 'tournaments_insert'
  ) THEN
    CREATE POLICY tournaments_insert ON tournaments
      FOR INSERT
      WITH CHECK (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tournaments' AND policyname = 'tournaments_update'
  ) THEN
    CREATE POLICY tournaments_update ON tournaments
      FOR UPDATE
      USING (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid))
      WITH CHECK (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid));
  END IF;
END $$;

-- Con policy de DELETE: un torneo en 'draft' cargado por error se borra. El
-- service solo lo permite en draft, y la FK de bookings frena el resto.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tournaments' AND policyname = 'tournaments_delete'
  ) THEN
    CREATE POLICY tournaments_delete ON tournaments
      FOR DELETE
      USING (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid));
  END IF;
END $$;

ALTER TABLE tournament_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_teams FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tournament_teams' AND policyname = 'tournament_teams_select'
  ) THEN
    CREATE POLICY tournament_teams_select ON tournament_teams
      FOR SELECT
      USING (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tournament_teams' AND policyname = 'tournament_teams_insert'
  ) THEN
    CREATE POLICY tournament_teams_insert ON tournament_teams
      FOR INSERT
      WITH CHECK (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tournament_teams' AND policyname = 'tournament_teams_update'
  ) THEN
    CREATE POLICY tournament_teams_update ON tournament_teams
      FOR UPDATE
      USING (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid))
      WITH CHECK (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tournament_teams' AND policyname = 'tournament_teams_delete'
  ) THEN
    CREATE POLICY tournament_teams_delete ON tournament_teams
      FOR DELETE
      USING (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid));
  END IF;
END $$;

ALTER TABLE tournament_team_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_team_players FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tournament_team_players' AND policyname = 'tournament_team_players_select'
  ) THEN
    CREATE POLICY tournament_team_players_select ON tournament_team_players
      FOR SELECT
      USING (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tournament_team_players' AND policyname = 'tournament_team_players_insert'
  ) THEN
    CREATE POLICY tournament_team_players_insert ON tournament_team_players
      FOR INSERT
      WITH CHECK (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tournament_team_players' AND policyname = 'tournament_team_players_update'
  ) THEN
    CREATE POLICY tournament_team_players_update ON tournament_team_players
      FOR UPDATE
      USING (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid))
      WITH CHECK (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tournament_team_players' AND policyname = 'tournament_team_players_delete'
  ) THEN
    CREATE POLICY tournament_team_players_delete ON tournament_team_players
      FOR DELETE
      USING (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid));
  END IF;
END $$;

-- ─── Grants / revokes ────────────────────────────────────────
-- Los DEFAULT PRIVILEGES de 037/038 ya otorgan CRUD a turnogol_app y
-- turnogol_worker sobre tablas nuevas. Las tres tablas conservan el CRUD
-- completo (un equipo se borra, un jugador sale del plantel, un torneo en
-- draft se descarta), así que no hay nada que recortar acá.

-- ─── Feature flag ────────────────────────────────────────────
-- Global en false: la feature nace apagada y se prende por complejo con una
-- fila de override (tenant_id NOT NULL). Ver 015_feature_flags.sql y
-- src/shared/feature-flags.ts (resolución tenant → global → false).

INSERT INTO feature_flags (key, value, tenant_id)
SELECT 'tournaments', false, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM feature_flags WHERE key = 'tournaments' AND tenant_id IS NULL
);
