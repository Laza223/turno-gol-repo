import { and, eq, sql } from 'drizzle-orm'
import { bookings, tenantPlayerBans, tenants } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import { insertAuditLog } from '@/shared/db/audit'
import { createRefund } from '@/modules/payments/payment.service'
import type { PaymentGateway } from '@/modules/payments/mp-gateway'
import type { TenantSettings } from '@/modules/tenants/tenant.types'
import { markNoShow } from './booking.service'
import { invalidateCourtDateSlots } from '@/shared/cache/slots-cache'
import { rowToBookingRow } from './booking.mappers'
import {
  BookingNotInConfirmedError,
  BookingNotOwnedByPlayerError,
  TenantInactiveError,
} from './booking.errors'
import type { BookingRow, DepositStatus } from './booking.types'
import { track } from '@/shared/observability'

const PG_UNIQUE_VIOLATION = '23505'

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === PG_UNIQUE_VIOLATION
  )
}

// Converts ART local date+time to a UTC Date for policy comparison.
// ART = UTC-3; a booking at "2027-06-01 21:00 ART" → UTC 2027-06-02 00:00.
function artDateAt(dateStr: string, hhmm: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(y!, (mo ?? 1) - 1, d ?? 1, (h ?? 0) + 3, m ?? 0))
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

export async function cancelByPlayer(
  bookingId: string,
  playerId: string,
  reason: string | undefined,
  gateway: PaymentGateway | null,
  tx: DbTx,
): Promise<BookingRow> {
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

  if (b.deposit_status === 'paid') {
    if (inPolicy && b.payment_id && gateway) {
      await createRefund(b.payment_id, b.deposit_amount, gateway, tx)
      newDepositStatus = 'refunded'
    } else if (!inPolicy) {
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

  return rowToBookingRow(updated[0]!)
}

export async function cancelByAdmin(
  bookingId: string,
  staffUserId: string,
  reason: string,
  shouldRefund: boolean,
  gateway: PaymentGateway | null,
  tx: DbTx,
): Promise<BookingRow> {
  const b = await lockBooking(bookingId, tx)
  if (!b) throw new BookingNotInConfirmedError(bookingId)
  if (b.status !== 'confirmed') throw new BookingNotInConfirmedError(bookingId)

  track.booking('booking.cancel.by_admin', { bookingId, tenantId: b.tenant_id })

  const targetStatus = shouldRefund ? 'canceled_refunded' : 'canceled_no_refund'
  let newDepositStatus: DepositStatus = b.deposit_status as DepositStatus

  if (b.deposit_status === 'paid') {
    if (shouldRefund && b.payment_id && gateway) {
      await createRefund(b.payment_id, b.deposit_amount, gateway, tx)
      newDepositStatus = 'refunded'
    } else if (!shouldRefund) {
      newDepositStatus = 'captured'
    }
  }

  const updated = await tx
    .update(bookings)
    .set({
      status: targetStatus,
      canceledBy: 'admin',
      canceledAt: new Date(),
      canceledReason: reason,
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
    metadata: { reason, shouldRefund, depositStatus: newDepositStatus },
  })

  await invalidateCourtDateSlots(b.court_id, b.date)

  return rowToBookingRow(updated[0]!)
}

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
    metadata: {},
  })

  if (!booking.playerId) return booking

  const settings = await loadSettings(booking.tenantId, tx)
  const penalty = settings.no_show_penalty

  if (penalty.type === 'none') return booking

  const cutoffDate = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const countResult = await tx.execute(sql`
    SELECT COUNT(*)::int AS n
    FROM bookings
    WHERE tenant_id = ${booking.tenantId}
      AND player_id = ${booking.playerId}
      AND status = 'no_show'
      AND date >= ${cutoffDate}::date
  `)
  const count = (countResult as unknown as Array<{ n: number }>)[0]?.n ?? 0

  const threshold = penalty.threshold ?? 3
  if (count < threshold) return booking

  const activeBan = await tx
    .select({ id: tenantPlayerBans.id })
    .from(tenantPlayerBans)
    .where(
      and(
        eq(tenantPlayerBans.tenantId, booking.tenantId),
        eq(tenantPlayerBans.playerId, booking.playerId),
        sql`(${tenantPlayerBans.bannedUntil} IS NULL OR ${tenantPlayerBans.bannedUntil} > NOW())`,
      ),
    )
    .limit(1)

  if (activeBan.length > 0) return booking

  const bannedUntil = new Date(Date.now() + penalty.days * 86_400_000)

  try {
    await tx.insert(tenantPlayerBans).values({
      tenantId: booking.tenantId,
      playerId: booking.playerId,
      reason: `${count} no-shows en los últimos 30 días`,
      bannedBy: staffUserId || null,
      bannedUntil,
    })
  } catch (err) {
    if (isUniqueViolation(err)) return booking
    throw err
  }

  return booking
}
