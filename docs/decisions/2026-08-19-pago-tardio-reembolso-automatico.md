# Pago tardío = reembolso automático

**Fecha:** 2026-08-19
**Decide:** Lazar (dueño)
**Estado:** decidida, sin implementar

## El caso

Un jugador abre el checkout, se le vence el hold de 6 minutos, la reserva pasa a `expired` y el slot
se libera. **Después** de eso el pago se acredita en MercadoPago. Hay plata cobrada y no hay turno.

Pasó dos veces en producción durante las corridas de cobro real del 18 y 19 de agosto de 2026
(bookings `a7a2dca3` y `5ece40d6`, $100 cada uno).

## Qué hace hoy el sistema

`handleApproved` (`payment.service.ts:530-560`) detecta que el booking está en un estado terminal,
escribe `booking.late_payment_attempt` en `audit_logs` y le manda al dueño el mail
`admin_late_payment` ("Se requiere acción manual para reembolsar o reasignar"). El turno **no** se
resucita: `expired` es terminal en la state machine (`booking.state-machine.ts:29`), en el guard de
concurrencia (`booking.concurrency.ts:38`, `WHERE status='pending_payment'`) y en el trigger
`enforce_booking_invariants_fn` de la migración 070. Los tres candados son deliberados.

## La decisión

**TurnoGol reembolsa solo y le avisa a las dos partes.** No espera acción humana y no resucita el
turno.

El razonamiento es que el jugador no puede quedar colgado esperando que alguien mire un mail. La
alternativa de reasignar a otro horario sigue disponible: si el complejo y el jugador se arreglan,
es una reserva nueva, no la resurrección de una vieja.

### Descartadas

- **Dejarlo como está (avisar y esperar acción humana).** Depende de que el dueño lea el mail y sepa
  qué hacer; mientras tanto el jugador pagó y no tiene nada.
- **Resucitar el turno si el slot sigue libre** (una excepción `expired → confirmed` acotada a 24 h).
  Toca el estado más crítico del sistema en tres capas a la vez y abre la pregunta de qué pasa
  cuando otro jugador ya tomó el slot — el exclusion constraint rechaza, y ahí hay que decidir otra
  vez. Se descarta el trade-off, no la implementación: **si aparece de nuevo como propuesta, se
  reabre esta decisión con el dueño, no se implementa.**

## Dónde va el cambio

En el mismo bloque `TERMINAL_BOOKING_STATUSES` de `handleApproved`, junto a la auditoría y la
notificación que ya están. La primitiva de reembolso ya existe (`payment.service.ts:900-1040`, con su
clave de idempotencia `refund:<id>`), así que no hay que construirla.

A resolver al implementar:

1. El reembolso tiene que ser idempotente contra reintentos del webhook y contra el barrido de
   `reconcile-pending-payments`, que llegan al mismo camino.
2. Falta el mail al **jugador** — hoy solo se le avisa al complejo.
3. Qué hacer si el reembolso falla en MercadoPago: existe `retry-pending-refunds`, hay que engancharlo.
4. El detalle de reserva muestra el monto como "(pendiente)" con el pago ya `approved` — dato falso
   que hay que corregir igual, decida lo que decida el reembolso.
