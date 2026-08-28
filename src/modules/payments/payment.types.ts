export type PreferenceResult = {
  preferenceId: string
  initPoint: string
  sandboxInitPoint: string
}

export type MpPaymentStatus =
  'pending' | 'in_process' | 'approved' | 'rejected' | 'refunded' | 'cancelled'

export type GatewayPaymentInfo = {
  mpPaymentId: string
  status: MpPaymentStatus
  /** Centavos ARS. */
  amount: number
  /** Booking id. */
  externalReference: string
  paymentMethodId: string
  /**
   * Billing Fix 2b (R2 🔴): preapproval de origen para un cobro recurrente
   * (`subscription_authorized_payment`) — MP lo trae en
   * `point_of_interaction.linked_to` (ver `mp-gateway.implementation.ts`).
   * `undefined` = el campo no vino (pagos de booking-deposit normales, sin
   * preapproval detrás, o callers/mocks preexistentes que no lo conocen) —
   * distinto de `null` explícito. Opcional a propósito: agregar un campo
   * requerido acá rompería los ~15 archivos de test que construyen
   * `GatewayPaymentInfo` sin conocerlo.
   */
  preapprovalId?: string | null
  /**
   * `date_created` crudo de MP (ISO-8601 con offset), solo poblado por
   * `searchPaymentsByReference` — historial de facturación SaaS
   * (`billing.service.ts:listInvoices`). `getPaymentStatus` no lo necesita
   * (booking deposits ya tienen su propio `created_at` en `payments`) y
   * agregarlo ahí obligaría a tocar los mismos ~15 tests que ya evitó
   * `preapprovalId` arriba. Opcional/string crudo por la misma razón.
   */
  dateCreated?: string
}

/**
 * Estado real de una suscripción en MercadoPago (`GET /preapproval/{id}`).
 * Montos en centavos ARS, como en todo el resto del sistema.
 *
 * Lo consume `reconcile-subscriptions.worker.ts`: `trialing → active` solo pasa
 * cuando llega el aviso del cobro, así que si el aviso se pierde hace falta
 * poder preguntarle a MP directamente en vez de esperarlo.
 *
 * `status` sale tal cual de MP. `'unknown'` cubre un valor que MP agregue más
 * adelante y este código no conozca: se trata como "no tocar y alertar", nunca
 * como "está pagando".
 */
export type GatewaySubscriptionState = {
  preapprovalId: string
  status: 'pending' | 'authorized' | 'paused' | 'cancelled' | 'unknown'
  /** `createPreapproval` lo setea al tenantId. Sirve de cross-check. */
  externalReference: string | null
  nextPaymentDate: Date | null
  /**
   * Cobros efectivos. **Cuidado**: MP omite `summarized` ENTERO en un
   * preapproval que nunca cobró (no manda `charged_quantity: 0`) — medido
   * contra la cuenta viva el 2026-08-20 sobre 3 preapprovals reales sin
   * cobros. El parser normaliza esa ausencia a 0.
   */
  chargedQuantity: number
  lastChargedDate: Date | null
  lastChargedAmountCents: number | null
}

export type CreatePreferenceInput = {
  bookingId: string
  /** Centavos ARS. */
  amount: number
  description: string
  successUrl: string
  failureUrl: string
  pendingUrl: string
  notificationUrl: string
  /** Booking.created_at + 15min (or 48h for in_process). */
  expiresAt: Date
}

export type WebhookEvent = {
  /** Event id from MP — top-level `id` in the IPN body. Idempotency key. */
  mpEventId: string
  /** 'payment' | 'subscription' | 'refund' | ... */
  eventType: string
  /** MP payment id (`data.id` in the body). */
  mpPaymentId: string
  /** Raw body for audit/debugging — stored in `processed_webhooks.payload`. */
  rawPayload: unknown
}

/**
 * La devolución que el complejo quedó debiendo, ya registrada en `payments`.
 *
 * Hubo una fase 2 que liquidaba esto contra la API de MercadoPago; se eliminó
 * cuando el reembolso automático se descartó como producto (PR #203): MP deriva
 * los permisos del PRODUCTO de la aplicación y ninguna concede
 * `payments:refunds`, así que ese camino devolvía 403 siempre. Hoy la fila
 * queda `pending` y la salda el complejo desde `/caja/devoluciones`, o se salda
 * sola por webhook si devuelve desde el panel de MercadoPago.
 *
 * Vive acá y no en `payment.service.ts` porque `WebhookOutcome` lo expone: el
 * tipo tiene que ser importable sin arrastrar el service entero (y sin ciclo,
 * el service importa de este archivo).
 */
export type PreparedRefund = {
  refundPaymentId: string
  /** Centavos. Lo usa el mail al jugador para decirle cuánto le tienen que devolver. */
  refundAmount: number
}

export type WebhookOutcome =
  | { alreadyProcessed: true }
  | {
      alreadyProcessed: false
      result: 'confirmed' | 'in_process' | 'rejected' | 'refunded'
      /**
       * Notification IDs enqueued inside the webhook tx (e.g. late-payment admin
       * alert, Hallazgo 3). The caller dispatches the emails AFTER commit.
       */
      notificationIds?: string[]
      /**
       * R1-B (rechazo review de ENS-16): solo tiene sentido cuando
       * `result==='confirmed'`. `result==='confirmed'` únicamente dice que MP
       * aprobó el PAGO — no dice si transitionFromPendingPayment ganó la
       * transición del booking (el guard `WHERE status='pending_payment'`
       * puede fallar sobre un booking ya post-terminal). `won` es la ÚNICA
       * fuente de verdad de "esta corrida confirmó la reserva"; consumidores
       * que gatean un side-effect en eso (push de admin, etc.) DEBEN chequear
       * `won === true`, no `result`.
       */
      won?: boolean
      /**
       * Devolución de un pago tardío (decisión del dueño 2026-08-19): MP aprobó
       * DESPUÉS de que la reserva expirara, así que no hay turno que confirmar
       * y hay que devolverle la plata al jugador.
       *
       * Está presente = quedó REGISTRADA la obligación en la misma tx, no que
       * la plata haya vuelto. Los callers lo usan solo para contar y para
       * decidir la copy del mail; la devolución la hace el complejo desde
       * `/caja/devoluciones` (hubo una fase que la pedía por API y se eliminó,
       * devolvía 403 siempre).
       */
      preparedRefund?: PreparedRefund
    }

// ─── SaaS recurring billing (P18) ──────────────────────────────

export type CreatePreapprovalInput = {
  /** TurnoGol tenant id; goes into MP `external_reference`. */
  tenantId: string
  payerEmail: string
  /** Centavos ARS. */
  amount: number
  frequency: 'monthly' | 'annual'
  /** Plan id (for audit trail; not required by MP). */
  planId: string
  /** Free-text shown to payer in the MP UI. */
  reason: string
  returnUrl: string
  /** MP webhook URL (`/api/webhooks/mercadopago?tenant=<id>`). */
  notificationUrl: string
}

export type PreapprovalResult = {
  preapprovalId: string
  initPoint: string
}

export type CreateSaasUpgradePreferenceInput = {
  tenantId: string
  targetPlanId: string
  /** Centavos ARS — the proration charge. */
  amount: number
  description: string
  returnUrl: string
  notificationUrl: string
  expiresAt: Date
}

/**
 * external_reference format for upgrade preferences:
 *   `saas-upgrade:<tenantId>:<targetPlanId>`
 * Used by the MP webhook dispatcher to route the resulting payment back to
 * `billing.handleUpgradePayment`.
 */
const SAAS_UPGRADE_REF_PREFIX = 'saas-upgrade:'

export function buildSaasUpgradeRef(tenantId: string, targetPlanId: string): string {
  return `${SAAS_UPGRADE_REF_PREFIX}${tenantId}:${targetPlanId}`
}

export function parseSaasUpgradeRef(
  externalReference: string,
): { tenantId: string; targetPlanId: string } | null {
  if (!externalReference.startsWith(SAAS_UPGRADE_REF_PREFIX)) return null
  const [, tenantId, targetPlanId] = externalReference.split(':')
  if (!tenantId || !targetPlanId) return null
  return { tenantId, targetPlanId }
}
