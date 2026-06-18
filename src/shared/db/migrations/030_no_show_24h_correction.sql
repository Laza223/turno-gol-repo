-- ============================================================
-- 030_no_show_24h_correction.sql
-- P5: corrección de 24h completed → no_show.
--
-- doc6 §3 admite que un admin corrija un turno mal marcado como completado y lo
-- pase a no_show, siempre que lo haga dentro de las 24h posteriores a la
-- completación. Hasta ahora enforce_booking_invariants_fn bloqueaba TODO UPDATE
-- post-terminal; acá agregamos la única excepción.
--
-- Defensa en profundidad: la state machine (booking.state-machine.ts) y
-- markNoShow gobiernan el actor (sólo admin) y la ventana de 24h a nivel app;
-- este trigger es el backstop a nivel DB. La inmutabilidad de price_snapshot y
-- del resto de estados terminales se mantiene intacta.
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_booking_invariants_fn()
RETURNS TRIGGER AS $$
BEGIN
  -- Regla 2: price_snapshot es inmutable SIEMPRE (incluso en la corrección).
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

    RAISE EXCEPTION 'Booking en estado terminal (%) no puede modificarse', OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION enforce_booking_invariants_fn() IS
  'Fix #6 F2 + P5: bloquea UPDATE sobre bookings en estado terminal y mantiene '
  'price_snapshot inmutable. Excepción: corrección completed→no_show dentro de '
  'las 24h posteriores a updated_at (la app limita el actor a admin).';
