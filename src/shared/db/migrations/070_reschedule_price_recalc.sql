-- ============================================================
-- 070_reschedule_price_recalc.sql
-- Fase 3 (contrato v2 §3, criterio de salida #2): el panel lateral de la grilla
-- puede REPROGRAMAR una reserva — moverla a otra cancha, otro día u otro
-- horario. Decisión de producto del dueño (2026-08-04): el precio se RECALCULA
-- a la franja destino, porque el precio pertenece a la franja horaria, no a la
-- reserva. Mover un turno de las 18:00 a las 21:00 tiene que cobrar lo que vale
-- la franja de las 21:00; congelar el precio original regalaría o sobrecobraría
-- turnos según a dónde se mueva, y ensuciaría los reportes de ingresos por
-- franja.
--
-- El obstáculo: la Regla 2 (price_snapshot inmutable, viva desde
-- 005_triggers.sql) corta ANTES de cualquier chequeo de estado y no admite
-- excepciones. Esta migración le agrega UNA, deliberadamente angosta:
--
--   price_snapshot puede cambiar sólo si
--     (a) el booking está en 'confirmed' o 'pending_payment'  — nunca terminal, y
--     (b) el slot FÍSICO efectivamente cambió: otro court_id u otro starts_at.
--
-- Fuera de esa combinación la invariante queda exactamente como estaba. En
-- particular sigue prohibido:
--   * tocar el precio de un booking terminal (completed/no_show/expired/canceled_*),
--   * tocar el precio "en el lugar", sin mover la reserva — que es el abuso que
--     la Regla 2 existe para impedir (reescribir a mano lo que ya se le cobró a
--     alguien; para eso está un CashFlow 'adjustment' nuevo, que deja rastro),
--   * tocar el precio en la transición pending_payment → confirmed (el pago de
--     la seña no puede alterar lo que vale el turno).
--
-- Auditoría: rescheduleBooking (capa app) escribe un audit_log
-- 'booking.rescheduled' con el precio viejo y el nuevo, así que un cambio de
-- precio habilitado por esta excepción siempre queda con su rastro.
--
-- ⚠ GOTCHA de PostgreSQL (mismo que documenta 060 y por el que se repite acá):
-- `CREATE OR REPLACE FUNCTION` reasigna TODAS las propiedades de la función,
-- incluido `proconfig`. Sin repetir `SET search_path = 'public'` esta migración
-- DESHARÍA en silencio el hardening de 056_function_hardening.sql (advisor
-- `function_search_path_mutable` de Supabase).
--
-- Cuerpo base: 060_no_show_to_completed_correction.sql (última redefinición
-- vigente). Se le agrega la excepción a la Regla 2 y NO se toca nada más: las
-- tres excepciones de estado terminal (P5 24h, RI#1 24h, ENS-27 anonimización
-- ARCO) quedan idénticas.
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_booking_invariants_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
DECLARE
  v_old_stripped JSONB;
  v_new_stripped JSONB;
BEGIN
  -- Regla 2: price_snapshot es inmutable SIEMPRE, con UNA excepción (Fase 3):
  -- reprogramar una reserva todavía viva a otro slot físico recalcula el precio
  -- de la franja destino. Ver el encabezado de esta migración para el detalle
  -- de por qué la excepción es tan angosta.
  IF NEW.price_snapshot IS DISTINCT FROM OLD.price_snapshot THEN
    IF NOT (
      OLD.status IN ('confirmed', 'pending_payment')
      AND (
        NEW.starts_at IS DISTINCT FROM OLD.starts_at
        OR NEW.court_id IS DISTINCT FROM OLD.court_id
      )
    ) THEN
      RAISE EXCEPTION 'price_snapshot es inmutable (intento de modificar de % a %)',
        OLD.price_snapshot, NEW.price_snapshot
        USING ERRCODE = 'check_violation';
    END IF;
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
    -- Excepción P5 (030): corrección de 24h completed → no_show.
    -- OLD.updated_at = timestamp de la completación (trigger_set_updated_at lo
    -- sella en cada UPDATE). Pasadas 24h la corrección queda bloqueada.
    IF OLD.status = 'completed'
       AND NEW.status = 'no_show'
       AND NOW() - OLD.updated_at < INTERVAL '24 hours'
    THEN
      RETURN NEW;
    END IF;

    -- Excepción RI #1 (060): corrección INVERSA de 24h no_show → completed.
    -- OLD.updated_at = timestamp de la marca de ausencia.
    IF OLD.status = 'no_show'
       AND NEW.status = 'completed'
       AND NOW() - OLD.updated_at < INTERVAL '24 hours'
    THEN
      RETURN NEW;
    END IF;

    -- Excepción ENS-27 (045): anonimización ARCO (Ley 25.326). Único cambio
    -- permitido: player_id pasa a NULL. updated_at queda afuera de la
    -- comparación (otro trigger BEFORE lo pisa en cada UPDATE de la tabla);
    -- cualquier otra columna debe coincidir byte a byte con OLD o la excepción
    -- no aplica.
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
$$;

COMMENT ON FUNCTION enforce_booking_invariants_fn() IS
  'Fix #6 F2 + P5 + ENS-27 + RI#1 + Fase 3: bloquea UPDATE sobre bookings en '
  'estado terminal y mantiene price_snapshot inmutable. price_snapshot admite '
  'una única excepción: reprogramar (booking en confirmed/pending_payment que '
  'se mueve a otro court_id u otro starts_at) recalcula el precio de la franja '
  'destino, con audit_log booking.rescheduled como rastro. Excepciones de '
  'estado terminal: (1) corrección completed→no_show dentro de las 24h '
  'posteriores a updated_at; (2) corrección inversa no_show→completed dentro de '
  'la misma ventana (no-show marcado por error — la app revierte el strike y '
  'levanta el softban auto-creado, la seña capturada NO se auto-reembolsa); la '
  'app limita el actor a admin en ambas; (3) anonimización ARCO (Ley 25.326) — '
  'el UPDATE de anonymizePlayer() que solo pasa player_id a NULL, sin tocar '
  'ninguna otra columna (updated_at excluido de la comparación porque otro '
  'trigger BEFORE lo pisa de forma automática en cada UPDATE de la tabla).';
