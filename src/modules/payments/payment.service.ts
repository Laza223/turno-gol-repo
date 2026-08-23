import { eq, sql } from 'drizzle-orm'
import { bookings, payments } from '@/shared/db/schema'
import { withTenantContext, type DbTx } from '@/shared/db/client'
import { insertSystemAuditLog } from '@/shared/db/audit'
import { transitionFromPendingPayment } from '@/modules/bookings/booking.concurrency'
import { rowToBookingRow } from '@/modules/bookings/booking.mappers'
import type { BookingRow } from '@/modules/bookings/booking.types'
import { depositCashFlowDescription } from '@/modules/bookings/booking.charges'
import { createCashFlow } from '@/modules/cashflow/cashflow.service'
import { DayAlreadyClosedError } from '@/modules/cashflow/cashflow.errors'
import { getFirstActiveAdminStaffUserId } from '@/modules/staff/staff.service'
import { holdExpiresAtMs } from '@/lib/booking/hold'
import type { PaymentGateway } from './mp-gateway'
import type {
  CreatePreferenceInput,
  GatewayPaymentInfo,
  PreferenceResult,
  PreparedRefund,
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
import { captureException, captureMessage } from '@/lib/sentry'
import { logger } from '@/shared/lib/logger'

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

  const { depositAmount, createdAt, paymentId } = await withTenantContext(tenantId, async (tx) => {
    const lockRows = await tx.execute(sql`
        SELECT id, player_id AS "playerId",
               deposit_amount AS "depositAmount", status, created_at AS "createdAt"
        FROM bookings
        WHERE id = ${bookingId}
        FOR UPDATE
      `)
    const booking = (
      lockRows as unknown as Array<{
        id: string
        playerId: string | null
        depositAmount: number
        status: string
        // B8: `tx.execute` no parsea timestamptz — llega string, no Date
        // (tabla de tipos en `src/shared/db/client.ts`). Lo salva que el
        // consumidor hace `new Date(createdAt).getTime()`; con el tipo mintiendo,
        // un `.getTime()` directo compilaba y daba NaN, o sea un hold que nunca
        // vence.
        createdAt: string
      }>
    )[0]
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
  })

  const preferredExpiresAtMs =
    holdExpiresAtMs(createdAt) - MP_PREFERENCE_SAFETY_BUFFER_SECONDS * 1000
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
export async function lockMpEvent(event: WebhookEvent, tx: DbTx): Promise<boolean> {
  // `payload` va como OBJETO crudo, NO `JSON.stringify(...)`: el serializer del
  // OID jsonb 3802 lo serializa una sola vez (con stringify previo quedaba
  // double-encoded). Ver [[audit-logs-metadata-double-encoded]] + dunning.service.
  const lock = await tx.execute(sql`
    INSERT INTO processed_webhooks (mp_event_id, event_type, payload)
    VALUES (${event.mpEventId}, ${event.eventType}, ${event.rawPayload}::jsonb)
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
      // Reembolso automático del pago tardío (2026-08-19): el intent ya está
      // en la tx; el caller lo liquida contra MP DESPUÉS del commit, igual
      // que hace con `notificationIds`.
      preparedRefund: approved.preparedRefund,
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

    // Hallazgo recon 🔴 (D4): un refund hecho directo desde el dashboard de MP
    // (fuera de prepareRefund/settleRefund) llega acá igual, como webhook
    // status='refunded' — el upsert de arriba pisa la fila `payments` sin
    // dejar rastro de que fue EXTERNO, y `bookings.deposit_status` quedaba
    // 'paid' divergiendo en silencio del estado real en MP.
    //
    // DECIDIDO (dueño, 2026-08-05): se reconcilia el booking
    // (`deposit_status` → 'refunded') y se avisa SOLO al admin por mail. Al
    // jugador NO: el complejo hizo ese reembolso por afuera y puede tener una
    // conversación en curso con él. Ver el UPDATE más abajo.
    const refundedRows = await tx.execute(sql`
      SELECT id FROM payments WHERE mp_payment_id = ${info.mpPaymentId} LIMIT 1
    `)
    const refundedPaymentId = (refundedRows as unknown as Array<{ id: string }>)[0]?.id ?? null

    // Fix H1 (D4): el propio flujo LOCAL de cancelación (cancelByAdmin/
    // cancelByPlayer → prepareRefund → settleRefund) hace que MP mande este
    // mismo webhook eco status='refunded' del pago ORIGINAL cuando confirma un
    // refund que TurnoGol mismo inició — sin este check, la alerta de "refund
    // externo" disparaba en CADA cancelación-con-reembolso rutinaria (falso
    // positivo sistemático). `prepareRefund` deja el vínculo local en una fila
    // `payments` con type='refund' y `description = 'Refund of ' + <id del pago
    // original>` (mismo patrón que usa el guard de sobre-refund ahí mismo,
    // payment.service.ts arriba). Si esa fila existe, es un refund local
    // conocido: cancelByAdmin/cancelByPlayer ya dejan su propio audit trail,
    // así que no se duplica alerta acá. Si no existe, sigue siendo un refund
    // externo genuino y se alerta como antes.
    let hasKnownLocalRefund = false
    if (refundedPaymentId) {
      const localRefundRows = await tx.execute(sql`
        SELECT id FROM payments
        WHERE type = 'refund'
          AND description = ${'Refund of ' + refundedPaymentId}
        LIMIT 1
      `)
      hasKnownLocalRefund = (localRefundRows as unknown as Array<{ id: string }>).length > 0
    }

    if (!hasKnownLocalRefund) {
      // 🔴 El filtro por `status` NO es defensa de más: `enforce_booking_invariants_fn`
      // (migr. 070) hace RAISE EXCEPTION ante CUALQUIER UPDATE sobre un booking
      // en estado terminal. Sin ese WHERE, un reembolso externo sobre un turno
      // ya jugado/ausente/cancelado abortaría la transacción entera del webhook
      // y el job terminaría en la DLQ para siempre.
      //
      // Y de paso protege `deposit_status='captured'` gratis: ese valor SIEMPRE
      // se escribe en el mismo UPDATE que fija `no_show`/`canceled_no_refund`
      // (booking.service.ts:791, booking.cancellation.ts:352-370), así que nunca
      // existe junto a un status no terminal. La seña capturada de un no-show no
      // se pisa: se avisa y la mira el dueño.
      //
      // Idempotente: un segundo evento MP del mismo refund no matchea
      // `deposit_status IN ('paid','captured')` porque ya quedó en 'refunded'
      // → 0 filas, no-op. (El mismo `mp_event_id` ni llega: lo dedupea `lockMpEvent`.)
      //
      // `booking.status` NO se toca. Cancelar el turno y liberar el horario es
      // una decisión del complejo, no del webhook.
      const reconciledRows = await tx.execute(sql`
        UPDATE bookings
        SET deposit_status = 'refunded', updated_at = NOW()
        WHERE id = ${info.externalReference}
          AND status IN ('confirmed', 'pending_payment')
          AND deposit_status IN ('paid', 'captured')
        RETURNING id
      `)
      const reconciled = (reconciledRows as unknown as Array<{ id: string }>).length > 0

      // Solo en el camino no feliz: qué estado tenía, para que el mail le diga
      // al dueño por qué tiene que mirarlo a mano.
      let bookingStatus: string | null = null
      if (!reconciled) {
        const statusRows = await tx.execute(sql`
          SELECT status FROM bookings WHERE id = ${info.externalReference} LIMIT 1
        `)
        bookingStatus = (statusRows as unknown as Array<{ status: string }>)[0]?.status ?? null
      }

      await insertSystemAuditLog(tx, {
        tenantId,
        action: 'payment.external_refund_detected',
        resourceType: 'booking',
        resourceId: info.externalReference,
        metadata: {
          paymentId: refundedPaymentId,
          mpPaymentId: info.mpPaymentId,
          bookingId: info.externalReference,
          amount: info.amount,
          reconciled,
          bookingStatus,
        },
      })
      captureMessage(
        'external refund detected: MP status=refunded without a local prepareRefund/settleRefund flow',
        {
          level: 'warning',
          extra: {
            paymentId: refundedPaymentId,
            mpPaymentId: info.mpPaymentId,
            bookingId: info.externalReference,
            amount: info.amount,
            tenantId,
          },
        },
      )

      // Solo al rol admin: es plata y MP, el mismo criterio con el que
      // `requireAdminStaffAction` le cierra facturación al encargado. Los ids
      // vuelven en el outcome y `mp-webhook.handler.ts` los despacha DESPUÉS
      // del commit (mandar el mail acá dejaría avisos de una tx que puede
      // abortar). Al jugador no se le encola nada, a propósito.
      const notificationIds = await enqueueTenantOwnerNotification(
        {
          tenantId,
          templateName: 'admin_external_refund_detected',
          content: {
            bookingId: info.externalReference,
            amountArs: formatArs(info.amount),
            reconciled,
            ...(bookingStatus ? { bookingStatus } : {}),
          },
          triggerEvent: 'payment.external_refund_detected',
        },
        tx,
        { onlyRole: 'admin' },
      )

      return { alreadyProcessed: false, result: 'refunded', notificationIds }
    }

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
): Promise<{
  won: boolean
  row?: BookingRow
  notificationIds: string[]
  preparedRefund?: PreparedRefund
}> {
  // Fetch expected deposit before upserting so we can compare amounts.
  const depRows = await tx.execute(sql`
    SELECT deposit_amount AS "depositAmount"
    FROM bookings
    WHERE id = ${info.externalReference}
    LIMIT 1
  `)
  const depositAmount =
    (depRows as unknown as Array<{ depositAmount: number }>)[0]?.depositAmount ?? info.amount

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

  const result = await transitionFromPendingPayment(info.externalReference, 'confirmed', tx)
  if (result.won) {
    const wonNotificationIds: string[] = []
    wonNotificationIds.push(...(await recordDepositCashFlow(info, tenantId, tx)))
    // doc7 Flujo 2 PASO 5: avisar al jugador por email que su reserva quedó
    // confirmada. Solo si el booking tiene jugador vinculado (las reservas
    // online siempre lo tienen; defensivo por si el tipo se relaja).
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
      const ctx = (
        ctxRows as unknown as Array<{
          court_name: string
          tenant_name: string
          tenant_address: string
          player_first_name: string
        }>
      )[0]
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
    SELECT b.status, c.name AS court_name, b.date::text AS date,
           b.time_start::text AS time_start,
           b.player_id AS player_id,
           p.first_name AS player_first_name,
           t.name AS tenant_name
    FROM bookings b
    JOIN courts c ON c.id = b.court_id
    JOIN tenants t ON t.id = b.tenant_id
    LEFT JOIN players p ON p.id = b.player_id
    WHERE b.id = ${info.externalReference}
  `)
  const row = (
    cur as unknown as Array<{
      status: string
      court_name: string
      date: string
      time_start: string
      player_id: string | null
      player_first_name: string | null
      tenant_name: string
    }>
  )[0]
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

    // Reembolso AUTOMÁTICO del pago tardío (decisión del dueño 2026-08-19,
    // docs/decisions/2026-08-19-pago-tardio-reembolso-automatico.md). Antes
    // esto solo auditaba y le mandaba un mail al complejo pidiéndole "acción
    // manual": mientras tanto el jugador tenía la plata cobrada y ningún turno.
    //
    // SOLO sobre `expired`, no sobre todo TERMINAL_BOOKING_STATUSES. Los otros
    // cuatro terminales NO deben auto-reembolsarse y no es un recorte del
    // alcance sino la única lectura correcta: `completed`/`no_show` significan
    // que el turno se consumió (la plata es del complejo), `canceled_no_refund`
    // es una política de cancelación que este camino estaría contradiciendo, y
    // `canceled_refunded` ya tiene su reembolso (o uno en vuelo). Para esos
    // cuatro el comportamiento queda EXACTAMENTE como estaba: auditoría + mail
    // al complejo.
    const preparedRefund =
      row.status === 'expired' ? await prepareLatePaymentRefund(info, tx) : undefined

    // Hallazgo 3: don't just bury it in audit_logs — alert the admin prominently.
    // El mail sigue saliendo con reembolso automático: el complejo tiene que
    // enterarse de que le entró y le salió plata. La copy cambia según si se
    // reembolsó solo o si todavía necesita que un humano decida.
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
          refundIssued: preparedRefund !== undefined,
        },
        triggerEvent: 'booking.late_payment_attempt',
      },
      tx,
    )
    notificationIds.push(...ids)

    // Punto 2 de la decisión: al jugador no se le avisaba NADA. Es el único que
    // puso plata.
    if (preparedRefund && row.player_id) {
      const playerNotificationId = await enqueueNotification(
        {
          tenantId,
          recipientType: 'player',
          recipientId: row.player_id,
          templateName: 'player_late_payment_refunded',
          content: {
            playerFirstName: row.player_first_name ?? '',
            courtName: row.court_name,
            date: row.date.slice(0, 10).split('-').reverse().join('/'),
            timeStart: row.time_start.slice(0, 5),
            tenantName: row.tenant_name,
            amountArs: formatArs(preparedRefund.refundAmount),
          },
          triggerEvent: 'payment.late_payment_refunded',
        },
        tx,
      )
      notificationIds.push(playerNotificationId)
    }

    return { won: false, notificationIds, preparedRefund }
  }
  return { won: false, notificationIds }
}

/**
 * Prepara (fase 1) el reembolso de un pago que MP aprobó DESPUÉS de que la
 * reserva expirara. Devuelve `undefined` —sin tirar— cuando no hay nada que
 * reembolsar; el caller trata eso como "seguí con la auditoría y el mail".
 *
 * Idempotencia: NO se apoya en la clave del evento de MP
 * (`processed_webhooks`). Al mismo pago aprobado se puede llegar por cuatro
 * caminos con claves DISTINTAS —el webhook real (`<mpEventId>`), el precheck
 * de expiración y los dos pases del worker de reconciliación (los tres con
 * `reconcile-<mpPaymentId>`)—, así que una clave de evento no puede impedir el
 * doble reembolso: la única barrera que los cubre a todos es preguntar por el
 * PAGO ORIGINAL. `prepareRefund` ya tiene su propio guard de sobre-reembolso,
 * pero tira `RefundAmountExceedsOriginalError`; acá se chequea antes para poder
 * salir en silencio (un segundo camino llegando al mismo pago es lo esperado,
 * no un error) y, sobre todo, para no mandarle al jugador un segundo mail
 * diciéndole que le devolvieron la plata otra vez.
 */
async function prepareLatePaymentRefund(
  info: GatewayPaymentInfo,
  tx: DbTx,
): Promise<PreparedRefund | undefined> {
  const originalRows = await tx.execute(sql`
    SELECT id FROM payments
    WHERE mp_payment_id = ${info.mpPaymentId} AND type = 'deposit'
    LIMIT 1
  `)
  const originalId = (originalRows as unknown as Array<{ id: string }>)[0]?.id
  if (!originalId) {
    // `upsertPaymentRow` corrió unas líneas más arriba en ESTA misma tx, así
    // que la fila tiene que existir. Si no está, la plata entró y no hay contra
    // qué reembolsarla: es exactamente el caso que nadie puede ver solo.
    captureMessage('late_payment: deposit row not found for refund', {
      level: 'error',
      extra: { bookingId: info.externalReference, mpPaymentId: info.mpPaymentId },
    })
    return undefined
  }

  const already = await tx.execute(sql`
    SELECT 1 FROM payments
    WHERE type = 'refund'
      AND status IN ('approved', 'pending')
      AND description = ${'Refund of ' + originalId}
    LIMIT 1
  `)
  if ((already as unknown[]).length > 0) return undefined

  return prepareRefund(originalId, undefined, tx)
}

/**
 * Fase 2 del reembolso de un pago tardío: llama a MP. Va DESPUÉS del commit de
 * la tx que preparó el intent (misma frontera que `dispatchEmail` y el push de
 * admin) — `settleRefund` abre su propia tx corta y no puede correr adentro de
 * la del caller sin dejar la conexión colgada durante el round trip HTTP.
 *
 * No tira NUNCA: la fila de intent ya está commiteada, así que si MP falla el
 * cron `retry-pending-refunds` la levanta dentro de la hora reusando la misma
 * idempotency key (`refund:<refundPaymentId>`) y, si sigue trabada 24h, le
 * avisa al complejo. Propagar el error acá solo lograría que pg-boss reintente
 * todo el job y vuelva a pasar por el camino que ya hizo su parte.
 */
export async function settleLatePaymentRefund(
  prepared: PreparedRefund,
  tenantId: string,
  gateway: PaymentGateway,
): Promise<void> {
  try {
    const result = await settleRefund(prepared, gateway, tenantId)
    track.payment('payment.late_payment.refunded', {
      tenantId,
      paymentId: prepared.refundPaymentId,
      mpPaymentId: prepared.mpPaymentId,
      amountCents: prepared.refundAmount,
    })
    // `pending` = MP aceptó el pedido pero todavía no lo acreditó; el cron
    // `retry-pending-refunds` lo sigue hasta `approved` y alerta si se traba.
    logger.info('late_payment: refund settled', {
      module: 'payments',
      refundPaymentId: prepared.refundPaymentId,
      status: result.status,
    })
  } catch (err) {
    logger.error('late_payment: settle refund failed, dejándolo al cron de retry', {
      module: 'payments',
      refundPaymentId: prepared.refundPaymentId,
      error: err instanceof Error ? err.message : String(err),
    })
    captureException(err, {
      extra: { refundPaymentId: prepared.refundPaymentId, tenantId },
    })
  }
}

/** Métodos que el staff puede elegir al confirmar una seña a mano (nunca 'mercadopago': esa la confirma el webhook). */
export type ManualDepositMethod = 'cash' | 'transfer' | 'other'

export type ConfirmManualDepositOutcome =
  { won: false } | { won: true; booking: BookingRow; notificationIds: string[] }

/**
 * Confirmación MANUAL de una seña (efectivo/transferencia/otro), disparada por
 * `confirmDepositPaymentAction` (reservas/actions.ts) cuando el staff cobra en
 * el mostrador — hermana de `handleApproved` (mismo trabajo para MP). Usa la
 * misma primitiva race-safe que el webhook (`transitionFromPendingPayment`):
 * si el booking ya salió de `pending_payment` (otro worker/webhook/cron ganó
 * la carrera), `won=false` y no se toca nada más — mismo contrato de siempre.
 *
 * Bug real que esto corrige: si el jugador había arrancado (y abandonado o
 * rechazado) un checkout de MP antes de que el staff confirmara el cobro en
 * efectivo, `createDepositPayment` ya había pisado
 * `bookings.payment_method='mercadopago'` + `payment_id=<fila payments
 * 'pending', nunca 'approved'>`. Sin corregir eso, el booking queda con un
 * método de pago mentiroso y, peor, con un `payment_id` que una cancelación
 * posterior intenta refundar vía MP — `prepareRefund` tira
 * `RefundInvalidStateError` porque ese pago nunca fue aprobado.
 *
 * `payment_id=NULL` es OBLIGATORIO en el UPDATE:
 * `chk_booking_payment_consistency` (schema/bookings.ts) exige
 * `payment_id IS NULL` para `payment_method IN ('cash', 'transfer', 'other')`
 * — sin esto el UPDATE viola el CHECK constraint. No hace falta un `FOR
 * UPDATE` propio acá: el UPDATE de `transitionFromPendingPayment` ya tomó el
 * row lock del booking hasta el commit de esta tx (mismo razonamiento que
 * `completeAndChargeBookingAction`, reservas/actions.ts).
 */
export async function confirmManualDepositPayment(
  bookingId: string,
  method: ManualDepositMethod,
  staffUserId: string,
  tenantId: string,
  tx: DbTx,
): Promise<ConfirmManualDepositOutcome> {
  const result = await transitionFromPendingPayment(bookingId, 'confirmed', tx)
  if (!result.won) return { won: false }

  const updatedRows = await tx
    .update(bookings)
    .set({ paymentMethod: method, paymentId: null, updatedAt: new Date() })
    .where(eq(bookings.id, bookingId))
    .returning()
  const booking = rowToBookingRow(updatedRows[0]!)

  const notificationIds = await recordManualDepositCashFlow(
    booking,
    method,
    staffUserId,
    tenantId,
    tx,
  )

  return { won: true, booking, notificationIds }
}

/**
 * Inserta el cash_flow de ingreso por la seña confirmada A MANO por el staff
 * (efectivo/transferencia/otro) — hermana de `recordDepositCashFlow` de acá
 * abajo (seña MP, actor proxy). Acá SÍ hay un staff autenticado real en
 * contexto, no hace falta el proxy `getFirstActiveAdminStaffUserId`. Mismo
 * patrón defensivo que `recordDepositCashFlow`: si la caja del día ya cerró,
 * no deja que `DayAlreadyClosedError` escape — la plata YA la cobró el staff
 * en la realidad, jamás vale la pena perder la confirmación del booking por
 * un problema de atribución contable secundaria. Se duplica el patrón en vez
 * de compartir código con `recordDepositCashFlow` para no arriesgar el
 * comportamiento observable del flujo automático de MP.
 */
async function recordManualDepositCashFlow(
  booking: BookingRow,
  method: ManualDepositMethod,
  staffUserId: string,
  tenantId: string,
  tx: DbTx,
): Promise<string[]> {
  try {
    await createCashFlow(
      tenantId,
      staffUserId,
      {
        type: 'income',
        category: 'booking',
        amount: booking.depositAmount,
        method,
        description: depositCashFlowDescription(booking.id),
        bookingId: booking.id,
      },
      tx,
    )
  } catch (err) {
    if (err instanceof DayAlreadyClosedError) {
      captureMessage('deposit cash_flow skipped: cash register already closed for the day', {
        level: 'warning',
        extra: { bookingId: booking.id, tenantId, method },
      })
      // Mismo contrato que el caso MP: el email se despacha DESPUÉS del commit
      // de la tx (los ids viajan en el outcome, el caller los despacha).
      return enqueueTenantOwnerNotification(
        {
          tenantId,
          templateName: 'admin_deposit_after_close',
          content: {
            bookingId: booking.id,
            amountArs: formatArs(booking.depositAmount),
            // Sin esto el mail decía "por Mercado Pago" para una seña que el
            // staff cobró en efectivo: el dueño la buscaba en el panel de MP en
            // vez de en el cajón.
            method,
          },
          triggerEvent: 'payment.deposit_after_close',
        },
        tx,
      )
    }
    // Mismo motivo que R1-A (más abajo, caso MP): una seña YA cobrada por el
    // staff nunca puede perderse por un problema de contabilidad secundaria.
    captureMessage('deposit cash_flow skipped: unexpected error recording it', {
      level: 'warning',
      extra: {
        bookingId: booking.id,
        tenantId,
        method,
        error: err instanceof Error ? err.message : String(err),
      },
    })
  }
  return []
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
): Promise<string[]> {
  const proxyStaffUserId = await getFirstActiveAdminStaffUserId(tenantId)
  if (!proxyStaffUserId) {
    captureMessage('deposit cash_flow skipped: no active admin to attribute it to', {
      level: 'warning',
      extra: { bookingId: info.externalReference, tenantId, mpPaymentId: info.mpPaymentId },
    })
    return []
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
      // Las otras dos ramas de "plata sorpresa" (booking not found / late
      // payment terminal) ya alertan al dueño; esta era la única que dejaba
      // la plata invisible salvo por el warning de Sentry. Mismo contrato que
      // admin_late_payment: el email se despacha DESPUÉS del commit de la tx
      // (los ids viajan en WebhookOutcome.notificationIds).
      return enqueueTenantOwnerNotification(
        {
          tenantId,
          templateName: 'admin_deposit_after_close',
          content: {
            bookingId: info.externalReference,
            amountArs: formatArs(info.amount),
            method: 'mercadopago',
          },
          triggerEvent: 'payment.deposit_after_close',
        },
        tx,
      )
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
  return []
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

// Re-export: `PreparedRefund` se mudó a payment.types.ts (WebhookOutcome lo
// expone y no puede importar del service). Los callers que ya lo importaban de
// acá siguen andando.
export type { PreparedRefund }

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
  const original = (
    lockRows as unknown as Array<{
      id: string
      tenantId: string
      bookingId: string | null
      playerId: string | null
      amount: number
      type: string
      status: string
      mpPaymentId: string | null
    }>
  )[0]
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
    // Total = cubre el pago entero Y no hay nada reembolsado antes. Con un
    // refund previo, aunque este cubra el saldo, contra MP sigue siendo parcial.
    isTotal: priorTotal === 0 && refundAmount === original.amount,
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
    // `undefined` = POST sin body = reembolso TOTAL. Ver `isTotal`.
    prepared.isTotal ? undefined : prepared.refundAmount,
    `refund:${prepared.refundPaymentId}`,
  )
  const status = refund.status === 'approved' ? ('approved' as const) : ('pending' as const)

  await withTenantContext(tenantId, async (tx) => {
    await tx
      .update(payments)
      .set({
        mpPaymentId: refund.mpRefundId,
        status,
        // `processed_at` = cuándo se movió la plata de verdad. Solo se sella si
        // MP la dio por aprobada: en `pending` el dinero todavía no salió, y la
        // fila sigue siendo una deuda de devolución hasta que alguien la salde.
        ...(status === 'approved' ? { processedAt: new Date() } : {}),
      })
      .where(eq(payments.id, prepared.refundPaymentId))
  })

  return { status }
}
