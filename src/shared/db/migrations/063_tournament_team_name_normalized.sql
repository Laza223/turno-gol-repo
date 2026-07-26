-- ============================================================================
-- 063 — tournament_teams: unicidad case-insensitive sin índice de expresión.
--
-- La 062 creó uq_tournament_teams_name como índice de EXPRESIÓN sobre
-- (tournament_id, lower(trim(name))) para que "Los Pibes" y "los pibes" no
-- convivan en el mismo torneo. Eso viola el invariante D3-H1, que
-- tests/integration/schema-drift.test.ts §4 verifica y que dejó el CI en rojo:
--
--   tournament_teams.uq_tournament_teams_name: expr="lower(TRIM(BOTH FROM name))"
--   usa función(es) no-leakproof [lower] — inusable bajo RLS (D3-H1)
--
-- Por qué importa: Postgres se niega a evaluar quals no-leakproof debajo de la
-- barrera de seguridad de las policies, así que sobre una tabla con RLS un
-- índice de expresión de ese tipo nunca entra como Index Cond y la query cae a
-- Seq Scan silencioso. Es exactamente el hallazgo D3 que llevó a dropear
-- idx_cash_flows_tenant_day_art e idx_stock_movements_tenant_day_art en la 054
-- (ahí el culpable era timezone(); acá es lower()).
--
-- Fix: mover la normalización a una COLUMNA GENERADA. El índice pasa a ser
-- sobre columnas planas — sale del scan del invariante y además queda usable
-- por el planner bajo RLS, que es el punto real de D3-H1. La garantía de
-- unicidad case-insensitive la sigue dando la base, no el service: dos
-- encargados cargando el mismo equipo a la vez no pueden duplicarlo.
--
-- lower() y trim() son IMMUTABLE, que es lo único que Postgres exige para la
-- expresión de una columna generada; el requisito de LEAKPROOF aplica a quals
-- evaluados bajo RLS, no al cómputo de una columna almacenada.
--
-- Primera columna generada del repo.
-- ============================================================================

DROP INDEX IF EXISTS uq_tournament_teams_name;

-- STORED (Postgres 15 no soporta VIRTUAL). NOT NULL es satisfacible siempre:
-- name es NOT NULL y lower(trim(...)) de un no-nulo nunca es nulo.
ALTER TABLE tournament_teams
  ADD COLUMN name_normalized text
    GENERATED ALWAYS AS (lower(trim(name))) STORED NOT NULL;

CREATE UNIQUE INDEX uq_tournament_teams_name
  ON tournament_teams(tournament_id, name_normalized);
