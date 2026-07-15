import { withTenantContext } from '@/shared/db/client'
import type { PaymentGateway } from './mp-gateway'
import type { WebhookEvent } from './payment.types'
import { dispatchPaymentInfo, lockMpEvent } from './payment.service'

export type ReconcileMpOutcome = {
  confirmed: boolean
  notificationIds: string[]
}

/**
 * R1-A (rechazo review de ENS-16): distingue la fase PROCESS (post-lock, tx
 * local: upsert de payments, transitionFromPendingPayment, cash_flow) de la
 * fase SEARCH (llamada a MP). Un error de SEARCH significa "no sabemos si
 * pagó" — el caller puede tratarlo conservador. Un error de PROCESS ocurre
 * CON el pago ya confirmado `approved` por MP — el caller (booking.expiry.ts)
 * NUNCA puede tratar esto como "no hay pago" y expirar; debe reintentar. El
 * `cause` original queda accesible para logging/Sentry sin perder el stack.
 */
export class ReconcileProcessingError extends Error {
  constructor(
    public readonly bookingId: string,
    public readonly cause: unknown,
  ) {
    super(
      `reconcile: MP approved payment for booking ${bookingId} pero el procesamiento local falló`,
    )
    this.name = 'ReconcileProcessingError'
  }
}

/**
 * Reusable core of the "safety polling" pattern (Fase 6 §6.6, extended for
 * ENS-16): search MP by `external_reference` (bookingId) and, if an
 * `approved` payment exists, process it through the same lock + dispatch
 * flow a webhook uses — pulled instead of pushed. Shared by two rescue paths
 * that use the SAME idempotency key (`reconcile-<mpPaymentId>`), so racing
 * invocations across either path (or the periodic 5-min sweep) only ever
 * confirm once:
 *   - `booking.expiry.ts` pre-check (same-request rescue: the 6min hold
 *     window elapsed but MP already has the approved payment).
 *   - `reconcile-pending-payments.worker.ts` post-terminal query (booking
 *     already expired before any of this ran — the pure safety net).
 *
 * Lives in its own module (not `payment.service.ts`, where `lockMpEvent` /
 * `dispatchPaymentInfo` are defined) so callers can mock this one function
 * at the module boundary instead of the transactional primitives it wraps.
 *
 * Does NOT dispatch emails or the admin push — those are post-commit side
 * effects the caller triggers once this tx has committed (same boundary
 * `dispatchPaymentInfo`/`handleApproved` already enforce for every other
 * caller of that module).
 */
export async function reconcileApprovedPaymentForBooking(
  bookingId: string,
  tenantId: string,
  gateway: PaymentGateway,
  source: string,
): Promise<ReconcileMpOutcome> {
  // Fase SEARCH: si esto tira (MP inaccesible/timeout), no sabemos si pagó —
  // se propaga tal cual para que el caller decida el fallback conservador
  // (R1-A). NO envolver: esto no es evidencia de un pago aprobado.
  const mpPayments = await gateway.searchPaymentsByReference(bookingId)
  const approved = mpPayments.find((p) => p.status === 'approved')
  if (!approved) return { confirmed: false, notificationIds: [] }

  // Fase PROCESS: a partir de acá MP YA dijo approved. Cualquier error es
  // LOCAL (DB, recordDepositCashFlow, etc.) — se envuelve en
  // ReconcileProcessingError para que el caller jamás lo confunda con "no hay
  // pago" (R1-A).
  let outcome
  try {
    outcome = await withTenantContext(tenantId, async (tx) => {
      const event: WebhookEvent = {
        mpEventId: `reconcile-${approved.mpPaymentId}`,
        eventType: 'payment',
        mpPaymentId: approved.mpPaymentId,
        rawPayload: { source, bookingId },
      }
      const fresh = await lockMpEvent(event, tx)
      if (!fresh) return null
      return dispatchPaymentInfo(approved, tenantId, tx)
    })
  } catch (err) {
    throw new ReconcileProcessingError(bookingId, err)
  }

  if (!outcome || outcome.alreadyProcessed) {
    return { confirmed: false, notificationIds: [] }
  }
  // R1-B (rechazo review): `won` de transitionFromPendingPayment es la ÚNICA
  // fuente de verdad de que ESTA corrida confirmó la reserva — el lock fresco
  // (`fresh`) solo dice "primera vez que vemos este mpPaymentId", no que la
  // transición haya ganado. Sobre un booking ya post-terminal (expirado,
  // cancelado) `won` es siempre false aunque el lock sea fresco y
  // dispatchPaymentInfo no tire — derivar `confirmed` de cualquier otra cosa
  // dispara un push "Nueva reserva" falso y duplicados en carreras contra el
  // webhook real (que usa una idempotency key distinta).
  return { confirmed: outcome.won === true, notificationIds: outcome.notificationIds ?? [] }
}
