# Cobrar varios turnos juntos y "Dar por perdido" lo que falta de un turno

**Fecha**: 2026-11-07 · **Estado**: aprobada, en implementación · **Decide**: el dueño (qué y dónde se ve) + esta sesión (cómo)

## Origen

Visita del founder a El Vagón (`docs/gtm/ejecucion/10-aprendizajes.md`, 2026-11-07):

- Cuando terminan varios turnos juntos quedan todos en rojo y se cobran de a uno: abrir el modal, cobrar, cerrar, abrir el siguiente. "Cobrar el siguiente" (2026-09-25) ayuda, pero sigue siendo de a uno y sin ver el resto.
- Cuando falta plata en un turno, el complejo quiere resignarla a conciencia y no puede. Lo que queda sin cobrar a las 24 h lo acredita solo el cron `auto-credit-unpaid` **como efectivo cobrado** (`src/modules/bookings/booking.auto-credit.ts`), así que Caja, Analíticas y el resumen muestran plata que nunca entró.

## Qué se decide

1. **"Cobrar varios"**: un diálogo con una tarjeta chica por turno en rojo de esta noche, lado a lado (variante elegida por el dueño entre tarjetas y renglones). Se abre con un botón "Cobrar los N" en Hoy y en la Grilla cuando hay 2 o más turnos en rojo; **no se abre solo**, para no tapar una venta a medias. Cada tarjeta cobra con el mismo hook y las mismas Server Actions del modal de siempre: no hay acción masiva ni schema nuevo. Lo cobrado queda en su lugar ("✓ Cobrado") para que nada salte bajo el mouse.
   - **Reabre a medias** el rechazo del 2026-09-25 (`2026-09-25-hoy-cobrar-ahora.md` punto 1) a una cola "Cobrar ahora" como pantalla principal de Hoy. Esto no la reemplaza: el tablero por cancha sigue igual y la vista es un overlay que se abre a pedido, solo con lo que está en rojo ahora.
2. **"Dar por perdido"**: un botón en el cobro de un turno ya jugado al que le falta plata (modal del turno en Hoy y Grilla, diálogo de Caja, y la tarjeta de "Cobrar varios"). Cierra el turno con lo que entró: lo que falta deja de estar en rojo, sale de "Turnos no cobrados" y **nunca se acredita solo a las 24 h**. Pide confirmación y se puede deshacer desde el aviso.
   - Lo que nadie toca **sigue** acreditándose en efectivo a las 24 h (decisión del 2026-09-26, sin cambios). Se descartaron "lo paga otro día" y apagar la acreditación automática.
   - **Dónde se ve**: en el turno ("Perdido $X", tono neutro, nunca el verde de pagado), en Caja › Cuentas (una línea de la noche, aparte de lo que entró) y en Analíticas (total del mes).
   - **Nunca "deuda"** y **sin texto libre** (Ley 25.326): no lleva motivo escrito; quién y cuándo queda en el audit log.
   - **Modelo**: tabla propia `booking_write_offs` (una fila por turno, monto en centavos). No es una columna de `bookings` porque el trigger `enforce_booking_invariants_fn` bloquea todo UPDATE de un turno `completed` y tocar `updated_at` reabriría las ventanas de 24 h (`completed → no_show` y la acreditación). No es un tipo de `cash_flows` porque no es plata y ensuciaría el libro de caja.
3. **Copys**: relevamiento de los textos del panel operativo con una tabla antes/después que el dueño aprueba fila por fila antes de tocar código.

## Qué no cambia

- Las métricas siguen sumando `cash_flows`: lo cobrado sigue siendo plata real; lo perdido se muestra aparte.
- El cálculo del saldo sigue siendo derivado (`summarizeBookingCharges` y sus espejos SQL): ahora resta también lo dado por perdido, con el mismo predicado en todos lados.

## Detalle de "Dar por perdido" (revisión de arquitectura + respuestas del dueño, 2026-11-07)

- **Quién**: dueño y encargado (`requireOperatorStaff`). Quién lo hizo queda en `written_off_by` y en el audit log `booking.written_off`. En El Vagón el encargado usa la cuenta del dueño, así que restringirlo no frenaría nada hoy.
- **Monto guardado, no derivado**: lo calcula el servidor bajo `SELECT … FOR UPDATE` del turno (el mismo orden que los cobros), y la acción recibe el monto que vio el staff (`expectedPendingCents`): si cambió en el medio (entró un cobro), se rechaza en vez de resignar otro número.
- **Cobrar un turno dado por perdido**: las acciones de cobro releen el perdido bajo el lock y dicen la verdad ("está dado por perdido"), no "ya está pagado".
- **Deshacer**: solo desde el aviso, en el momento. Es para un clic equivocado. Después queda perdido. Motivo: deshacer un turno de más de 24 h lo dejaría a merced de la acreditación automática, que lo daría por cobrado en efectivo en menos de una hora.
- **Si el turno pasa a ausente** (corrección `completed → no_show` dentro de las 24 h): el perdido se borra en la misma transacción. Si después se revierte a jugado, el perdido no vuelve: se decide de nuevo.
- **Analíticas y Caja** cuentan lo perdido por el momento en que se tocó el botón (`created_at`), igual que la plata cobrada cuenta por cuándo entró.
- **Despliegue**: la acreditación automática corre en el worker (Railway). Antes de dar la función por usable en producción, el worker nuevo tiene que estar desplegado; si no, el viejo podría acreditar en efectivo un perdido de un turno de más de 24 h.
