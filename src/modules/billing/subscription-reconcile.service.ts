import type { GatewaySubscriptionState } from '@/modules/payments/payment.types'
import type { BillingCycle, SubscriptionStatus } from './billing.types'

/**
 * Decisión de reconciliación de una suscripción SaaS contra MercadoPago.
 *
 * Vive separado del worker y sin un solo import de DB ni de red a propósito:
 * es la única parte del reconciliador con reglas de plata, y así la tabla de
 * decisión entera se prueba con vitest sin Postgres ni MP.
 *
 * Diseño completo (incluido el caso real del 2026-08-20 que lo motiva):
 * `docs/superpowers/specs/2026-08-20-reconcile-subscriptions-design.md`.
 */

/** Lo que la DB sabe hoy de la suscripción. */
export type LocalSubSnapshot = {
  status: SubscriptionStatus
  billingCycle: BillingCycle
  mpSubscriptionId: string | null
  lastPaymentAt: Date | null
}

export type ReconcileDecision =
  | { action: 'noop'; reason: string }
  | { action: 'alert'; reason: string }
  | { action: 'activate'; paidAt: Date; periodStart: Date; periodEnd: Date }

// Qué estados locales son reconciliables NO se declara acá: el worker los tiene
// partidos en `CORE_STATUSES` (trialing/past_due) y `POST_TERMINAL_STATUSES`
// (suspended/blocked, con ventana), porque cada barrido los usa distinto. Una
// tercera lista con la unión sería una segunda fuente de verdad para lo mismo.

/**
 * Clave de idempotencia POR COBRO, compartida entre el webhook y el
 * reconciliador (D3 del diseño).
 *
 * Se ancla en el id del PAGO, que es lo único que los dos caminos ven igual:
 * `mp-webhook.handler` lo saca de `info.mpPaymentId` (en la rama de la factura,
 * `getSubscriptionChargeInfo` ya devuelve el pago de adentro y no la factura),
 * y el worker lo saca de `searchPaymentsByReference`. NO se puede usar el
 * `mp_event_id` del webhook: ése es el id de NOTIFICACIÓN de MP, distinto en
 * cada aviso e invisible para el worker.
 *
 * Vive acá y no en cada caller para que no haya dos formas de armar la misma
 * clave — dos formatos distintos serían un doble cobro silencioso.
 */
export function buildSubscriptionChargeKey(mpPaymentId: string): string {
  return `sub-charge:${mpPaymentId}`
}

/**
 * Lo que MP va a cobrar NO coincide con lo que el plan vale hoy.
 *
 * 🔴 3 de la revisión de la tanda #319-#324
 * (`docs/audit/2026-09-16-revision-tanda-319-324.md`). Antes del fix de #319 un
 * alta anual podía quedar `authorized` en MP con `transaction_amount =
 * price_annual` — que es el EQUIVALENTE MENSUAL con 20% off, no el total del
 * año (migr. 071). Ese preapproval sigue vivo cobrando 1/12 de lo que
 * corresponde, para siempre, y ningún camino automático lo mira:
 * `decideSubscriptionReconcile` sólo compara `status` y fechas, y los tres
 * llamados a `updatePreapprovalAmount` dependen de un upgrade, un downgrade
 * programado o un cambio manual de soporte.
 *
 * Esto SÓLO detecta y devuelve el desfasaje. No corrige: cambiarle el monto a
 * un preapproval vivo es cobrarle distinto a un cliente sin avisarle, y esa es
 * una decisión del dueño, no del cron (opción 1 de las tres que dejó abierta el
 * informe).
 *
 * Silencios deliberados:
 *  - `status !== 'authorized'`: un preapproval `pending` todavía no cobra nada y
 *    su monto lo valida `reusablePendingCheckout` antes de reusarlo; uno
 *    `paused`/`cancelled` tampoco cobra. Alertar ahí sería ruido puro.
 *  - `amountCents` ausente o <= 0: MP omite `auto_recurring` entero en un
 *    preapproval creado a mano, y los fixtures de reconciliación no lo
 *    conocen. Sin dato no hay desfasaje que afirmar.
 */
export type PreapprovalAmountDrift = {
  expectedCents: number
  actualCents: number
  reason: string
}

export function detectPreapprovalAmountDrift(
  expectedCents: number,
  remote: GatewaySubscriptionState,
): PreapprovalAmountDrift | null {
  if (remote.status !== 'authorized') return null

  const actualCents = remote.amountCents
  if (typeof actualCents !== 'number' || actualCents <= 0) return null
  if (actualCents === expectedCents) return null

  return {
    expectedCents,
    actualCents,
    reason: `MercadoPago cobra ${actualCents} centavos y el plan vale ${expectedCents}`,
  }
}

function addCycle(from: Date, cycle: BillingCycle): Date {
  const d = new Date(from)
  if (cycle === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1)
  else d.setUTCFullYear(d.getUTCFullYear() + 1)
  return d
}

/**
 * Qué hacer con una suscripción, dado lo que dice MercadoPago.
 *
 * Nunca devuelve `activate` sin un `last_charged_date` real: esa fecha ancla el
 * período Y el guard de idempotencia, y fabricarla con `new Date()` rompería
 * las dos cosas a la vez.
 */
export function decideSubscriptionReconcile(
  local: LocalSubSnapshot,
  remote: GatewaySubscriptionState,
  expectedTenantId: string,
): ReconcileDecision {
  // `createPreapproval` setea external_reference = tenantId. Si no matchea,
  // este preapproval es de otro complejo y activar sería acreditarle a uno la
  // plata de otro. Mismo cross-check que hace `mp-webhook.handler.ts` antes de
  // aplicar un cobro.
  if (remote.externalReference !== null && remote.externalReference !== expectedTenantId) {
    return {
      action: 'alert',
      reason: `external_reference no coincide: esperado ${expectedTenantId}, MP dice ${remote.externalReference}`,
    }
  }

  if (remote.status === 'cancelled') {
    // Caso REAL del 2026-08-20 (`275616150b…`: cancelled, con $100 cobrados y
    // sin aplicar). NO se reactiva: el preapproval está muerto, reactivarlo no
    // cobra nada nuevo y daría de alta algo que el dueño ya no autoriza. La
    // plata se resuelve a mano; acá solo se avisa.
    return { action: 'alert', reason: 'MP dice cancelled y la DB no' }
  }
  if (remote.status === 'paused') {
    return { action: 'alert', reason: 'MP dice paused y la DB no' }
  }
  if (remote.status === 'unknown') {
    return { action: 'alert', reason: 'status de preapproval no reconocido' }
  }
  if (remote.status === 'pending') {
    return { action: 'noop', reason: 'preapproval sin autorizar (checkout sin terminar)' }
  }

  // authorized de acá para abajo.
  if (remote.chargedQuantity < 1) {
    return { action: 'noop', reason: 'autorizado pero todavía sin cobros' }
  }
  const lastCharged = remote.lastChargedDate
  if (lastCharged === null) {
    return { action: 'alert', reason: 'charged_quantity > 0 sin last_charged_date' }
  }

  // Guard de marca de agua. Si el último pago registrado localmente es igual o
  // posterior al último cobro que MP conoce, ese cobro YA está aplicado (ganó
  // el webhook). Esto es lo que hace idempotente correr el worker N veces, y lo
  // que reemplaza a la clave de `processed_webhooks`, que este camino no puede
  // compartir con el webhook: la del webhook es el id de NOTIFICACIÓN de MP,
  // que el worker nunca ve.
  if (local.lastPaymentAt !== null && local.lastPaymentAt >= lastCharged) {
    return { action: 'noop', reason: 'el último cobro de MP ya está aplicado' }
  }

  // `next_payment_date` es la verdad de MP sobre cuándo vence el período, y
  // por eso se prefiere a sumar un ciclo a mano: si se perdieron varios cobros,
  // sumar uno solo dejaría el período corto. El fallback no es teórico — los
  // preapprovals sin cobros devuelven un `next_payment_date` ANTERIOR a su
  // propia fecha de creación (medido contra la cuenta viva el 2026-08-20).
  const periodEnd =
    remote.nextPaymentDate !== null && remote.nextPaymentDate > lastCharged
      ? remote.nextPaymentDate
      : addCycle(lastCharged, local.billingCycle)

  return { action: 'activate', paidAt: lastCharged, periodStart: lastCharged, periodEnd }
}
