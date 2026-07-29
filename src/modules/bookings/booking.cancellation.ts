import { eq, sql } from 'drizzle-orm'
import { bookings, tenants } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'
import { prepareRefund, type PreparedRefund } from '@/modules/payments/payment.service'
import type { PaymentGateway } from '@/modules/payments/mp-gateway'
import type { TenantSettings } from '@/modules/tenants/tenant.types'
import { applyNoShowStrike, revertNoShowStrike } from '@/modules/relationships/ptr.service'
import { markNoShow, revertNoShow } from './booking.service'
import { invalidateCourtDateSlots } from '@/shared/cache/slots-cache'
import { rowToBookingRow } from './booking.mappers'
import { enqueueNotification } from '@/modules/notifications/notification.service'
import { captureMessage } from '@/lib/sentry'
import {
  BookingNotInConfirmedError,
  BookingNotOwnedByPlayerError,
  RefundUnavailableError,
  TenantInactiveError,
} from './booking.errors'
import type { BookingRow, DepositStatus } from './booking.types'
import { track } from '@/shared/observability'

export type AdminCancellationType = 'complejo' | 'jugador'

/**
 * Tarea #3: el motivo decide el reembolso, el admin ya no elige a ciegas.
 * - 'complejo' (rotura / mantenimiento / error del admin): reembolso SIEMPRE,
 *   sin importar el plazo — no es culpa del jugador.
 * - 'jugador' (pidió por teléfono): aplica la política normal — dentro del
 *   plazo reembolsa, fuera retiene.
 * `inPolicy` se devuelve para el rastro de auditoría (también en el caso
 * 'complejo', donde no afecta la decisión pero documenta el contexto).
 *
 * Bug B3 (guard de turno YA TERMINADO): si `nowMs >= bookingEndUtcMs` el
 * servicio ya se prestó — el admin puede cancelar sin reembolso, pero NUNCA
 * reembolsar, ni siquiera con cancellationType='complejo'. Este guard corta
 * el camino antes de mirar el motivo.
 */
export function decideAdminRefund(opts: {
  cancellationType: AdminCancellationType
  bookingStartUtcMs: number
  bookingEndUtcMs: number
  policyHours: number
  nowMs: number
}): { shouldRefund: boolean; inPolicy: boolean } {
  const inPolicy =
    opts.nowMs < opts.bookingStartUtcMs - opts.policyHours * 3_600_000
  const turnoTermino = opts.nowMs >= opts.bookingEndUtcMs
  const shouldRefund = turnoTermino
    ? false
    : opts.cancellationType === 'complejo'
      ? true
      : inPolicy
  return { shouldRefund, inPolicy }
}

type LockedBooking = {
  id: string
  tenant_id: string
  court_id: string
  player_id: string | null
  status: string
  deposit_status: string
  deposit_amount: number
  payment_id: string | null
  date: string        // 'YYYY-MM-DD'
  time_start: string  // 'HH:MM:SS'
  starts_at: Date
  ends_at: Date
}

async function lockBooking(bookingId: string, tx: DbTx): Promise<LockedBooking | undefined> {
  const result = await tx.execute(sql`
    SELECT
      id,
      tenant_id,
      court_id,
      player_id,
      status,
      deposit_status,
      deposit_amount,
      payment_id,
      date::text AS date,
      time_start::text AS time_start,
      starts_at,
      ends_at
    FROM bookings
    WHERE id = ${bookingId}
    FOR UPDATE
  `)
  return (result as unknown as LockedBooking[])[0]
}

/**
 * Blindaje defensivo (ver `confirmManualDepositPayment`, payment.service.ts):
 * lee el `status` real del payment vinculado, DENTRO de la misma tx que ya
 * lockeó el booking (mismo tipo de query que `lockBooking`, sin FOR UPDATE
 * porque acá solo se lee, nunca se muta esta fila). Distingue "seña MP
 * realmente aprobada, refundeable" de "payment_id apunta a un pago que nunca
 * se aprobó" — con el fix de `confirmManualDepositPayment`, `payment_id`
 * nunca queda seteado en un booking con seña confirmada a mano, así que este
 * caso es cinturón-y-tirantes (datos legacy/corruptos), no el camino
 * principal esperado.
 */
async function isPaymentApproved(paymentId: string, tx: DbTx): Promise<boolean> {
  const rows = await tx.execute(sql`
    SELECT status FROM payments WHERE id = ${paymentId} LIMIT 1
  `)
  const row = (rows as unknown as Array<{ status: string }>)[0]
  return row?.status === 'approved'
}

async function loadSettings(tenantId: string, tx: DbTx): Promise<TenantSettings> {
  const rows = await tx
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  return rows[0]!.settings as TenantSettings
}

/** Date (columna DATE, sin componente horario) → "DD/MM/YYYY". */
function formatDateArs(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getUTCFullYear()}`
}

async function loadCancelEmailNames(
  tenantId: string,
  courtId: string,
  playerId: string,
  tx: DbTx,
): Promise<{ courtName: string; tenantName: string; playerFirstName: string } | undefined> {
  const rows = await tx.execute(sql`
    SELECT c.name AS court_name, t.name AS tenant_name, p.first_name AS player_first_name
    FROM courts c, tenants t, players p
    WHERE c.id = ${courtId} AND t.id = ${tenantId} AND p.id = ${playerId}
  `)
  const row = (rows as unknown as Array<{
    court_name: string
    tenant_name: string
    player_first_name: string
  }>)[0]
  if (!row) return undefined
  return { courtName: row.court_name, tenantName: row.tenant_name, playerFirstName: row.player_first_name }
}

export type CancellationOutcome = {
  booking: BookingRow
  /** Set when a paid MP deposit was refunded. Caller must pass this to
   * `settleRefund` AFTER this function's transaction commits — see
   * `prepareRefund`'s doc comment for why the MP call can't happen in here. */
  pendingRefund?: PreparedRefund
  /**
   * IDs de notificaciones encoladas dentro de esta tx (doc7 Flujo 4:
   * booking_canceled / booking_canceled_by_complex al jugador). El caller
   * debe despacharlas con `dispatchEmail` DESPUÉS de que la tx commitee —
   * mismo patrón que `admin_late_payment` en payment.service.ts.
   */
  notificationIds: string[]
}

export async function cancelByPlayer(
  bookingId: string,
  playerId: string,
  reason: string | undefined,
  gateway: PaymentGateway | null,
  tx: DbTx,
): Promise<CancellationOutcome> {
  track.booking('booking.cancel.by_player', { bookingId, playerId })

  const b = await lockBooking(bookingId, tx)
  if (!b) throw new BookingNotInConfirmedError(bookingId)
  if (b.player_id !== playerId) throw new BookingNotOwnedByPlayerError(bookingId, playerId)
  if (b.status !== 'confirmed') throw new BookingNotInConfirmedError(bookingId)

  // Hallazgo 8: reject cancellation when the complejo is in a terminal/inactive
  // state. Otherwise a player could trigger an automatic refund against an MP
  // account that was deleted or delinked.
  const tenantRows = await tx
    .select({ status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, b.tenant_id))
    .limit(1)
  const tenantStatus = tenantRows[0]?.status
  if (!tenantStatus || tenantStatus === 'deleted' || tenantStatus === 'blocked') {
    throw new TenantInactiveError(b.tenant_id, tenantStatus ?? 'unknown')
  }

  const settings = await loadSettings(b.tenant_id, tx)
  const bookingStartUtc = new Date(b.starts_at)
  const policyHours = settings.cancellation_policy.hours_before
  const inPolicy = Date.now() < bookingStartUtc.getTime() - policyHours * 3_600_000

  // Bug: 'canceled_refunded' solo tiene sentido si había una seña PAGADA para
  // devolver — inPolicy por sí solo no alcanza (reservas sin seña, ej. pago en
  // efectivo, no tienen nada que reembolsar aunque caigan dentro del plazo).
  const hadPaidDeposit = b.deposit_status === 'paid'
  const targetStatus = inPolicy && hadPaidDeposit ? 'canceled_refunded' : 'canceled_no_refund'
  let newDepositStatus: DepositStatus = b.deposit_status as DepositStatus
  let pendingRefund: PreparedRefund | undefined

  if (b.deposit_status === 'paid') {
    if (inPolicy) {
      if (b.payment_id && gateway && (await isPaymentApproved(b.payment_id, tx))) {
        // Seña MP: refund real vía gateway — solo se PREPARA acá (fila
        // 'pending' durable); la llamada a MP la hace el caller después de
        // que esta tx commitee (settleRefund).
        pendingRefund = await prepareRefund(b.payment_id, b.deposit_amount, tx)
        newDepositStatus = 'refunded'
      } else if (b.payment_id) {
        // Hallazgo 2: seña MP pero gateway no disponible → no se puede refundar.
        // Blindaje (payment.service.ts confirmManualDepositPayment): también
        // cubre payment_id apuntando a un pago que nunca se aprobó (dato
        // legacy/corrupto) — mismo camino que "gateway no disponible", nunca
        // una excepción cruda sin catch (RefundInvalidStateError).
        // No marcamos canceled_refunded con deposit 'paid' (estado mentiroso).
        throw new RefundUnavailableError(bookingId)
      } else {
        // Seña en efectivo/transferencia (sin payment_id MP): el reembolso se
        // resuelve offline entre jugador y complejo. Marcamos la obligación.
        newDepositStatus = 'refunded'
      }
    } else {
      newDepositStatus = 'captured'
    }
  }

  const updated = await tx
    .update(bookings)
    .set({
      status: targetStatus,
      canceledBy: 'player',
      canceledAt: new Date(),
      canceledReason: reason ?? null,
      depositStatus: newDepositStatus,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, bookingId))
    .returning()

  await insertAuditLog(tx, {
    tenantId: b.tenant_id,
    actorId: playerId,
    actorType: 'player',
    action: 'booking.canceled',
    resourceType: 'booking',
    resourceId: bookingId,
    metadata: { reason: reason ?? null, inPolicy, depositStatus: newDepositStatus },
  })

  await invalidateCourtDateSlots(b.court_id, b.date)

  const bookingRow = rowToBookingRow(updated[0]!)

  // doc7 Flujo 4: avisar al jugador de que su propia cancelación se procesó.
  const notificationIds: string[] = []
  const names = await loadCancelEmailNames(b.tenant_id, b.court_id, playerId, tx)
  if (names) {
    const id = await enqueueNotification(
      {
        tenantId: b.tenant_id,
        recipientType: 'player',
        recipientId: playerId,
        templateName: 'booking_canceled',
        content: {
          playerFirstName: names.playerFirstName,
          courtName: names.courtName,
          date: formatDateArs(bookingRow.date),
          timeStart: bookingRow.timeStart.slice(0, 5),
          timeEnd: bookingRow.timeEnd.slice(0, 5),
          tenantName: names.tenantName,
          canceledBy: 'player',
          ...(reason ? { reason } : {}),
        },
        triggerEvent: 'booking.canceled',
      },
      tx,
    )
    notificationIds.push(id)
  } else {
    // Bajo RLS real (policy staff_can_see_related_players) el jugador solo es
    // visible si existe la fila PTR; si falta, el email de doc7 Flujo 4 se
    // pierde en silencio — dejar rastro para no descubrirlo en producción.
    captureMessage('cancel email skipped: player not visible under tenant context', {
      level: 'warning',
      extra: { bookingId: bookingRow.id, tenantId: b.tenant_id, playerId },
    })
  }

  return { booking: bookingRow, pendingRefund, notificationIds }
}

// Etiqueta legible que se antepone al motivo para que `canceled_reason`
// incluya el tipo de cancelación (Tarea #3), sin agregar una columna nueva.
const CANCELLATION_TYPE_LABEL: Record<AdminCancellationType, string> = {
  complejo: 'Cancelado por el complejo',
  jugador: 'Cancelado a pedido del jugador',
}

export async function cancelByAdmin(
  bookingId: string,
  staffUserId: string,
  reason: string,
  cancellationType: AdminCancellationType,
  gateway: PaymentGateway | null,
  tx: DbTx,
): Promise<CancellationOutcome> {
  const b = await lockBooking(bookingId, tx)
  if (!b) throw new BookingNotInConfirmedError(bookingId)
  if (b.status !== 'confirmed') throw new BookingNotInConfirmedError(bookingId)

  // Hallazgo 8 (paridad con cancelByPlayer): rechazar cancelación cuando el
  // complejo está en estado terminal/inactivo. Sin este guard, el admin podría
  // disparar un refund automático contra una cuenta MP eliminada o delinkeada.
  const tenantRows = await tx
    .select({ status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, b.tenant_id))
    .limit(1)
  const tenantStatus = tenantRows[0]?.status
  if (!tenantStatus || tenantStatus === 'deleted' || tenantStatus === 'blocked') {
    throw new TenantInactiveError(b.tenant_id, tenantStatus ?? 'unknown')
  }

  track.booking('booking.cancel.by_admin', { bookingId, tenantId: b.tenant_id })

  // Tarea #3: el reembolso lo decide el motivo, no una casilla suelta del admin.
  // 'complejo' reembolsa siempre; 'jugador' aplica la política horaria del complejo.
  const settings = await loadSettings(b.tenant_id, tx)
  const bookingStartUtc = new Date(b.starts_at)
  const bookingEndUtc = new Date(b.ends_at)
  const policyHours = settings.cancellation_policy.hours_before
  const { shouldRefund, inPolicy } = decideAdminRefund({
    cancellationType,
    bookingStartUtcMs: bookingStartUtc.getTime(),
    bookingEndUtcMs: bookingEndUtc.getTime(),
    policyHours,
    nowMs: Date.now(),
  })

  // Bug: 'canceled_refunded' solo tiene sentido si había una seña PAGADA para
  // devolver — shouldRefund por sí solo no alcanza (reservas sin seña, ej.
  // pago en efectivo, no tienen nada que reembolsar aunque el motivo/plazo
  // lo habilite).
  const hadPaidDeposit = b.deposit_status === 'paid'
  const targetStatus = shouldRefund && hadPaidDeposit ? 'canceled_refunded' : 'canceled_no_refund'
  let newDepositStatus: DepositStatus = b.deposit_status as DepositStatus
  let pendingRefund: PreparedRefund | undefined

  if (b.deposit_status === 'paid') {
    if (shouldRefund) {
      if (b.payment_id && gateway && (await isPaymentApproved(b.payment_id, tx))) {
        pendingRefund = await prepareRefund(b.payment_id, b.deposit_amount, tx)
        newDepositStatus = 'refunded'
      } else if (b.payment_id) {
        // Hallazgo 2: refund MP pedido pero gateway no disponible → no fingir.
        // Blindaje (payment.service.ts confirmManualDepositPayment): también
        // cubre payment_id apuntando a un pago que nunca se aprobó (dato
        // legacy/corrupto) — mismo camino, nunca una excepción cruda sin catch.
        throw new RefundUnavailableError(bookingId)
      } else {
        // Seña en efectivo/transferencia: reembolso offline, marcamos obligación.
        newDepositStatus = 'refunded'
      }
    } else {
      newDepositStatus = 'captured'
    }
  }

  const storedReason = `${CANCELLATION_TYPE_LABEL[cancellationType]}: ${reason}`

  const updated = await tx
    .update(bookings)
    .set({
      status: targetStatus,
      canceledBy: 'admin',
      canceledAt: new Date(),
      canceledReason: storedReason,
      depositStatus: newDepositStatus,
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, bookingId))
    .returning()

  await insertAuditLog(tx, {
    tenantId: b.tenant_id,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'booking.canceled_by_admin',
    resourceType: 'booking',
    resourceId: bookingId,
    metadata: { reason, cancellationType, inPolicy, shouldRefund, depositStatus: newDepositStatus },
  })

  await invalidateCourtDateSlots(b.court_id, b.date)

  const bookingRow = rowToBookingRow(updated[0]!)

  // doc7 Flujo 4: avisar al jugador según quién decidió la cancelación.
  // Reserva manual sin jugador (guest, doc7:327-328) → sin email.
  const notificationIds: string[] = []
  if (bookingRow.playerId) {
    const names = await loadCancelEmailNames(b.tenant_id, b.court_id, bookingRow.playerId, tx)
    if (names) {
      const id =
        cancellationType === 'complejo'
          ? await enqueueNotification(
              {
                tenantId: b.tenant_id,
                recipientType: 'player',
                recipientId: bookingRow.playerId,
                templateName: 'booking_canceled_by_complex',
                content: {
                  playerFirstName: names.playerFirstName,
                  courtName: names.courtName,
                  date: formatDateArs(bookingRow.date),
                  timeStart: bookingRow.timeStart.slice(0, 5),
                  timeEnd: bookingRow.timeEnd.slice(0, 5),
                  tenantName: names.tenantName,
                  refundConfirmed: newDepositStatus === 'refunded',
                },
                triggerEvent: 'booking.canceled_by_admin',
              },
              tx,
            )
          : await enqueueNotification(
              {
                tenantId: b.tenant_id,
                recipientType: 'player',
                recipientId: bookingRow.playerId,
                templateName: 'booking_canceled',
                content: {
                  playerFirstName: names.playerFirstName,
                  courtName: names.courtName,
                  date: formatDateArs(bookingRow.date),
                  timeStart: bookingRow.timeStart.slice(0, 5),
                  timeEnd: bookingRow.timeEnd.slice(0, 5),
                  tenantName: names.tenantName,
                  canceledBy: 'admin',
                  reason,
                },
                triggerEvent: 'booking.canceled_by_admin',
              },
              tx,
            )
      notificationIds.push(id)
    } else {
      // Ídem cancelByPlayer: sin fila PTR el jugador no es visible bajo el
      // contexto de tenant y el email se saltearía en silencio.
      captureMessage('cancel email skipped: player not visible under tenant context', {
        level: 'warning',
        extra: { bookingId: bookingRow.id, tenantId: b.tenant_id, playerId: bookingRow.playerId },
      })
    }
  }

  return { booking: bookingRow, pendingRefund, notificationIds }
}

/**
 * No-show: softban por reincidencia (reemplaza la deuda financiera del cambio
 * #5, ver applyNoShowStrike). `markNoShow` sigue capturando la seña pagada
 * (deposit_status='paid' → 'captured') tal cual — eso no cambia, es el único
 * costo real de faltar.
 *
 *  1. markNoShow transiciona el booking a no_show y captura la seña pagada.
 *  2. Si hay jugador vinculado, se registra la ausencia en
 *     player_tenant_relationships (contador + ventana de reincidencia). La 2da
 *     ausencia dentro de NO_SHOW_STRIKE_WINDOW_DAYS bloquea reservas online
 *     por NO_SHOW_SOFTBAN_DAYS vía tenant_player_bans (mismo mecanismo que los
 *     bans manuales del complejo, checkPlayerBanned ya lo lee).
 */
export async function handleNoShow(
  bookingId: string,
  staffUserId: string,
  tx: DbTx,
): Promise<BookingRow> {
  const booking = await markNoShow(bookingId, staffUserId, tx)

  await insertAuditLog(tx, {
    tenantId: booking.tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'booking.marked_no_show',
    resourceType: 'booking',
    resourceId: bookingId,
    metadata: { depositStatus: booking.depositStatus },
  })

  // Sin jugador vinculado (bloqueo interno / reserva sin player) no hay a quién
  // aplicarle el strike.
  if (!booking.playerId) return booking

  const strike = await applyNoShowStrike(booking.tenantId, booking.playerId, tx)

  await insertAuditLog(tx, {
    tenantId: booking.tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: strike.softbanned ? 'player.no_show_softban_applied' : 'player.no_show_recorded',
    resourceType: 'player',
    resourceId: booking.playerId,
    metadata: {
      bookingId,
      noshowCount: strike.noshowCount,
      bannedUntil: strike.bannedUntil?.toISOString() ?? null,
    },
  })

  return booking
}

/**
 * Corrección inversa (RI #1, doc6 §3): el admin marcó "No vino" por error y lo
 * deshace dentro de las 24h. Espejo exacto de `handleNoShow`:
 *
 *  1. revertNoShow devuelve el booking a `completed` (valida actor + ventana de
 *     24h; el trigger de la migración 060 lo respalda a nivel DB).
 *  2. Si había jugador vinculado, revertNoShowStrike decrementa el contador de
 *     ausencias, recalcula la ventana de reincidencia y levanta el softban
 *     SOLO si lo había creado ese strike.
 *
 * La seña capturada NO se devuelve automáticamente (ver revertNoShow): el
 * reembolso, si corresponde, se resuelve entre jugador y complejo. Queda
 * asentado en el audit_log para que el rastro exista si después se reclama.
 */
export async function handleNoShowRevert(
  bookingId: string,
  staffUserId: string,
  tx: DbTx,
): Promise<BookingRow> {
  const booking = await revertNoShow(bookingId, staffUserId, tx)

  await insertAuditLog(tx, {
    tenantId: booking.tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'booking.no_show_reverted',
    resourceType: 'booking',
    resourceId: bookingId,
    metadata: {
      // 'captured' acá = la seña quedó capturada y NO se auto-reembolsa.
      depositStatus: booking.depositStatus,
      depositAmount: booking.depositAmount,
    },
  })

  if (!booking.playerId) return booking

  const revert = await revertNoShowStrike(booking.tenantId, booking.playerId, bookingId, tx)

  await insertAuditLog(tx, {
    tenantId: booking.tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'player.no_show_strike_reverted',
    resourceType: 'player',
    resourceId: booking.playerId,
    metadata: {
      bookingId,
      noshowCount: revert.noshowCount,
      softbanLifted: revert.softbanLifted,
    },
  })

  return booking
}
