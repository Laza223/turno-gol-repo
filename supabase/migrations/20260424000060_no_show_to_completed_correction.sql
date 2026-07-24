-- ============================================================
-- 060_no_show_to_completed_correction.sql
-- RI #1 de la fase D4 (decisión del dueño 2026-07-24): implementar la
-- transición INVERSA no_show → completed que doc6 §3 especifica desde la
-- auditoría 2026-07-21 y se autodeclaraba "implementación de código
-- pendiente".
--
-- Simetría con la corrección P5 (030_no_show_24h_correction.sql): un admin que
-- marcó "No vino" por error puede revertirlo a completed dentro de las 24h
-- posteriores a la marca (OLD.updated_at). Pasada la ventana, el turno vuelve a
-- ser inmutable. La app (revertNoShow en booking.service.ts + la state machine)
-- gobierna el actor (sólo admin) y repite el chequeo de ventana; este trigger
-- es el backstop de DB.
--
-- Efectos de negocio que NO viven acá (los hace handleNoShowRevert, capa app):
-- revertir el strike de player_tenant_relationships y levantar el softban
-- auto-creado en tenant_player_bans. La seña ya capturada
-- (deposit_status='captured') NO se auto-reembolsa: se resuelve entre jugador y
-- complejo, igual que el resto de reembolsos manuales del sistema.
--
-- Ping-pong: cada corrección refresca updated_at, así que un admin podría
-- alternar completed↔no_show indefinidamente. Es la misma propiedad que ya
-- tenía la excepción P5 sola, queda auditada (audit_logs por cada corrección)
-- y el saldo de strikes es neutro (aplica/revierte en pares).
--
-- ⚠ GOTCHA de PostgreSQL: `CREATE OR REPLACE FUNCTION` reasigna TODAS las
-- propiedades de la función a lo que diga (o implique) el comando — incluido
-- `proconfig`. Sin repetir `SET search_path = 'public'` acá, esta migración
-- DESHARÍA en silencio el hardening de 056_function_hardening.sql (advisor
-- `function_search_path_mutable` de Supabase). Por eso la cláusula SET va
-- explícita en la definición, no en un ALTER aparte.
--
-- Cuerpo base: 045_allow_player_anonymization_on_terminal_bookings.sql (última
-- redefinición vigente); se le agrega UNA excepción y no se toca nada más
-- (Regla 2 de price_snapshot y excepción ENS-27 de anonimización ARCO quedan
-- idénticas).
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
  -- Regla 2: price_snapshot es inmutable SIEMPRE (incluso en las correcciones
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
    -- Excepción P5 (030): corrección de 24h completed → no_show.
    -- OLD.updated_at = timestamp de la completación (trigger_set_updated_at lo
    -- sella en cada UPDATE). Pasadas 24h la corrección queda bloqueada.
    IF OLD.status = 'completed'
       AND NEW.status = 'no_show'
       AND NOW() - OLD.updated_at < INTERVAL '24 hours'
    THEN
      RETURN NEW;
    END IF;

    -- Excepción RI #1 (esta migración): corrección INVERSA de 24h
    -- no_show → completed. OLD.updated_at = timestamp de la marca de ausencia.
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
  'Fix #6 F2 + P5 + ENS-27 + RI#1: bloquea UPDATE sobre bookings en estado '
  'terminal y mantiene price_snapshot inmutable. Excepciones: (1) corrección '
  'completed→no_show dentro de las 24h posteriores a updated_at; (2) corrección '
  'inversa no_show→completed dentro de la misma ventana (no-show marcado por '
  'error — la app revierte el strike y levanta el softban auto-creado, la seña '
  'capturada NO se auto-reembolsa); la app limita el actor a admin en ambas; '
  '(3) anonimización ARCO (Ley 25.326) — el UPDATE de anonymizePlayer() que '
  'solo pasa player_id a NULL, sin tocar ninguna otra columna (updated_at '
  'excluido de la comparación porque otro trigger BEFORE lo pisa de forma '
  'automática en cada UPDATE de la tabla).';
