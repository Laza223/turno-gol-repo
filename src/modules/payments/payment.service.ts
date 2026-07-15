import { eq, sql } from 'drizzle-orm'
import { bookings, payments } from '@/shared/db/schema'
import { withTenantContext, type DbTx } from '@/shared/db/client'
import { insertSystemAuditLog } from '@/shared/db/audit'
import { transitionFromPendingPayment } from '@/modules/bookings/booking.concurrency'
import type { BookingRow } from '@/modules/bookings/booking.types'
import { depositCashFlowDescription } from '@/modules/bookings/booking.charges'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import { DayAlreadyClosedError } from '@/modules/cashflow/cashflow.errors'
import { getFirstActiveAdminStaffUserId } from '@/modules/staff/staff.service'
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
import {
  enqueueNotification,
  enqueueTenantOwnerNotification,
} from '@/modules/notifications/notification.service'
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
      // R1-B: exponer `won` de verdad (antes el comentario de más abajo lo
      // prometía pero `result` no lo reflejaba — result es 'confirmed' para
      // CUALQUIER pago approved, incluso el guard perdedor de
      // transitionFromPendingPayment sobre un booking ya post-terminal).
      won: approved.won,
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
 * Returned `won` flag is exposed via `WebhookOutcome.won` (R1-B: NOT via
 * `result`, which stays 'confirmed' for any approved payment regardless of
 * whether the booking transition actually won — the payment row is upserted
 * regardless to preserve audit trail; only the booking transition gates side
 * effects).
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
  if (result.won) {
    await recordDepositCashFlow(info, tenantId, tx)
    // doc7 Flujo 2 PASO 5: avisar al jugador por email que su reserva quedó
    // confirmada. Solo si el booking tiene jugador vinculado (las reservas
    // online siempre lo tienen; defensivo por si el tipo se relaja).
    const wonNotificationIds: string[] = []
    if (result.row?.playerId) {
      const ctxRows = await tx.execute(sql`
        SELECT c.name AS court_name, t.name AS tenant_name, t.address AS tenant_address,
               p.first_name AS player_first_name
        FROM bookings b
        JOIN courts c ON c.id = b.court_id
        JOIN tenants t ON t.id = b.tenant_id
        JOIN players p ON p.id = b.player_id
        WHERE b.id = ${info.externalReference}
        LIMIT 1
      `)
      const ctx = (ctxRows as unknown as Array<{
        court_name: string
        tenant_name: string
        tenant_address: string
        player_first_name: string
      }>)[0]
      if (ctx) {
        const id = await enqueueNotification(
          {
            tenantId,
            recipientType: 'player',
            recipientId: result.row.playerId,
            templateName: 'booking_confirmed',
            content: {
              playerFirstName: ctx.player_first_name,
              courtName: ctx.court_name,
              date: formatDateArs(result.row.date),
              timeStart: result.row.timeStart.slice(0, 5),
              timeEnd: result.row.timeEnd.slice(0, 5),
              tenantName: ctx.tenant_name,
              tenantAddress: ctx.tenant_address,
            },
            triggerEvent: 'booking.confirmed',
          },
          tx,
        )
        wonNotificationIds.push(id)
      }
    }
    return { won: true, row: result.row, notificationIds: wonNotificationIds }
  }

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

/**
 * ENS-21 (hallazgo de ensayo real): la seña cobrada por MP al confirmarse la
 * reserva no generaba fila en `cash_flows`, así que el reporte de caja del
 * día no la veía (el modelo ya lo contempla: `cash_flows.method` tiene
 * 'mercadopago' y `getDaySummary` la desglosa en `byMethod`). Se llama SOLO
 * desde la rama `won` de `handleApproved` — el guard de
 * `transitionFromPendingPayment` (won=false si el booking ya salió de
 * `pending_payment`) es lo que impide que un segundo evento MP distinto para
 * el mismo pago dispare esto una segunda vez, no hay idempotencia propia acá.
 *
 * `cash_flows.registered_by` es NOT NULL FK a `staff_users` y este evento lo
 * dispara el webhook, sin staff en contexto — se usa el primer admin activo
 * del tenant como actor "proxy", el mismo patrón ya establecido para
 * impersonación de SuperAdmin (`getFirstActiveAdminStaffUserId`,
 * impersonation.server.ts: "la identidad real queda en el audit log, pero
 * las filas necesitan un staff_user_id que exista en ese tenant"). Si el
 * tenant no tiene admin activo, o si la caja del día ya está cerrada
 * (`assertDayOpen` dentro de `createCashFlow`), esto se salta sin romper la
 * confirmación del booking — nunca vale la pena perder la confirmación (ya
 * pagada en MP) por un problema de atribución contable.
 *
 * `description` lleva el bookingId completo embebido (`depositCashFlowDescription`,
 * booking.charges.ts) — `getBookingCharges` (reservas/queries.ts) la excluye
 * por match exacto para no sumarla de nuevo sobre `depositCounted` (que ya
 * cuenta la seña vía `deposit_status`/`deposit_amount`) ni duplicarla en la
 * lista de "cobros de mostrador" de la UI.
 */
async function recordDepositCashFlow(
  info: GatewayPaymentInfo,
  tenantId: string,
  tx: DbTx,
): Promise<void> {
  const proxyStaffUserId = await getFirstActiveAdminStaffUserId(tenantId)
  if (!proxyStaffUserId) {
    captureMessage('deposit cash_flow skipped: no active admin to attribute it to', {
      level: 'warning',
      extra: { bookingId: info.externalReference, tenantId, mpPaymentId: info.mpPaymentId },
    })
    return
  }

  try {
    await createCashFlow(
      tenantId,
      proxyStaffUserId,
      {
        type: 'income',
        category: 'booking',
        amount: info.amount,
        method: 'mercadopago',
        description: depositCashFlowDescription(info.externalReference),
        bookingId: info.externalReference,
      },
      tx,
    )
  } catch (err) {
    if (err instanceof DayAlreadyClosedError) {
      captureMessage('deposit cash_flow skipped: cash register already closed for the day', {
        level: 'warning',
        extra: { bookingId: info.externalReference, tenantId, mpPaymentId: info.mpPaymentId },
      })
      return
    }
    // R1-A (rechazo review): antes esto relanzaba CUALQUIER otro error, lo que
    // hacía ROLLBACK de la tx completa — incluida la transición
    // pending_payment→confirmed que YA había ganado unas líneas más arriba
    // (handleApproved solo llega acá dentro de la rama `won`). Un pago que MP
    // ya capturó nunca puede perderse por un problema de contabilidad
    // secundaria (el cash_flow es reconstruible a mano desde la fila
    // `payments` approved; la confirmación del booking, no).
    captureMessage('deposit cash_flow skipped: unexpected error recording it', {
      level: 'warning',
      extra: {
        bookingId: info.externalReference,
        tenantId,
        mpPaymentId: info.mpPaymentId,
        error: err instanceof Error ? err.message : String(err),
      },
    })
  }
}

/**
 * Centavos ARS → es-AR string, e.g. 300000 → "3.000,00". Exportado (ENS-19):
 * el worker de retry de refunds arma el mismo formato para su alerta al
 * dueño, sin duplicar el helper.
 */
export function formatArs(cents: number): string {
  return (Math.round(cents) / 100).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Date (columna DATE, sin componente horario) → "DD/MM/YYYY". */
function formatDateArs(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getUTCFullYear()}`
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
 * INSERT...ON CONFLICT (mp_payment_id) DO UPDATE, re-linked first.
 *
 * MP can emit multiple events for the same payment (`pending` → `in_process` →
 * `approved`). The same MP payment id reuses the same payment row; only the
 * status + processed_at evolve.
 *
 * `processed_webhooks.mp_event_id` blocks duplicate **events**; this UPSERT
 * handles distinct events about the same payment.
 *
 * `createDepositPayment` already pointed `bookings.payment_id` at an "intent"
 * row (status='pending', mp_payment_id=NULL) before MP was ever called. On the
 * FIRST event for a booking, re-link that same row (UPDATE by
 * `p.id = b.payment_id AND p.mp_payment_id IS NULL`) instead of inserting a
 * new one — otherwise `bookings.payment_id` keeps pointing at a row that never
 * gets an `mp_payment_id`, and `createRefund` (which reads `bookings.payment_id`)
 * throws `RefundInvalidStateError` on every cancellation with a paid deposit.
 * Once re-linked, subsequent events for the same `mp_payment_id` fall through
 * to the ON CONFLICT branch below and keep updating that same row.
 */
async function upsertPaymentRow(
  info: GatewayPaymentInfo,
  tenantId: string,
  status: 'pending' | 'in_process' | 'approved' | 'rejected' | 'refunded',
  tx: DbTx,
): Promise<void> {
  const relinked = await tx.execute(sql`
    UPDATE payments p
    SET mp_payment_id = ${info.mpPaymentId},
        status = ${status}::payment_status,
        amount = ${info.amount},
        processed_at = ${status === 'approved' || status === 'in_process' ? sql`NOW()` : sql`NULL`}
    FROM bookings b
    WHERE b.id = ${info.externalReference}
      AND p.id = b.payment_id
      AND p.mp_payment_id IS NULL
    RETURNING p.id
  `)
  if ((relinked as unknown as Array<{ id: string }>).length > 0) return

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

export type PreparedRefund = {
  refundPaymentId: string
  mpPaymentId: string
  refundAmount: number
}

/**
 * Refund, phase 1 ("prepare"). NEW row in `payments` (type='refund',
 * status='pending', mp_payment_id=NULL — a refund "intent", same shape as the
 * deposit intent row `createDepositPayment` inserts). Original payment is
 * immutable (Payment Invariante 1). NO `cash_flow` row generated (Fix #9,
 * Fase 3): la seña nunca tocó caja física; MP procesa el refund directo entre
 * cuentas.
 *
 * Runs inside the CALLER's transaction (cancelByPlayer/cancelByAdmin) so the
 * booking cancellation and the refund-intent row commit atomically. Does NOT
 * call MP — see `settleRefund` for phase 2. Splitting it this way fixes a
 * money bug: calling `gateway.createRefund` from inside this same transaction
 * meant a later failure in the SAME tx (a lock timeout, a downstream insert
 * throwing, a crash before commit) rolled back the local refund record while
 * MP had already sent the money back — a retry would then refund a second
 * time, because nothing local recorded the first one.
 */
export async function prepareRefund(
  paymentId: string,
  amount: number | undefined,
  tx: DbTx,
): Promise<PreparedRefund> {
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
      status: 'pending',
      description: `Refund of ${original.id}`,
    })
    .returning({ id: payments.id })

  return {
    refundPaymentId: inserted[0]!.id,
    mpPaymentId: original.mpPaymentId,
    refundAmount,
  }
}

/**
 * Refund, phase 2 ("settle"). Calls MP with NO open transaction, then persists
 * the outcome in a short tx of its own.
 *
 * The idempotency key is the refund-intent row's OWN id, not the original
 * payment's id: a booking can have more than one refund against the same
 * original payment (the over-refund guard in `prepareRefund` explicitly sums
 * PRIOR refunds, so partial refunds are anticipated), and keying by the
 * original payment would make MP treat two distinct partial refunds as the
 * same request. Keying by the refund row's id is still deterministic across
 * RETRIES of settling the SAME attempt (a caller that re-invokes settleRefund
 * for a refund stuck in 'pending' — e.g. after a crash between the MP call and
 * this function's own tx — reuses the same key, so MP returns the original
 * result instead of refunding twice).
 */
export async function settleRefund(
  prepared: PreparedRefund,
  gateway: PaymentGateway,
  tenantId: string,
): Promise<{ status: 'approved' | 'pending' }> {
  const refund = await gateway.createRefund(
    prepared.mpPaymentId,
    prepared.refundAmount,
    `refund:${prepared.refundPaymentId}`,
  )
  const status = refund.status === 'approved' ? ('approved' as const) : ('pending' as const)

  await withTenantContext(tenantId, async (tx) => {
    await tx
      .update(payments)
      .set({ mpPaymentId: refund.mpRefundId, status })
      .where(eq(payments.id, prepared.refundPaymentId))
  })

  return { status }
}

