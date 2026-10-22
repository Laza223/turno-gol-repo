# Decisión: penalidad por cancelación tardía (complejos sin seña)

**Fecha:** 2026-10-21 · **Decide:** Lazar (founder) · **Insumo:** demo del bot de WhatsApp ([`10-aprendizajes.md`](../gtm/ejecucion/10-aprendizajes.md), 2026-10-21).

**Excepción de D4** de [`2026-09-02-experimento-30-dias.md`](2026-09-02-experimento-30-dias.md): sale de fricción observada en una demo y la decide el dueño. Se registra antes de programar.

## Problema

`settings.cancellation_policy.hours_before` solo decide si se devuelve una seña pagada (`booking.cancellation.ts`). En un complejo **sin seña** cancelar a último momento no tiene ninguna consecuencia. La pantalla de Configuración → Reservas, además, mostraba la devolución de la seña y "Si el jugador falta… la seña queda para el complejo" aunque no haya seña.

## Decisiones

1. **Setting** `settings.late_cancel_hours`, primer nivel de settings, entero 0–24. **0 = apagado, y 0 es el default.** Va fuera de `cancellation_policy` para que el merge superficial de esa clave no lo pise.
2. **Cuándo aplica:** solo si la reserva tenía `deposit_status = 'not_required'` (se evalúa sobre la reserva, no sobre el setting de seña de hoy) y `late_cancel_hours > 0`. Es tarde si `ahora >= starts_at - late_cancel_hours`.
3. **Escalera**, en el mismo complejo, contando las cancelaciones tardías de los últimos **60 días**:
   - 1ra: solo aviso.
   - 2da: 7 días sin reservar online.
   - 3ra en adelante: 30 días, que es el tope.
   - A los 60 días sin cancelar tarde el contador vuelve a cero. El dueño puede levantar el bloqueo cuando quiera (Jugadores).
4. **Quién cuenta:** el jugador desde `/mis-reservas` (`cancelByPlayer`) y el staff con tipo `'jugador'` ("a pedido del jugador", `cancelByAdmin`). Con `'complejo'` nunca cuenta.
5. **Datos:** `bookings.canceled_late boolean NOT NULL DEFAULT false` + índice parcial. No hay tabla nueva: el contador sale de los propios bookings.
6. **Bloqueo:** reusa `tenant_player_bans` vía `extendSoftban`, con un reason propio ("Cancelaciones tardías"). Es el mismo gate que ya chequea la reserva online. `revertNoShowStrike` filtra por el reason exacto de las ausencias, así que no lo toca.
7. **Avisos:** al jugador en el diálogo de cancelar y en el checkout; al staff en el diálogo de cancelar "a pedido del jugador", antes de confirmar.

8. **Con seña, la penalidad se apaga:** al guardar Configuración → Reservas con `requires_deposit`, `late_cancel_hours` se fuerza a 0 (la escalera es solo para complejos sin seña).
9. **Abonados no cuentan:** una reserva con `abonado_id` (turno fijo) nunca marca `canceled_late`. En la UI del jugador se pasa `lateCancelHours: 0` si `type='fixed'`. Los diálogos del staff no conocen el abonado, así que el texto puede avisar de más para un turno fijo; el backend no cuenta.
10. **Levantar el bloqueo reinicia el conteo:** `liftPlayerBan` de un ban con reason de tardías guarda `tenant_player_bans.late_cancel_reset_at = NOW()` y el conteo solo cuenta cancelaciones posteriores. No se resetea `canceled_late`: el trigger de 089 prohíbe todo UPDATE sobre una reserva terminal. La próxima tardía vuelve a ser solo aviso. Levantar un ban por ausencias no toca el conteo.

## Imprecisión aceptada

Hay una sola fila de `tenant_player_bans` por (jugador, complejo) y conserva el reason con que nació al extenderse. Si se mezclan un ban por ausencias y uno por tardías, `revertNoShowStrike` y el reinicio de tardías pueden equivocarse en dos casos raros. Se acepta y se documenta; no se agrega un segundo mecanismo.

## Racional

En apps de reservas se avisa la primera vez, se escala en días y el contador se limpia solo. 90 días de bloqueo le hacen perder un cliente semanal al complejo, por eso el tope es 30.

## No cambia

Las **ausencias** (no-show): 2 faltas en 90 días = 14 días de bloqueo. Es otro mecanismo, con su propio contador en `player_tenant_relationships`.

## Fuera de alcance de este cambio

Que el bot de WhatsApp cancele (invitados sin `player_id`, penalidad por teléfono): PR aparte, después de este.
