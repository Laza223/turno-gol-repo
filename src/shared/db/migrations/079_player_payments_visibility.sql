-- ============================================================
-- 079_player_payments_visibility.sql
--
-- El jugador tiene que poder ver el estado de la devolución de SU seña en
-- /mis-reservas.
--
-- Por qué hace falta una policy y no alcanza con lo que hay: `withPlayerContext`
-- (client.ts) setea ÚNICAMENTE `app.current_player_id`, y `payments` solo tiene
-- las cuatro policies `tenant_isolation_*` de la migración 006, todas contra
-- `app.current_tenant_id`. Bajo contexto de jugador ninguna matchea y la tabla
-- se ve vacía.
--
-- Por qué el dato importa: `bookings.deposit_status='refunded'` se escribe en la
-- misma transacción en que se cancela, ANTES de que la plata se mueva, y el
-- trigger `enforce_booking_invariants_fn` (migr. 070) congela la fila apenas el
-- turno pasa a un estado terminal. O sea que `bookings` no puede decir si la
-- devolución ocurrió: eso vive en la fila `payments` con `type='refund'`. Sin
-- esta policy el jugador no tiene forma de saber si le devolvieron o no.
--
-- Simétrica exacta de `player_own_bookings_select` (006). Permisiva y keyed por
-- `player_id`: bajo contexto de STAFF, `app.current_player_id` no está seteado
-- -> NULL -> no agrega ni una fila; bajo contexto de JUGADOR,
-- `app.current_tenant_id` no está seteado -> la policy de tenant no agrega nada.
-- No hay camino nuevo hacia los datos de otro jugador ni de otro complejo.
--
-- SELECT únicamente: el jugador nunca escribe en `payments`.
--
-- `current_setting` envuelto en un subselect = convención de la migración 052
-- (evita reevaluarlo por fila).
-- ============================================================

CREATE POLICY player_own_payments_select ON public.payments FOR SELECT
  USING ((player_id = (SELECT (NULLIF(current_setting('app.current_player_id'::text, true), ''::text))::uuid)));

COMMENT ON COLUMN public.payments.processed_at IS
  'Instante en que el dinero se movio de verdad. En type=refund: cuando se '
  'devolvio la sena — lo escribe settleRefund (cuando MercadoPago aprueba), el '
  'webhook de refund externo, o el complejo al tildar la devolucion a mano.';
