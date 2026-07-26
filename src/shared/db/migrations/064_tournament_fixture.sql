-- ============================================================================
-- 064_tournament_fixture.sql
-- Módulo Torneos, fase 2: fixture (fases y partidos).
-- Decisión: docs/decisions/2026-07-24-torneos.md
--
--   * tournament_stages  — fases del torneo. Una liga tiene una sola; un
--                          grupos+playoffs tiene la de zonas y la de llaves.
--   * tournament_matches — el partido.
--
-- Tesis (fase 1, migr. 062): el torneo posee HORAS ENTERAS como filas de
-- bookings. Los partidos viven ADENTRO de esas horas y NO reservan nada: cada
-- uno guarda su propio starts_at y apunta con booking_id a la hora que lo
-- contiene. Por eso un relámpago de partidos de 25 minutos entra sin romper
-- SLOT_DURATION_MINUTES=60, que es invariante del producto.
--
-- El avance automático del ganador en las llaves se expresa con
-- home_source_match_id / away_source_match_id (FK a la propia tabla): un
-- partido de cuartos "se alimenta" de dos de octavos. En el partido por el
-- tercer puesto esas mismas columnas apuntan a las semis, pero se leen como
-- PERDEDOR (is_third_place lo distingue).
-- ============================================================================

-- ─── Enums ───────────────────────────────────────────────────

CREATE TYPE tournament_stage_kind AS ENUM ('league', 'group_stage', 'knockout');

-- 'canceled' con una L (convención del repo).
CREATE TYPE tournament_match_status AS ENUM
  ('scheduled', 'played', 'walkover', 'postponed', 'canceled');

-- ─── tournament_stages ───────────────────────────────────────

CREATE TABLE tournament_stages (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid        NOT NULL REFERENCES tenants(id),
  tournament_id            uuid        NOT NULL REFERENCES tournaments(id),
  name                     text        NOT NULL,
  kind                     tournament_stage_kind NOT NULL,
  -- Orden de disputa: 0 = la primera que se juega.
  order_index              integer     NOT NULL DEFAULT 0,
  -- 1 = solo ida, 2 = ida y vuelta. Solo aplica a league/group_stage.
  legs                     smallint    NOT NULL DEFAULT 1,
  -- Solo group_stage.
  groups_count             smallint,
  teams_advance_per_group  smallint,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_stage_name_nonempty CHECK (length(trim(name)) > 0),
  CONSTRAINT chk_stage_legs          CHECK (legs IN (1, 2)),
  CONSTRAINT chk_stage_order         CHECK (order_index >= 0),
  CONSTRAINT chk_stage_groups        CHECK (groups_count IS NULL OR groups_count BETWEEN 1 AND 16),
  CONSTRAINT chk_stage_advance       CHECK (teams_advance_per_group IS NULL OR teams_advance_per_group >= 1),
  -- Las zonas solo tienen sentido en una fase de grupos.
  CONSTRAINT chk_stage_groups_kind   CHECK (kind = 'group_stage' OR groups_count IS NULL)
);

CREATE UNIQUE INDEX uq_tournament_stages_order
  ON tournament_stages(tournament_id, order_index);

CREATE INDEX idx_tournament_stages_tournament ON tournament_stages(tournament_id);
CREATE INDEX idx_tournament_stages_tenant     ON tournament_stages(tenant_id);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON tournament_stages
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─── tournament_matches ──────────────────────────────────────

CREATE TABLE tournament_matches (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid        NOT NULL REFERENCES tenants(id),
  tournament_id          uuid        NOT NULL REFERENCES tournaments(id),
  stage_id               uuid        NOT NULL REFERENCES tournament_stages(id),

  -- Fecha (liga) o ronda (llaves). Siempre >= 1.
  round                  integer     NOT NULL,
  -- Zona, cuando la fase es de grupos.
  group_label            text,
  -- Posición dentro de la ronda, para dibujar el cuadro de arriba hacia abajo.
  bracket_slot           integer,

  -- NULL mientras no se sepa quién juega (llave sin resolver).
  home_team_id           uuid        REFERENCES tournament_teams(id),
  away_team_id           uuid        REFERENCES tournament_teams(id),
  -- Avance automático: de qué partido sale cada participante.
  home_source_match_id   uuid        REFERENCES tournament_matches(id),
  away_source_match_id   uuid        REFERENCES tournament_matches(id),
  -- Los source apuntan a las semis pero se leen como PERDEDOR.
  is_third_place         boolean     NOT NULL DEFAULT false,

  -- Agendado. booking_id es la hora del torneo que CONTIENE al partido.
  court_id               uuid        REFERENCES courts(id),
  booking_id             uuid        REFERENCES bookings(id) ON DELETE SET NULL,
  starts_at              timestamptz,
  ends_at                timestamptz,

  status                 tournament_match_status NOT NULL DEFAULT 'scheduled',
  home_score             smallint,
  away_score             smallint,
  played_at              timestamptz,
  notes                  text,

  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_match_round_positive CHECK (round >= 1),
  -- Un equipo no juega contra sí mismo.
  CONSTRAINT chk_match_teams_distinct CHECK (
    home_team_id IS NULL OR away_team_id IS NULL OR home_team_id <> away_team_id
  ),
  -- Un partido no se alimenta de sí mismo.
  CONSTRAINT chk_match_source_not_self CHECK (
    (home_source_match_id IS NULL OR home_source_match_id <> id) AND
    (away_source_match_id IS NULL OR away_source_match_id <> id)
  ),
  -- Un lado no puede tener DOS orígenes a la vez. Que tenga cero es válido:
  -- es una llave todavía sin resolver.
  CONSTRAINT chk_match_home_origin CHECK (
    home_team_id IS NULL OR home_source_match_id IS NULL
  ),
  CONSTRAINT chk_match_away_origin CHECK (
    away_team_id IS NULL OR away_source_match_id IS NULL
  ),
  -- El resultado va entero o no va: nunca medio cargado.
  CONSTRAINT chk_match_score_pair CHECK ((home_score IS NULL) = (away_score IS NULL)),
  CONSTRAINT chk_match_score_nonneg CHECK (
    (home_score IS NULL OR home_score >= 0) AND (away_score IS NULL OR away_score >= 0)
  ),
  -- Un partido jugado tiene resultado.
  CONSTRAINT chk_match_played_has_score CHECK (
    status <> 'played' OR (home_score IS NOT NULL AND away_score IS NOT NULL)
  ),
  -- Agendado: o está completo o no está.
  CONSTRAINT chk_match_schedule_pair CHECK ((starts_at IS NULL) = (ends_at IS NULL)),
  CONSTRAINT chk_match_schedule_order CHECK (starts_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX idx_tournament_matches_tournament ON tournament_matches(tournament_id, round);
CREATE INDEX idx_tournament_matches_stage      ON tournament_matches(stage_id, round, bracket_slot);
CREATE INDEX idx_tournament_matches_tenant     ON tournament_matches(tenant_id);
CREATE INDEX idx_tournament_matches_booking    ON tournament_matches(booking_id)
  WHERE booking_id IS NOT NULL;
CREATE INDEX idx_tournament_matches_starts     ON tournament_matches(tenant_id, starts_at)
  WHERE starts_at IS NOT NULL;
CREATE INDEX idx_tournament_matches_home_team  ON tournament_matches(home_team_id)
  WHERE home_team_id IS NOT NULL;
CREATE INDEX idx_tournament_matches_away_team  ON tournament_matches(away_team_id)
  WHERE away_team_id IS NOT NULL;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON tournament_matches
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─── RLS (patrón 006/014 + FORCE 021/036, initplan-wrapped 052) ──

ALTER TABLE tournament_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_stages FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tournament_stages' AND policyname = 'tournament_stages_select'
  ) THEN
    CREATE POLICY tournament_stages_select ON tournament_stages
      FOR SELECT
      USING (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tournament_stages' AND policyname = 'tournament_stages_insert'
  ) THEN
    CREATE POLICY tournament_stages_insert ON tournament_stages
      FOR INSERT
      WITH CHECK (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tournament_stages' AND policyname = 'tournament_stages_update'
  ) THEN
    CREATE POLICY tournament_stages_update ON tournament_stages
      FOR UPDATE
      USING (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid))
      WITH CHECK (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid));
  END IF;
END $$;

-- Con DELETE: regenerar el fixture borra las fases anteriores.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tournament_stages' AND policyname = 'tournament_stages_delete'
  ) THEN
    CREATE POLICY tournament_stages_delete ON tournament_stages
      FOR DELETE
      USING (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid));
  END IF;
END $$;

ALTER TABLE tournament_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_matches FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tournament_matches' AND policyname = 'tournament_matches_select'
  ) THEN
    CREATE POLICY tournament_matches_select ON tournament_matches
      FOR SELECT
      USING (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tournament_matches' AND policyname = 'tournament_matches_insert'
  ) THEN
    CREATE POLICY tournament_matches_insert ON tournament_matches
      FOR INSERT
      WITH CHECK (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tournament_matches' AND policyname = 'tournament_matches_update'
  ) THEN
    CREATE POLICY tournament_matches_update ON tournament_matches
      FOR UPDATE
      USING (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid))
      WITH CHECK (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tournament_matches' AND policyname = 'tournament_matches_delete'
  ) THEN
    CREATE POLICY tournament_matches_delete ON tournament_matches
      FOR DELETE
      USING (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid));
  END IF;
END $$;

-- ─── Grants / revokes ────────────────────────────────────────
-- Los DEFAULT PRIVILEGES de 037/038 ya dan CRUD a turnogol_app y
-- turnogol_worker. Ambas tablas lo conservan entero: regenerar el fixture
-- borra y recrea, y cargar un resultado actualiza.
