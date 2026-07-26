-- ============================================================================
-- 065_tournament_results.sql
-- Módulo Torneos, fase 3: resultados, acta del partido y disciplina.
-- Decisión: docs/decisions/2026-07-24-torneos.md
--
-- UNA sola tabla nueva (tournament_match_events, el acta) + columnas sobre
-- tournament_matches. Todo lo derivado -tabla de posiciones, goleadores, fair
-- play, suspensiones- se calcula al leer con un motor puro de TS
-- (src/modules/tournaments/standings/), hermano del motor de fixture.
--
-- Por qué NO se materializa la tabla de posiciones: US-TOR-005 pide que un gol
-- cargado por error se pueda borrar. Con contadores materializados eso obliga a
-- invalidar y recalcular en cada borrado, que es justo la clase de
-- desincronización que el modelo derivado no puede tener. El volumen real de un
-- torneo (45-380 partidos) no justifica el cache.
--
-- Reglas del acta:
--   * INSERT o DELETE, nunca UPDATE (sin policy de UPDATE + REVOKE).
--   * Un evento cuenta si y solo si su partido está en estado final
--     (status IN ('played','walkover')). Borrar un resultado CONGELA el acta
--     sin borrarla; recargarlo la reactiva idéntica.
--   * El MARCADOR es el hecho; los goles-evento son la ATRIBUCIÓN. La tabla de
--     posiciones nunca deriva goles a favor/en contra de los eventos, así los
--     puntos y la diferencia de gol salen siempre de los mismos partidos.
-- ============================================================================

-- ─── Enum ────────────────────────────────────────────────────
-- Orden de labels espejado tal cual en src/shared/db/schema/enums.ts:
-- schema-drift.test.ts §3 los compara por enumsortorder.
CREATE TYPE tournament_event_type AS ENUM
  ('goal', 'own_goal', 'yellow_card', 'red_card');

-- ─── Claves candidatas para las FKs COMPUESTAS del acta ──────
-- Redundantes con las PK, pero Postgres exige un UNIQUE sobre las columnas
-- EXACTAS referenciadas. A cambio: el tournament_id denormalizado del evento es
-- indesincronizable, y "el goleador pertenece al equipo al que se le carga el
-- gol" pasa a ser garantía de la base y no un if del service.
ALTER TABLE tournament_matches
  ADD CONSTRAINT uq_tournament_matches_id_tournament UNIQUE (id, tournament_id);
ALTER TABLE tournament_teams
  ADD CONSTRAINT uq_tournament_teams_id_tournament UNIQUE (id, tournament_id);
ALTER TABLE tournament_team_players
  ADD CONSTRAINT uq_tournament_team_players_id_team UNIQUE (id, team_id);

-- ─── Columnas nuevas de tournament_matches ───────────────────
ALTER TABLE tournament_matches
  -- Definición por penales. NO suman a goles a favor/en contra: solo deciden
  -- quién pasa de ronda.
  ADD COLUMN home_penalties          smallint,
  ADD COLUMN away_penalties          smallint,
  -- Ganador de un walkover. NULL con status='walkover' = no se presentó
  -- NINGUNO (pierden los dos). El resultado de un walkover NUNCA se infiere del
  -- marcador: con walkover_goals_for = 0 (valor legal según la 062) un walkover
  -- sería un 0-0 y el motor lo leería como empate.
  ADD COLUMN walkover_winner_team_id uuid REFERENCES tournament_teams(id),
  -- De qué PUESTO de zona sale cada lado del cuadro de playoffs (1-based).
  -- La fase 2 generaba el bracket con placeholders '__q0__'... y los pisaba con
  -- NULL: el mapeo slot->clasificado se PERDÍA. Sin esto no hay forma de
  -- sembrar los playoffs desde la tabla de posiciones de las zonas.
  ADD COLUMN home_source_seed        smallint,
  ADD COLUMN away_source_seed        smallint;

-- Los CHECK de la 064 (home_team_id IS NULL OR home_source_match_id IS NULL)
-- hacen IMPOSIBLE el avance de llaves: para escribir el ganador en el partido
-- siguiente habría que NULLear el puntero, y con el cableado destruido corregir
-- el resultado de la semi ya no podría re-propagar a la final.
-- El invariante REAL es: un lado tiene UN SOLO mecanismo de alimentación
-- (partido anterior XOR puesto de zona). El *_team_id es el valor YA RESUELTO y
-- convive con su origen.
ALTER TABLE tournament_matches DROP CONSTRAINT IF EXISTS chk_match_home_origin;
ALTER TABLE tournament_matches DROP CONSTRAINT IF EXISTS chk_match_away_origin;

ALTER TABLE tournament_matches
  ADD CONSTRAINT chk_match_home_origin CHECK (
    home_source_match_id IS NULL OR home_source_seed IS NULL
  ),
  ADD CONSTRAINT chk_match_away_origin CHECK (
    away_source_match_id IS NULL OR away_source_seed IS NULL
  ),
  ADD CONSTRAINT chk_match_source_seed_positive CHECK (
    (home_source_seed IS NULL OR home_source_seed >= 1) AND
    (away_source_seed IS NULL OR away_source_seed >= 1)
  ),
  -- Un walkover también tiene marcador (el configurado en el torneo).
  ADD CONSTRAINT chk_match_walkover_has_score CHECK (
    status <> 'walkover' OR (home_score IS NOT NULL AND away_score IS NOT NULL)
  ),
  -- El ganador de un walkover es uno de los dos, y solo existe en walkover.
  ADD CONSTRAINT chk_match_walkover_winner CHECK (
    walkover_winner_team_id IS NULL
    OR (status = 'walkover'
        AND (walkover_winner_team_id = home_team_id
             OR walkover_winner_team_id = away_team_id))
  ),
  ADD CONSTRAINT chk_match_penalties_pair CHECK (
    (home_penalties IS NULL) = (away_penalties IS NULL)
  ),
  ADD CONSTRAINT chk_match_penalties_nonneg CHECK (
    home_penalties IS NULL OR (home_penalties >= 0 AND away_penalties >= 0)
  ),
  -- Los penales solo existen sobre un empate JUGADO. El `home_score IS NOT
  -- NULL` explícito es lo que hace que unos penales huérfanos sobre un partido
  -- sin marcador sean RECHAZADOS: sin él la expresión daría NULL, y un CHECK
  -- que evalúa NULL pasa.
  ADD CONSTRAINT chk_match_penalties_on_draw CHECK (
    home_penalties IS NULL
    OR (status = 'played' AND home_score IS NOT NULL AND home_score = away_score)
  ),
  -- Una tanda de penales no termina empatada.
  ADD CONSTRAINT chk_match_penalties_distinct CHECK (
    home_penalties IS NULL OR home_penalties <> away_penalties
  );

-- ─── tournament_match_events (el acta) ───────────────────────

CREATE TABLE tournament_match_events (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid        NOT NULL REFERENCES tenants(id),
  -- Denormalizado: el wipe de retención y el filtro barato "todos los eventos
  -- del torneo" lo usan. NO lleva FK simple a tournaments: la compuesta de
  -- abajo ya lo implica y además ata el torneo al del partido.
  tournament_id      uuid        NOT NULL,
  match_id           uuid        NOT NULL,
  -- Equipo del AUTOR. En own_goal el gol suma al RIVAL: esa asimetría vive en
  -- una función del motor (scoringTeamId), no en el schema.
  team_id            uuid        NOT NULL,
  -- NULL = gol sin autor identificado (pasa todo el tiempo en amateur).
  -- Las tarjetas SÍ exigen autor: una suspensión necesita sujeto.
  team_player_id     uuid,
  type               tournament_event_type NOT NULL,
  minute             smallint,
  -- Override del tribunal sobre red_card_suspension_matches para ESTA roja
  -- (0 = indulto). Es una columna y no una tabla de sanciones: así la
  -- disciplina sigue siendo función pura de los eventos.
  suspension_matches smallint,
  notes              text,
  created_by_staff   uuid        REFERENCES staff_users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- SIN updated_at ni trigger set_updated_at: la fila no se edita nunca.

  -- El tournament_id del evento es, por construcción, el del partido...
  CONSTRAINT fk_event_match
    FOREIGN KEY (match_id, tournament_id)
    REFERENCES tournament_matches(id, tournament_id),
  -- ...y el del equipo.
  CONSTRAINT fk_event_team
    FOREIGN KEY (team_id, tournament_id)
    REFERENCES tournament_teams(id, tournament_id),
  -- El autor pertenece al equipo al que se le carga el evento. MATCH SIMPLE
  -- (default): con team_player_id NULL la FK no se chequea, que es lo buscado.
  CONSTRAINT fk_event_player
    FOREIGN KEY (team_player_id, team_id)
    REFERENCES tournament_team_players(id, team_id),

  CONSTRAINT chk_event_minute CHECK (minute IS NULL OR minute BETWEEN 0 AND 200),
  CONSTRAINT chk_event_card_needs_player CHECK (
    type IN ('goal', 'own_goal') OR team_player_id IS NOT NULL
  ),
  CONSTRAINT chk_event_suspension_only_red CHECK (
    suspension_matches IS NULL OR type = 'red_card'
  ),
  CONSTRAINT chk_event_suspension_range CHECK (
    suspension_matches IS NULL OR suspension_matches BETWEEN 0 AND 20
  )
);

-- ─── Índices ─────────────────────────────────────────────────
-- D3-H1: NINGÚN índice de expresión. Todos sobre columnas planas; los parciales
-- llevan el predicado en pg_index.indpred, que no es una expresión indexada.
-- El lower(full_name) del ORDER BY de goleadores es de QUERY, no de índice
-- (lección de la 062 -> 063).

CREATE INDEX idx_tournament_match_events_tenant
  ON tournament_match_events(tenant_id);
-- El acta de un partido.
CREATE INDEX idx_tournament_match_events_match
  ON tournament_match_events(match_id);
-- Goleadores / fair play / disciplina: siempre filtran por torneo + tipo.
CREATE INDEX idx_tournament_match_events_tournament
  ON tournament_match_events(tournament_id, type);
-- Lado hijo de las FK compuestas: sin esto, borrar un equipo o un plantel hace
-- Seq Scan del acta.
CREATE INDEX idx_tournament_match_events_team
  ON tournament_match_events(team_id);
CREATE INDEX idx_tournament_match_events_player
  ON tournament_match_events(team_player_id)
  WHERE team_player_id IS NOT NULL;

-- En fútbol la 2da amarilla del partido ES una roja: cargarla como segunda
-- amarilla la contaría dos veces en el acumulado. El service traduce el 23505 a
-- DuplicateCardError.
CREATE UNIQUE INDEX uq_tournament_match_events_one_yellow
  ON tournament_match_events(match_id, team_player_id)
  WHERE type = 'yellow_card';
CREATE UNIQUE INDEX uq_tournament_match_events_one_red
  ON tournament_match_events(match_id, team_player_id)
  WHERE type = 'red_card';

-- ─── RLS (patrón 064 = 006/014 + FORCE 021/036, initplan-wrapped 052) ──

ALTER TABLE tournament_match_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_match_events FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tournament_match_events'
      AND policyname = 'tournament_match_events_select'
  ) THEN
    CREATE POLICY tournament_match_events_select ON tournament_match_events
      FOR SELECT
      USING (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tournament_match_events'
      AND policyname = 'tournament_match_events_insert'
  ) THEN
    CREATE POLICY tournament_match_events_insert ON tournament_match_events
      FOR INSERT
      WITH CHECK (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid));
  END IF;
END $$;

-- Con DELETE: el criterio de aceptación "un gol cargado por error se puede
-- borrar" pasa por acá, y el wipe de retención también.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tournament_match_events'
      AND policyname = 'tournament_match_events_delete'
  ) THEN
    CREATE POLICY tournament_match_events_delete ON tournament_match_events
      FOR DELETE
      USING (tenant_id = (SELECT (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid));
  END IF;
END $$;

-- SIN policy de UPDATE: el acta es append-only / delete-only. Corregir un
-- evento es borrarlo y cargarlo de nuevo, y eso deja DOS filas en audit_logs.

-- ─── Grants / revokes ────────────────────────────────────────
-- Los DEFAULT PRIVILEGES de 037/038 ya dan CRUD a turnogol_app y
-- turnogol_worker. Se revoca UPDATE al rol de la app como defensa en
-- profundidad sobre la ausencia de policy.
REVOKE UPDATE ON tournament_match_events FROM turnogol_app;
