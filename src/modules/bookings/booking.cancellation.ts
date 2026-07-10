import { eq, sql } from 'drizzle-orm'
import { bookings, tenants } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'
import { prepareRefund, type PreparedRefund } from '@/modules/payments/payment.service'
import type { PaymentGateway } from '@/modules/payments/mp-gateway'
import type { TenantSettings } from '@/modules/tenants/tenant.types'
import { addNoShowDebt } from '@/modules/relationships/ptr.service'
import { markNoShow } from './booking.service'
import { invalidateCourtDateSlots } from '@/shared/cache/slots-cache'
import { rowToBookingRow } from './booking.mappers'
import {
  BookingNotInConfirmedError,
  BookingNotOwnedByPlayerError,
  RefundUnavailableError,
  TenantInactiveError,
} from './booking.errors'
import type { BookingRow, DepositStatus } from './booking.types'
import { track } from '@/shared/observability'

// Converts ART local date+time to a UTC Date for policy comparison.
// ART = UTC-3; a booking at "2027-06-01 21:00 ART" → UTC 2027-06-02 00:00.
function artDateAt(dateStr: string, hhmm: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(y!, (mo ?? 1) - 1, d ?? 1, (h ?? 0) + 3, m ?? 0))
}

export type AdminCancellationType = 'complejo' | 'jugador'

/**
 * Tarea #3: el motivo decide el reembolso, el admin ya no elige a ciegas.
 * - 'complejo' (rotura / mantenimiento / error del admin): reembolso SIEMPRE,
 *   sin importar el plazo — no es culpa del jugador.
 * - 'jugador' (pidió por teléfono): aplica la política normal — dentro del
 *   plazo reembolsa, fuera retiene.
 * `inPolicy` se devuelve para el rastro de auditoría (también en el caso
 * 'complejo', donde no afecta la decisión pero documenta el contexto).
 */
export function decideAdminRefund(opts: {
  cancellationType: AdminCancellationType
  bookingStartUtcMs: number
  policyHours: number
  nowMs: number
}): { shouldRefund: boolean; inPolicy: boolean } {
  const inPolicy =
    opts.nowMs < opts.bookingStartUtcMs - opts.policyHours * 3_600_000
  const shouldRefund = opts.cancellationType === 'complejo' ? true : inPolicy
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
      time_start::text AS time_start
    FROM bookings
    WHERE id = ${bookingId}
    FOR UPDATE
  `)
  return (result as unknown as LockedBooking[])[0]
}

async function loadSettings(tenantId: string, tx: DbTx): Promise<TenantSettings> {
  const rows = await tx
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  return rows[0]!.settings as TenantSettings
}

export type CancellationOutcome = {
  booking: BookingRow
  /** Set when a paid MP deposit was refunded. Caller must pass this to
   * `settleRefund` AFTER this function's transaction commits — see
   * `prepareRefund`'s doc comment for why the MP call can't happen in here. */
  pendingRefund?: PreparedRefund
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
  const bookingStartUtc = artDateAt(b.date, b.time_start.slice(0, 5))
  const policyHours = settings.cancellation_policy.hours_before
  const inPolicy = Date.now() < bookingStartUtc.getTime() - policyHours * 3_600_000

  const targetStatus = inPolicy ? 'canceled_refunded' : 'canceled_no_refund'
  let newDepositStatus: DepositStatus = b.deposit_status as DepositStatus
  let pendingRefund: PreparedRefund | undefined

  if (b.deposit_status === 'paid') {
    if (inPolicy) {
      if (b.payment_id && gateway) {
        // Seña MP: refund real vía gateway — solo se PREPARA acá (fila
        // 'pending' durable); la llamada a MP la hace el caller después de
        // que esta tx commitee (settleRefund).
        pendingRefund = await prepareRefund(b.payment_id, b.deposit_amount, tx)
        newDepositStatus = 'refunded'
      } else if (b.payment_id) {
        // Hallazgo 2: seña MP pero gateway no disponible → no se puede refundar.
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

  return { booking: rowToBookingRow(updated[0]!), pendingRefund }
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
  const bookingStartUtc = artDateAt(b.date, b.time_start.slice(0, 5))
  const policyHours = settings.cancellation_policy.hours_before
  const { shouldRefund, inPolicy } = decideAdminRefund({
    cancellationType,
    bookingStartUtcMs: bookingStartUtc.getTime(),
    policyHours,
    nowMs: Date.now(),
  })

  const targetStatus = shouldRefund ? 'canceled_refunded' : 'canceled_no_refund'
  let newDepositStatus: DepositStatus = b.deposit_status as DepositStatus
  let pendingRefund: PreparedRefund | undefined

  if (b.deposit_status === 'paid') {
    if (shouldRefund) {
      if (b.payment_id && gateway) {
        pendingRefund = await prepareRefund(b.payment_id, b.deposit_amount, tx)
        newDepositStatus = 'refunded'
      } else if (b.payment_id) {
        // Hallazgo 2: refund MP pedido pero gateway no disponible → no fingir.
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

  return { booking: rowToBookingRow(updated[0]!), pendingRefund }
}

/**
 * Tarea #5: la deuda por no-show = precio del turno − seña capturada.
 * `markNoShow` ya capturó la seña pagada (deposit_status='paid' → 'captured') en
 * la transición, así que acá restamos lo que el complejo se quedó. Función pura
 * para testearla sin DB.
 */
export function computeNoShowDebt(b: {
  priceSnapshot: number
  depositAmount: number
  depositStatus: DepositStatus
}): number {
  const capturedDeposit = b.depositStatus === 'captured' ? b.depositAmount : 0
  return Math.max(0, b.priceSnapshot - capturedDeposit)
}

/**
 * Tarea #5 — No-show: en vez del viejo ban temporal por días, el no-show genera
 * deuda financiera. El jugador queda bloqueado para reservar online en este
 * complejo hasta saldarla (createOnlineBooking gatea por balance > 0).
 *
 *  1. markNoShow transiciona el booking a no_show y captura la seña pagada.
 *  2. Si hay jugador vinculado y deuda > 0, se suma `price − seña` a
 *     player_tenant_relationships.balance (incremento atómico, concurrencia-safe).
 *
 * Los bans manuales (tenant_player_bans) siguen existiendo para otros motivos,
 * pero ya no se disparan automáticamente por no-show.
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
  // cobrarle: no se genera deuda.
  if (!booking.playerId) return booking

  const debt = computeNoShowDebt(booking)
  if (debt <= 0) return booking

  await addNoShowDebt(booking.tenantId, booking.playerId, debt, tx)

  await insertAuditLog(tx, {
    tenantId: booking.tenantId,
    actorId: staffUserId,
    actorType: 'staff',
    action: 'player.no_show_debt_created',
    resourceType: 'player',
    resourceId: booking.playerId,
    metadata: {
      bookingId,
      debt,
      priceSnapshot: booking.priceSnapshot,
      depositCaptured:
        booking.depositStatus === 'captured' ? booking.depositAmount : 0,
    },
  })

  return booking
}
