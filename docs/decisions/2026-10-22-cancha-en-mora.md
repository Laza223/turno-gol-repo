# Decisión: cancha prendida estando en mora

**Fecha:** 2026-10-22 · **Decide:** Lazar (founder) · **Estado:** aprobada el 2026-10-22 (P1 y P2 con la opción recomendada).

Cierra la deuda "Una cancha prendida estando en mora no sube la cuota" de [`docs/tech-debt.md`](../tech-debt.md). Se registra antes de programar.

## Problema

El aviso de "esto te sube la cuota" al crear o prender una cancha ([`canchas/actions.ts`](<../../src/app/(admin)/canchas/actions.ts>)) solo existe con la suscripción `active` o `trialing`. En los otros estados, `getCourtCountAndBilled` devuelve `billedCourts: null` y la cancha se prende sin aviso y sin mover `billed_courts`. En la práctica el único estado alcanzable es `past_due` (y `canceled` antes del fin del período): con `suspended` o `blocked` el panel no deja mutar nada.

Si después el complejo vuelve a `active` sin pasar por `reactivate()`, queda operando más canchas de las que paga y nada lo detecta. Pasa cuando MP reintenta el débito con el monto viejo (`onPaymentApproved`) o cuando `reconcile-subscriptions` rescata un cobro perdido. `reconcile-subscriptions` compara el monto de MP contra `billed_courts`, pero no compara `billed_courts` contra las canchas prendidas.

## Qué se hace (no toca plata)

Un chequeo nuevo en `reconcile-subscriptions` (cron de cada hora, a las :20):

1. **Universo:** suscripciones `active`.
2. **Condición:** hay más canchas `online` que `billed_courts` y no hay cambio agendado (`pending_billed_courts IS NULL`). Si hay un cambio agendado, el barrido de `dunning-retry` ya aplica `GREATEST(agendado, canchas prendidas)` al cierre del período, así que eso se corrige solo y no se alerta.
3. **Dedup:** 20 h sobre `audit_logs`, igual que `subscription.amount_drift`. La fila de audit se escribe recién cuando el mail salió: si falla, el próximo tick reintenta, y Sentry queda de respaldo.
4. **Alerta a ops:** fila de audit `subscription.courts_over_billed` con los números, warning en Sentry y mail a los super admins activos por el canal de `ops_alerts` (migr. 097).
5. **No toca nada más:** ni `billed_courts`, ni MercadoPago, ni el cobro. Corregirlo es decisión del dueño, caso por caso.

## Decisiones del dueño

**P1. ¿Alcanza con la alerta a ops o además se le avisa al dueño del complejo?** → **Solo ops.**
Hoy no paga ningún complejo, y el aviso al dueño anuncia una suba, o sea que es comunicación de precio. Además necesitaría un template de notificación nuevo, y esa superficie está congelada en esta ola por RIVAL.

**P2. ¿Qué pasa al prender una cancha estando en mora?** → **Sigue pasando sin aviso.**
No se le frena la operación a un complejo que ya está en problemas, y el chequeo nuevo lo detecta cuando vuelve a `active`. Se descartaron un aviso informativo sin bloquear y bloquear prender canchas por encima de lo facturado mientras dure la mora (decisión de lifecycle).

## Efecto sobre El Vagón

Está en `trialing` (prueba hasta el 2026-12-06), así que el chequeo no lo mira. Agrega una query por hora sobre la base y ninguna llamada a MercadoPago.
