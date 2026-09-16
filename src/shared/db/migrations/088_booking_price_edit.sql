-- ============================================================
-- 088_booking_price_edit.sql
-- D2 (docs/decisions/2026-09-15-evento-repetible-edicion-y-cobro-parcial.md):
-- editar una reserva desde la grilla (nombre/teléfono, precio, duración) sin
-- pasar por `rescheduleBooking` — el turno NO se mueve (mismo court_id, mismo
-- date/time_start siempre), así que la excepción de la migr. 070 (que exige
-- que `starts_at` o `court_id` cambien) no lo cubre.
--
-- Esta migración agrega UNA excepción más, deliberadamente angosta, a la
-- Regla 2 (price_snapshot inmutable):
--
--   price_snapshot puede cambiar TAMBIÉN si
--     (a) el booking está en 'confirmed' — nunca terminal ni pending_payment
--         (a diferencia de reprogramar, editar un turno que todavía espera su
--         seña no tiene sentido de producto: se edita después de confirmado), y
--     (b) la transacción marcó `app.booking_edit = 'on'` con `SET LOCAL`
--         (`editBooking`, booking.edit.ts, justo antes del UPDATE).
--
-- El marcador explícito (en vez de "cualquier UPDATE de un confirmed puede
-- tocar el precio") es la barrera: sin él, cualquier código que actualice una
-- fila `confirmed` por cualquier motivo podría pisar el precio en silencio.
-- Auditoría: `editBooking` escribe un audit_log 'booking.edited' con el precio
-- viejo y el nuevo, igual que 'booking.rescheduled' en la 070.
--
-- ⚠ GOTCHA de PostgreSQL (mismo que documentan 030/045/060/070): `CREATE OR
-- REPLACE FUNCTION` reasigna TODAS las propiedades de la función, incluido
-- `proconfig`. Sin repetir `SET search_path = 'public'` esta migración
-- DESHARÍA en silencio el hardening de 056_function_hardening.sql (advisor
-- `function_search_path_mutable` de Supabase).
--
-- Cuerpo base: 070_reschedule_price_recalc.sql (última redefinición vigente).
-- Se le agrega la excepción de arriba y NO se toca nada más.
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
  -- Regla 2: price_snapshot es inmutable SIEMPRE, con DOS excepciones:
  --   (1) Fase 3 — reprogramar un turno vivo a otro slot físico (otro
  --       court_id u otro starts_at) recalcula el precio de la franja destino.
  --   (2) D2 — editar un turno `confirmed` SIN moverlo, marcado
  --       explícitamente con `app.booking_edit = 'on'` (SET LOCAL).
  -- Ver el encabezado de esta migración y el de 070 para el detalle de cada una.
  IF NEW.price_snapshot IS DISTINCT FROM OLD.price_snapshot THEN
    IF NOT (
      (
        OLD.status IN ('confirmed', 'pending_payment')
        AND (
          NEW.starts_at IS DISTINCT FROM OLD.starts_at
          OR NEW.court_id IS DISTINCT FROM OLD.court_id
        )
      )
      OR (
        OLD.status = 'confirmed'
        -- `current_setting(..., true)` (missing_ok) devuelve NULL cuando el GUC
        -- nunca se seteó — y `NULL = 'on'` es NULL, no FALSE. Sin el COALESCE,
        -- `A OR NULL` da NULL (no FALSE) y `NOT NULL` TAMBIÉN da NULL: un `IF
        -- NULL THEN` de plpgsql NO ejecuta el RAISE, así que la excepción
        -- quedaba muda para CUALQUIER booking confirmed, con o sin marcador
        -- (agujero real, atrapado por el test de la migración antes de mergear).
        AND COALESCE(current_setting('app.booking_edit', true), 'off') = 'on'
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
  'Fix #6 F2 + P5 + ENS-27 + RI#1 + Fase 3 + D2: bloquea UPDATE sobre bookings '
  'en estado terminal y mantiene price_snapshot inmutable. price_snapshot '
  'admite DOS excepciones: (1) reprogramar (booking en confirmed/pending_payment '
  'que se mueve a otro court_id u otro starts_at) recalcula el precio de la '
  'franja destino, con audit_log booking.rescheduled como rastro; (2) editar '
  'un booking confirmed SIN moverlo, con la transacción marcada '
  'app.booking_edit=''on'' (SET LOCAL, editBooking/booking.edit.ts), con '
  'audit_log booking.edited como rastro. Excepciones de estado terminal: '
  '(1) corrección completed→no_show dentro de las 24h posteriores a '
  'updated_at; (2) corrección inversa no_show→completed dentro de la misma '
  'ventana (no-show marcado por error — la app revierte el strike y levanta '
  'el softban auto-creado, la seña capturada NO se auto-reembolsa); la app '
  'limita el actor a admin en ambas; (3) anonimización ARCO (Ley 25.326) — el '
  'UPDATE de anonymizePlayer() que solo pasa player_id a NULL, sin tocar '
  'ninguna otra columna (updated_at excluido de la comparación porque otro '
  'trigger BEFORE lo pisa de forma automática en cada UPDATE de la tabla).';
