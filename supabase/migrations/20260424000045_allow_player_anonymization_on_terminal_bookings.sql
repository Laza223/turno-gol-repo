-- ============================================================
-- 045_allow_player_anonymization_on_terminal_bookings.sql
-- ENS-27: anonymizePlayer() (Ley 25.326, derecho de supresión) aborta si el
-- jugador tiene AUNQUE SEA UN booking en estado terminal.
--
-- Causa: enforce_booking_invariants_fn (definida en 005_triggers.sql,
-- reemplazada por última vez en 030_no_show_24h_correction.sql) bloquea
-- CUALQUIER UPDATE sobre un booking con OLD.status terminal (completed,
-- no_show, expired, canceled_refunded, canceled_no_refund), con la única
-- excepción de la corrección completed→no_show dentro de 24h (P5).
-- player.anonymization.ts:76-79 hace
--   UPDATE bookings SET player_id = NULL, updated_at = NOW() WHERE player_id = ...
-- sin filtrar por status (a propósito: filtrar dejaría el historial del
-- jugador SIN anonimizar en los complejos donde jugó, violando ARCO). Esa
-- UPDATE cae en el bloqueo de Regla 1 apenas hay un booking terminal, y al
-- estar dentro de la misma transacción que el resto de anonymizePlayer, todo
-- el borrado de cuenta aborta en silencio. Repro: tests/e2e/player-delete-account.spec.ts.
--
-- Fix: agregar una segunda excepción quirúrgica a Regla 1 — permitir el
-- UPDATE sobre un booking terminal SOLO si lo ÚNICO que cambia es
-- player_id (pasando a NULL). Se excluye updated_at de la comparación
-- porque hay un trigger BEFORE UPDATE independiente (trigger_set_updated_at,
-- 005_triggers.sql) que lo pisa en cada UPDATE de la tabla, y la propia
-- query de anonymizePlayer lo setea a NOW() explícitamente — no es señal de
-- que se esté modificando "otra cosa". price_snapshot sigue protegido por
-- Regla 2 de forma incondicional (se evalúa ANTES de esta excepción y no la
-- conoce), y cualquier otra columna (time_start, time_end, court_id, status,
-- deposit_*, payment_*, etc.) sigue bloqueada: si difiere de OLD, la
-- comparación de to_jsonb() no calza y cae al RAISE EXCEPTION general.
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_booking_invariants_fn()
RETURNS TRIGGER AS $$
DECLARE
  v_old_stripped JSONB;
  v_new_stripped JSONB;
BEGIN
  -- Regla 2: price_snapshot es inmutable SIEMPRE (incluso en la corrección
  -- de 24h y en la anonimización).
  IF NEW.price_snapshot IS DISTINCT FROM OLD.price_snapshot THEN
    RAISE EXCEPTION 'price_snapshot es inmutable (intento de modificar de % a %)',
      OLD.price_snapshot, NEW.price_snapshot
      USING ERRCODE = 'check_violation';
  END IF;

  -- Regla 1: si el booking ya está en estado terminal, bloquear cualquier UPDATE.
  IF OLD.status IN (
       'completed',
       'no_show',
       'expired',
       'canceled_refunded',
       'canceled_no_refund'
     )
  THEN
    -- Excepción P5: corrección de 24h completed → no_show.
    -- OLD.updated_at = timestamp de la completación (trigger_set_updated_at lo
    -- sella en cada UPDATE). Pasadas 24h la corrección queda bloqueada.
    IF OLD.status = 'completed'
       AND NEW.status = 'no_show'
       AND NOW() - OLD.updated_at < INTERVAL '24 hours'
    THEN
      RETURN NEW;
    END IF;

    -- Excepción ENS-27: anonimización ARCO (Ley 25.326). Único cambio
    -- permitido: player_id pasa a NULL. updated_at queda afuera de la
    -- comparación (ver nota arriba); cualquier otra columna debe coincidir
    -- byte a byte con OLD o la excepción no aplica.
    v_old_stripped := to_jsonb(OLD) - 'player_id' - 'updated_at';
    v_new_stripped := to_jsonb(NEW) - 'player_id' - 'updated_at';

    IF NEW.player_id IS NULL AND v_new_stripped = v_old_stripped THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Booking en estado terminal (%) no puede modificarse', OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION enforce_booking_invariants_fn() IS
  'Fix #6 F2 + P5 + ENS-27: bloquea UPDATE sobre bookings en estado terminal y '
  'mantiene price_snapshot inmutable. Excepciones: (1) corrección '
  'completed→no_show dentro de las 24h posteriores a updated_at (la app '
  'limita el actor a admin); (2) anonimización ARCO (Ley 25.326) — el UPDATE '
  'de anonymizePlayer() que solo pasa player_id a NULL, sin tocar ninguna '
  'otra columna (updated_at excluido de la comparación porque otro trigger '
  'BEFORE lo pisa de forma automática en cada UPDATE de la tabla).';
