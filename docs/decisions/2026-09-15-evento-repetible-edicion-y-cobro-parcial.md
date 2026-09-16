# Grilla: evento repetible y gratis · editar reserva · cobro parcial a la vista

**Fecha:** 2026-09-15 · **Decide:** dueño · **Estado:** vigente
**Origen:** dos FRICCIÓN en `docs/gtm/ejecucion/10-aprendizajes.md` (2026-09-15)
**Ledger:** `docs/planning/2026-09-15-grilla-evento-edicion-cobro-ledger.md`
**Complementa:** `docs/decisions/2026-09-14-alta-grilla-modal-unico-y-reservas-por-cancha.md` (D1 sigue vigente: un evento de más de 1 h no se reprograma)

## Problema

1. El encargado de un complejo real no pudo registrar un pago parcial ($20.000 de $84.000) cuando el turno ya estaba en rojo. El backend acepta parciales en los tres modos del panel (`advance`, `finish`, `settle`); la UI los escondía detrás de "Cobrar otro monto". El cobro por adelantado además aceptaba una sola línea (un solo método).
2. Una reserva cargada no se puede editar: solo se reprograma un turno de 60 min. Un nombre mal escrito o un precio arreglado obligan a cancelar y volver a cargar.
3. Las escuelitas son recurrentes y en su mayoría gratis. El Evento de la grilla no se repetía, y un turno fijo exigía precio mayor a $0 y teléfono.

## Decisiones

- **D1 — Evento = todo lo que no es el turno común de un jugador** (escuelita, torneo, cumpleaños, turno regalado). Puede ser **con precio o gratis** y **una vez o cada semana**. "Cada semana" crea un abonado (mismo camino que Turno fijo: `createAbonadoAction`, sesiones `type='fixed'`). Para eso, migración 088: `abonados.price_per_session >= 0` y `abonados.contact_phone` nullable. El teléfono es **opcional** en el evento semanal; Turno fijo y `/abonados/nuevo` lo siguen pidiendo en la UI. Una sesión sin jugador muestra el nombre del evento en la grilla. El alta semanal no cobra: cada sesión se cobra desde el panel.
- **D2 — Editar reserva desde la grilla.** Campos: **nombre y teléfono** (solo invitados, `player_id IS NULL`), **precio** (nunca por debajo de lo ya cobrado: seña contada + cobros) y **duración** (solo `type='spontaneous'`, horas enteras, sin pisar otro turno, sin cruzar 24:00). Solo sobre turnos `confirmed`; nunca `block` ni torneo. Mover un evento de N horas sigue prohibido (D1 del 14/09). El trigger `enforce_booking_invariants_fn` mantiene `price_snapshot` inmutable y suma **una** excepción angosta (migración 089): turno `confirmed` dentro de una transacción que marcó `app.booking_edit = 'on'` con `SET LOCAL`. Queda auditado (`booking.edited`, antes/después).
  **Sesión de turno fijo (abonado): editar el precio queda PERMITIDO, sólo para esa fecha** (decisión del dueño, 2026-09-15) — a diferencia de `rescheduleBooking`, que en una sesión de abonado ignora cualquier precio pedido y conserva siempre el del contrato. La corrección pisa `price_snapshot` de ESA fila únicamente; `abonados.price_per_session` y las demás sesiones ya generadas no se tocan. El audit log marca `priceSource: 'session_override'` para dejarlo explícito, y el diálogo avisa "Turno fijo: este precio es sólo para esta fecha, no cambia el contrato."
- **D3 — Cobro parcial a la vista.** El panel de la grilla muestra el monto editable (precargado con lo que falta) en los tres modos; el botón dice lo que se cobra y lo que queda. El cobro por adelantado admite pago dividido en varios métodos (`addBookingChargeAction` recibe N líneas, atómico). "Cobrar otro monto" desaparece.

## Descartado

- **Tabla nueva de "series" de eventos**: duplicaría la recurrencia que ya resuelven los abonados (generación de 8 semanas + cron rodante, pausa y cancelación).
- **Teléfono obligatorio en el evento semanal**: el dueño lo prefirió opcional; la identidad de un contacto sin teléfono cae a la clave por fila.
- **Precio libremente mutable en el trigger**: la inmutabilidad protege contra cambios de precio silenciosos; la excepción exige un marcador explícito por transacción.
- **Fiados parciales y cobro en el alta del Turno fijo**: fuera de este esfuerzo.
