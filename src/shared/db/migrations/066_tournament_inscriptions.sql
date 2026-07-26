-- ============================================================
-- 066_tournament_inscriptions.sql
-- Módulo Torneos, fase 4: la plata de la inscripción entra por Caja.
-- Decisión: docs/decisions/2026-07-24-torneos.md
--
-- Las horas que ocupa el torneo son reservas en $0 a propósito (fase 1): el
-- ingreso del torneo se cobra UNA vez, por inscripción, y no se le atribuye a
-- la cancha. Hasta ahora ese cobro no tenía dónde caer y el complejo lo tenía
-- que anotar como "Otro ingreso", que lo mezcla con todo lo demás.
--
-- Tres cambios:
--   * cashflow_category += 'tournament'  — el ingreso deja de ser "otro".
--   * cash_flows.tournament_team_id      — a QUÉ equipo corresponde el pago.
--   * tournament_teams.inscription_fee   — cuánto le toca pagar A ESE equipo.
--
-- El puntero al equipo es lo que hace que "cuánto debe este equipo" sea una
-- suma y no un contador aparte que se pueda desincronizar: mismo criterio que
-- la tabla de posiciones de la fase 3. Y como cash_flows no se borra nunca,
-- un pago registrado no se puede deshacer — es plata que entró.
--
-- Pagos parciales salen gratis: N filas contra el mismo equipo. Es lo normal
-- en un torneo amateur (seña el sábado, resto en la primera fecha).
--
-- NO se agrega tabla nueva. Es la única fase del módulo que no paga el costo
-- fijo de una tabla tenant-aislada.
-- ============================================================

-- ─── Arancel por equipo ──────────────────────────────────────

-- SNAPSHOT, no lectura en vivo de tournaments.inscription_fee: si el complejo
-- sube el arancel a mitad de la inscripción, los equipos que ya pagaron
-- completo pasarían a figurar en deuda sin que nadie los haya tocado. Mismo
-- criterio que bookings.price_snapshot y abonados.price_per_session.
--
-- De paso resuelve gratis algo que en un torneo amateur pasa siempre: el
-- descuento al equipo que trae a otros dos. El arancel es POR EQUIPO.
ALTER TABLE tournament_teams
  ADD COLUMN inscription_fee integer NOT NULL DEFAULT 0;

ALTER TABLE tournament_teams ADD CONSTRAINT chk_team_inscription_fee_nonneg
  CHECK (inscription_fee >= 0);

-- Los equipos ya inscriptos heredan el arancel de su torneo. Hoy es no-op (el
-- flag nace global en false y el módulo nunca se habilitó), pero un complejo
-- piloto ya podría tener equipos cargados.
UPDATE tournament_teams t
   SET inscription_fee = tr.inscription_fee
  FROM tournaments tr
 WHERE tr.id = t.tournament_id
   AND tr.inscription_fee > 0;

-- ─── Categoría nueva ─────────────────────────────────────────

-- El valor nuevo del enum NO puede usarse como literal en esta misma
-- transacción (55P04): todo lo que lo compare va por ::text. Mismo workaround
-- que 025 y 050.
ALTER TYPE cashflow_category ADD VALUE IF NOT EXISTS 'tournament';

-- ─── cash_flows.tournament_team_id ───────────────────────────

-- Nullable: la enorme mayoría de los movimientos no son de torneo. Sin
-- ON DELETE: borrar un equipo que ya pagó tiene que fallar, no arrastrarse la
-- plata ni dejarla huérfana (el service lo frena antes con un error propio).
ALTER TABLE cash_flows
  ADD COLUMN tournament_team_id uuid REFERENCES tournament_teams(id);

-- Parcial, igual que idx_bookings_tournament: el índice solo cubre las filas
-- de torneo, que son una minoría de la tabla más caliente de Caja. El
-- predicado es un NullTest, no una llamada a función: no toca el invariante
-- D3-H1 (índices de expresión inusables bajo RLS, ver 054 y schema-drift §4).
CREATE INDEX idx_cash_flows_tournament_team ON cash_flows(tournament_team_id)
  WHERE tournament_team_id IS NOT NULL;

-- ─── CHECKs ──────────────────────────────────────────────────

-- Se recrea el de 050 sumando income+tournament. 'operating_expense' sigue
-- adentro por lo mismo de siempre: valida las filas históricas.
ALTER TABLE cash_flows DROP CONSTRAINT chk_cashflow_type_category;
ALTER TABLE cash_flows ADD CONSTRAINT chk_cashflow_type_category CHECK (
  (type::text = 'income' AND category::text IN ('booking', 'product_sale', 'other', 'tournament'))
  OR (type::text = 'adjustment' AND category::text IN ('other', 'no_show_correction'))
  OR (type::text = 'expense' AND category::text IN
      ('operating_expense', 'merchandise', 'salaries', 'utilities', 'maintenance', 'other_expense'))
);

-- Bidireccional a propósito: categoría 'tournament' ⟺ hay equipo.
--
--   → Sin la ida, un ingreso de torneo podría quedar sin equipo y "cuánto
--     pagó cada uno" dejaría de sumar el total de la categoría.
--   → Sin la vuelta, el formulario genérico de Caja podría colgarle un equipo
--     a un movimiento cualquiera.
--
-- Es el mismo criterio con el que la Server Action genérica de Caja no acepta
-- bookingId (R4): la plata ligada a algo tiene un solo camino de entrada.
ALTER TABLE cash_flows ADD CONSTRAINT chk_cashflow_tournament_team CHECK (
  (category::text = 'tournament') = (tournament_team_id IS NOT NULL)
);
