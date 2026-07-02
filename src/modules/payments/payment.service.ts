import { eq, sql } from 'drizzle-orm'
import { bookings, payments } from '@/shared/db/schema'
import { withTenantContext, type DbTx } from '@/shared/db/client'
import { insertSystemAuditLog } from '@/shared/db/audit'
import { transitionFromPendingPayment } from '@/modules/bookings/booking.concurrency'
import type { BookingRow } from '@/modules/bookings/booking.types'
import { DEFAULT_EXPIRY_SECONDS } from '@/shared/jobs/definitions'
import type { PaymentGateway } from './mp-gateway'
import type {
  CreatePreferenceInput,
  GatewayPaymentInfo,
  PreferenceResult,
  WebhookEvent,
  WebhookOutcome,
} from './payment.types'
import {
  BookingNotPendingPaymentError,
  PaymentNotFoundError,
  RefundAmountExceedsOriginalError,
  RefundInvalidStateError,
} from './payment.errors'
import { enqueueTenantOwnerNotification } from '@/modules/notifications/notification.service'
import { track } from '@/shared/observability'
import { captureMessage } from '@/lib/sentry'

const TERMINAL_BOOKING_STATUSES = [
  'expired',
  'canceled_refunded',
  'canceled_no_refund',
  'no_show',
  'completed',
] as const

/**
 * The MP checkout must close BEFORE the DB hold (`DEFAULT_EXPIRY_SECONDS`,
 * jobs/definitions.ts) fires and frees the slot — otherwise a player can pay
 * on a still-open MP page for a slot TurnoGol already gave away (Fable 5 P0:
 * TTLs were unified from two independent constants, one of them longer than
 * the hold). Buffer keeps a safety margin; the floor guards a late retry
 * (close to the hold's own deadline) from getting a past `expiration_date_to`,
 * which MP rejects outright.
 */
const MP_PREFERENCE_SAFETY_BUFFER_SECONDS = 60
const MP_PREFERENCE_MIN_WINDOW_SECONDS = 30

/**
 * Pre-checkout (Pilar B + Fix #13 + Saga fix, Fable 5 P0).
 *
 * MP is called BETWEEN two short transactions, never from inside one — the
 * previous version held the booking's row lock + a DB connection open for
 * the full MP round trip:
 *   1. tx1: lock booking, assert pending_payment + deposit_amount > 0, INSERT
 *      the payments row (status=pending, mp_preference_id=NULL) and UPDATE
 *      bookings.payment_method/payment_id — the "intent" is durable before MP
 *      is ever called. `chk_booking_payment_consistency` only requires
 *      payment_id IS NOT NULL for payment_method='mercadopago', so this is
 *      valid before the preference exists.
 *   2. Create MP preference (gateway) — no open tx.
 *   3. tx2: UPDATE the same payments row with the resulting mp_preference_id.
 *
 * If step 2 throws, tx1 already committed: the booking keeps its pending
 * payment row (mp_preference_id=NULL) and the player can retry — same
 * tolerated shape as re-invoking this function today (no UNIQUE on
 * booking_id, a retry just creates another row).
 *
 * Caller redirects player to `initPoint`.
 */
export async function createDepositPayment(
  bookingId: string,
  gateway: PaymentGateway,
  tenantId: string,
  appUrl: string,
): Promise<PreferenceResult> {
  track.payment('payment.deposit.create', { bookingId })

  const { depositAmount, createdAt, paymentId } = await withTenantContext(
    tenantId,
    async (tx) => {
      const lockRows = await tx.execute(sql`
        SELECT id, player_id AS "playerId",
               deposit_amount AS "depositAmount", status, created_at AS "createdAt"
        FROM bookings
        WHERE id = ${bookingId}
        FOR UPDATE
      `)
      const booking = (lockRows as unknown as Array<{
        id: string
        playerId: string | null
        depositAmount: number
        status: string
        createdAt: Date
      }>)[0]
      if (!booking) throw new PaymentNotFoundError(bookingId)
      if (booking.status !== 'pending_payment') {
        throw new BookingNotPendingPaymentError(bookingId)
      }
      if (booking.depositAmount <= 0) {
        throw new BookingNotPendingPaymentError(bookingId)
      }

      const inserted = await tx
        .insert(payments)
        .values({
          tenantId,
          bookingId,
          playerId: booking.playerId,
          amount: booking.depositAmount,
          currency: 'ARS',
          type: 'deposit',
          method: 'mercadopago',
          status: 'pending',
          description: `Seña reserva ${bookingId.slice(0, 8)}`,
        })
        .returning({ id: payments.id })
      const insertedPaymentId = inserted[0]!.id

      await tx
        .update(bookings)
        .set({ paymentMethod: 'mercadopago', paymentId: insertedPaymentId, updatedAt: new Date() })
        .where(eq(bookings.id, bookingId))

      return {
        depositAmount: booking.depositAmount,
        createdAt: booking.createdAt,
        paymentId: insertedPaymentId,
      }
    },
  )

  const holdExpiresAtMs = new Date(createdAt).getTime() + DEFAULT_EXPIRY_SECONDS * 1000
  const preferredExpiresAtMs = holdExpiresAtMs - MP_PREFERENCE_SAFETY_BUFFER_SECONDS * 1000
  const expiresAt = new Date(
    Math.max(preferredExpiresAtMs, Date.now() + MP_PREFERENCE_MIN_WINDOW_SECONDS * 1000),
  )

  const preferenceInput: CreatePreferenceInput = {
    bookingId,
    amount: depositAmount,
    description: `Seña reserva ${bookingId.slice(0, 8)}`,
    successUrl: `${appUrl}/reserva/${bookingId}/exito`,
    failureUrl: `${appUrl}/reserva/${bookingId}/error`,
    pendingUrl: `${appUrl}/reserva/${bookingId}/pendiente`,
    notificationUrl: `${appUrl}/api/webhooks/mercadopago?tenant=${tenantId}`,
    expiresAt,
  }
  const preference = await gateway.createPreference(preferenceInput)

  await withTenantContext(tenantId, async (tx) => {
    await tx
      .update(payments)
      .set({ mpPreferenceId: preference.preferenceId })
      .where(eq(payments.id, paymentId))
  })

  return preference
}

/**
 * Webhook entrypoint. Single transaction, Pilar B reigns.
 *
 * Step 1: Idempotency lock — INSERT processed_webhooks ON CONFLICT DO NOTHING.
 *         If row already exists → return { alreadyProcessed: true }, no side effects.
 * Step 2: gateway.getPaymentStatus(mpPaymentId).
 * Step 3: Branch by status (approved/in_process/rejected/refunded).
 *
 * Failures throw → tx rollback → processed_webhooks rolled back too → MP retries
 * (pg-boss `process-mp-webhook` retryLimit=5, doc14).
 */
export async function processWebhook(
  event: WebhookEvent,
  tenantId: string,
  gateway: PaymentGateway,
  tx: DbTx,
): Promise<WebhookOutcome> {
  const fresh = await lockMpEvent(event, tx)
  if (!fresh) return { alreadyProcessed: true }
  const info = await gateway.getPaymentStatus(event.mpPaymentId)
  return dispatchPaymentInfo(info, tenantId, tx)
}

/**
 * Idempotency lock — INSERT processed_webhooks ON CONFLICT DO NOTHING.
 * Returns true if this event is fresh (insert succeeded), false if a row
 * already exists.
 */
export async function lockMpEvent(
  event: WebhookEvent,
  tx: DbTx,
): Promise<boolean> {
  const lock = await tx.execute(sql`
    INSERT INTO processed_webhooks (mp_event_id, event_type, payload)
    VALUES (${event.mpEventId}, ${event.eventType}, ${JSON.stringify(event.rawPayload)}::jsonb)
    ON CONFLICT (mp_event_id) DO NOTHING
    RETURNING id
  `)
  const fresh = (lock as unknown as Array<{ id: string }>).length > 0
  if (!fresh) {
    track.webhook('mp.webhook.duplicate', {
      mpEventId: event.mpEventId,
      eventType: event.eventType,
    })
  }
  return fresh
}

/**
 * Post-lock dispatch: branch by MP payment status. Caller has already locked
 * the event AND fetched the gateway info. Used by the webhook handler to
 * route between booking-deposit and SaaS-upgrade flows without paying for
 * duplicate `getPaymentStatus` calls.
 */
export async function dispatchPaymentInfo(
  info: GatewayPaymentInfo,
  tenantId: string,
  tx: DbTx,
): Promise<WebhookOutcome> {
  if (info.status === 'approved') {
    track.payment('payment.deposit.approved', {
      bookingId: info.externalReference,
      tenantId,
      mpPaymentId: info.mpPaymentId,
      amountCents: info.amount,
    })
    const approved = await handleApproved(info, tenantId, tx)
    return {
      alreadyProcessed: false,
      result: 'confirmed',
      notificationIds: approved.notificationIds,
    }
  }
  if (info.status === 'in_process') {
    await handleInProcess(info, tenantId, tx)
    return { alreadyProcessed: false, result: 'in_process' }
  }
  if (info.status === 'rejected' || info.status === 'cancelled') {
    track.payment('payment.deposit.rejected', {
      bookingId: info.externalReference,
      tenantId,
      mpPaymentId: info.mpPaymentId,
    })
    await upsertPaymentRow(info, tenantId, 'rejected', tx)
    return { alreadyProcessed: false, result: 'rejected' }
  }
  if (info.status === 'refunded') {
    await upsertPaymentRow(info, tenantId, 'refunded', tx)
    return { alreadyProcessed: false, result: 'refunded' }
  }
  await upsertPaymentRow(info, tenantId, 'pending', tx)
  return { alreadyProcessed: false, result: 'rejected' }
}

/**
 * Approved path:
 *   1. UPSERT payment row by mp_payment_id (UNIQUE) → status='approved'.
 *   2. transitionFromPendingPayment(bookingId, 'confirmed', tx) — race-safe.
 *
 * INVIOLABLE (Pilar C): caller fires email + audit ONLY when `won === true`.
 * Returned `won` flag is exposed via `WebhookOutcome.result` (the payment row
 * is upserted regardless to preserve audit trail; only the booking transition
 * gates side effects).
 *
 * Fix #52: compara info.amount con booking.deposit_amount antes de confirmar.
 * Si el monto recibido es menor al esperado, se registra en audit_logs para
 * seguimiento manual del admin. La reserva se confirma igual (MP aprobó el pago).
 */
async function handleApproved(
  info: GatewayPaymentInfo,
  tenantId: string,
  tx: DbTx,
): Promise<{ won: boolean; row?: BookingRow; notificationIds: string[] }> {
  // Fetch expected deposit before upserting so we can compare amounts.
  const depRows = await tx.execute(sql`
    SELECT deposit_amount AS "depositAmount"
    FROM bookings
    WHERE id = ${info.externalReference}
    LIMIT 1
  `)
  const depositAmount = (depRows as unknown as Array<{ depositAmount: number }>)[0]?.depositAmount ?? info.amount

  await upsertPaymentRow(info, tenantId, 'approved', tx)

  if (info.amount < depositAmount) {
    await insertSystemAuditLog(tx, {
      tenantId,
      action: 'payment.amount_discrepancy',
      resourceType: 'booking',
      resourceId: info.externalReference,
      metadata: {
        expectedCents: depositAmount,
        receivedCents: info.amount,
        mpPaymentId: info.mpPaymentId,
      },
    })
  }

  const result = await transitionFromPendingPayment(
    info.externalReference,
    'confirmed',
    tx,
  )
  if (result.won) return { won: true, row: result.row, notificationIds: [] }

  // Won=false: another worker (or expiry job) already moved the booking out of
  // pending_payment. If the current state is terminal, record a late-payment
  // attempt for operational follow-up (manual refund decision). The payment row
  // is upserted regardless to preserve the audit trail.
  const cur = await tx.execute(sql`
    SELECT b.status, c.name AS court_name, b.date::text AS date
    FROM bookings b
    JOIN courts c ON c.id = b.court_id
    WHERE b.id = ${info.externalReference}
  `)
  const row = (cur as unknown as Array<{
    status: string
    court_name: string
    date: string
  }>)[0]
  const notificationIds: string[] = []

  // Booking not found: money received but cannot be credited — alert ops (#66).
  if (!row) {
    captureMessage('late_payment: booking not found', {
      level: 'error',
      extra: {
        bookingId: info.externalReference,
        mpPaymentId: info.mpPaymentId,
        amount: info.amount,
        tenantId,
      },
    })
    return { won: false, notificationIds }
  }

  if ((TERMINAL_BOOKING_STATUSES as ReadonlyArray<string>).includes(row.status)) {
    await insertSystemAuditLog(tx, {
      tenantId,
      action: 'booking.late_payment_attempt',
      resourceType: 'booking',
      resourceId: info.externalReference,
      metadata: {
        mpPaymentId: info.mpPaymentId,
        amount: info.amount,
        currentStatus: row.status,
      },
    })

    // Hallazgo 3: don't just bury it in audit_logs — alert the admin prominently
    // so the late payment gets a manual refund/reassignment decision. The email
    // is dispatched by the caller AFTER this tx commits (see WebhookOutcome).
    const ids = await enqueueTenantOwnerNotification(
      {
        tenantId,
        templateName: 'admin_late_payment',
        content: {
          bookingId: info.externalReference,
          amountArs: formatArs(info.amount),
          currentStatus: row.status,
          courtName: row.court_name,
          date: row.date.slice(0, 10).split('-').reverse().join('/'),
        },
        triggerEvent: 'booking.late_payment_attempt',
      },
      tx,
    )
    notificationIds.push(...ids)
  }
  return { won: false, notificationIds }
}

/** Centavos ARS → es-AR string, e.g. 300000 → "3.000,00". */
function formatArs(cents: number): string {
  return (Math.round(cents) / 100).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * In-process path (Fix #1, Fase 1 audit; narrowed by Fable 5 P0).
 *
 * `createPreference` excludes deferred payment types (ticket/atm/bank_transfer)
 * so this branch should be rare now, not the routine outcome of paying by
 * CBU/transferencia. No 48h grace window is implemented: the booking still
 * expires on the normal hold timer (`DEFAULT_EXPIRY_SECONDS`) like any other
 * pending payment — `hasInProcess` in booking.expiry.ts only changes the
 * notification copy, not the deadline. If MP still returns `in_process` for
 * some edge case (e.g. a card under manual review), it just records the
 * limbo state; a later webhook resolves it via the normal approved/rejected
 * paths.
 */
async function handleInProcess(
  info: GatewayPaymentInfo,
  tenantId: string,
  tx: DbTx,
): Promise<void> {
  await upsertPaymentRow(info, tenantId, 'in_process', tx)
}

/**
 * INSERT...ON CONFLICT (mp_payment_id) DO UPDATE.
 *
 * MP can emit multiple events for the same payment (`pending` → `in_process` →
 * `approved`). The same MP payment id reuses the same payment row; only the
 * status + processed_at evolve.
 *
 * `processed_webhooks.mp_event_id` blocks duplicate **events**; this UPSERT
 * handles distinct events about the same payment.
 */
async function upsertPaymentRow(
  info: GatewayPaymentInfo,
  tenantId: string,
  status: 'pending' | 'in_process' | 'approved' | 'rejected' | 'refunded',
  tx: DbTx,
): Promise<void> {
  // Fetch booking to get player_id for the payment row (when inserting fresh).
  const bookingRows = await tx.execute(sql`
    SELECT player_id AS "playerId"
    FROM bookings
    WHERE id = ${info.externalReference}
    LIMIT 1
  `)
  const booking = (bookingRows as unknown as Array<{ playerId: string | null }>)[0]
  const playerId = booking?.playerId ?? null

  await tx.execute(sql`
    INSERT INTO payments (
      tenant_id, booking_id, player_id, amount, currency,
      type, method, status, mp_payment_id, processed_at
    ) VALUES (
      ${tenantId}, ${info.externalReference}, ${playerId}, ${info.amount}, 'ARS',
      'deposit', 'mercadopago', ${status}::payment_status,
      ${info.mpPaymentId},
      ${status === 'approved' || status === 'in_process' ? sql`NOW()` : sql`NULL`}
    )
    ON CONFLICT (mp_payment_id) DO UPDATE SET
      status = EXCLUDED.status,
      processed_at = COALESCE(EXCLUDED.processed_at, payments.processed_at)
  `)
}

/**
 * Refund. NEW row in `payments` (type='refund'). Original payment is immutable
 * (Payment Invariante 1).
 *
 * NO `cash_flow` row generated (Fix #9, Fase 3): la seña nunca tocó caja física;
 * MP procesa el refund directo entre cuentas.
 */
export async function createRefund(
  paymentId: string,
  amount: number | undefined,
  gateway: PaymentGateway,
  tx: DbTx,
): Promise<{ refundPaymentId: string }> {
  const lockRows = await tx.execute(sql`
    SELECT id, tenant_id AS "tenantId", booking_id AS "bookingId",
           player_id AS "playerId", amount, type, status,
           mp_payment_id AS "mpPaymentId"
    FROM payments
    WHERE id = ${paymentId}
    FOR UPDATE
  `)
  const original = (lockRows as unknown as Array<{
    id: string
    tenantId: string
    bookingId: string | null
    playerId: string | null
    amount: number
    type: string
    status: string
    mpPaymentId: string | null
  }>)[0]
  if (!original) throw new PaymentNotFoundError(paymentId)
  if (!original.mpPaymentId) {
    throw new RefundInvalidStateError(paymentId, 'no mp_payment_id')
  }
  if (original.status !== 'approved') {
    throw new RefundInvalidStateError(paymentId, original.status)
  }
  if (original.type !== 'deposit' && original.type !== 'full_payment') {
    throw new RefundInvalidStateError(paymentId, `type=${original.type}`)
  }

  const refundAmount = amount ?? original.amount

  // B3 audit fix: prevent over-refund and double-refund. Sum existing refunds
  // (any status that consumes the original) and require that
  // sumRefunded + requested <= original.amount.
  // Fix #53: usar igualdad exacta en lugar de LIKE para evitar falsos positivos
  // por UUIDs con prefijo compartido o cambios en el formato del description.
  const priorRows = await tx.execute(sql`
    SELECT COALESCE(SUM(amount), 0)::bigint AS total
    FROM payments
    WHERE booking_id = ${original.bookingId}
      AND type = 'refund'
      AND status IN ('approved', 'pending')
      AND description = ${'Refund of ' + original.id}
  `)
  const priorTotal = Number(
    (priorRows as unknown as Array<{ total: string | number }>)[0]?.total ?? 0,
  )
  const available = original.amount - priorTotal
  if (refundAmount > available) {
    throw new RefundAmountExceedsOriginalError(paymentId, refundAmount, available)
  }

  const refund = await gateway.createRefund(original.mpPaymentId, refundAmount)

  const inserted = await tx
    .insert(payments)
    .values({
      tenantId: original.tenantId,
      bookingId: original.bookingId,
      playerId: original.playerId,
      amount: refundAmount,
      currency: 'ARS',
      type: 'refund',
      method: 'mercadopago',
      status: refund.status === 'approved' ? 'approved' : 'pending',
      mpPaymentId: refund.mpRefundId,
      description: `Refund of ${original.id}`,
    })
    .returning({ id: payments.id })

  return { refundPaymentId: inserted[0]!.id }
}

