import { and, eq, sql } from 'drizzle-orm'
import {
  bookings,
  courts,
  tenants,
} from '@/shared/db/schema'
import { checkPlayerBanned } from '@/modules/bans/ban.service'
import type { DbTx } from '@/shared/db/client'
import { ensurePTR } from '@/modules/relationships/ptr.service'
import { calculatePrice } from '@/modules/courts/court.service'
import type { CourtPricingData } from '@/modules/courts/court.types'
import type { OpeningHours } from '@/modules/tenants/tenant.types'
import {
  BookingNotInConfirmedError,
  CourtOfflineError,
  PlayerBannedError,
  PriceUnavailableError,
  SlotTakenError,
} from './booking.errors'
import { rowToBookingRow } from './booking.mappers'
import { assertTransition } from './booking.state-machine'
import { transitionFromPendingPayment } from './booking.concurrency'
import type {
  AvailableSlot,
  BookingRow,
  CreateManualBookingInput,
  CreateOnlineBookingInput,
  TransitionResult,
} from './booking.types'

const PG_EXCLUSION_VIOLATION = '23P01'

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

function timeToMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function minsToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Build a Date that, when converted to ART (UTC-3), lands at the given local clock time.
function artDateAt(dateStr: string, hhmm: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(y!, (mo ?? 1) - 1, d ?? 1, (h ?? 0) + 3, m ?? 0))
}

function isExclusionViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === PG_EXCLUSION_VIOLATION
  )
}

async function lockCourtOrThrow(
  courtId: string,
  tx: DbTx,
): Promise<{ id: string; tenantId: string; pricing: CourtPricingData }> {
  // SELECT FOR UPDATE serializes concurrent INSERTs targeting this court.
  const result = await tx.execute(sql`
    SELECT id, tenant_id AS "tenantId", pricing, status
    FROM courts
    WHERE id = ${courtId}
    FOR UPDATE
  `)
  const row = (result as unknown as Array<{
    id: string
    tenantId: string
    pricing: CourtPricingData
    status: string
  }>)[0]
  if (!row || row.status !== 'online') {
    throw new CourtOfflineError(courtId)
  }
  return { id: row.id, tenantId: row.tenantId, pricing: row.pricing }
}

async function checkOverlapOrThrow(
  courtId: string,
  dateStr: string,
  timeStart: string,
  timeEnd: string,
  tx: DbTx,
): Promise<void> {
  const result = await tx.execute(sql`
    SELECT 1
    FROM bookings
    WHERE court_id = ${courtId}
      AND date = ${dateStr}::date
      AND status IN ('pending_payment', 'confirmed')
      AND tsrange(
            ('2000-01-01'::date + time_start)::timestamp,
            ('2000-01-01'::date + time_end)::timestamp
          ) && tsrange(
            ('2000-01-01'::date + ${timeStart}::time)::timestamp,
            ('2000-01-01'::date + ${timeEnd}::time)::timestamp
          )
    LIMIT 1
  `)
  if ((result as unknown as unknown[]).length > 0) {
    throw new SlotTakenError()
  }
}

// ─── createManualBooking (Flujo 3) ──────────────────────────────────
export async function createManualBooking(
  tenantId: string,
  input: CreateManualBookingInput,
  tx: DbTx,
): Promise<BookingRow> {
  const court = await lockCourtOrThrow(input.courtId, tx)
  if (court.tenantId !== tenantId) {
    throw new CourtOfflineError(input.courtId)
  }

  let priceSnapshot: number
  if (input.priceOverride !== undefined) {
    priceSnapshot = input.priceOverride
  } else if (input.type === 'block') {
    priceSnapshot = 0
  } else {
    const calc = calculatePrice(
      court.pricing,
      artDateAt(input.date, input.timeStart),
      input.durationMins,
    )
    if (calc === null) throw new PriceUnavailableError()
    priceSnapshot = calc
  }

  await checkOverlapOrThrow(
    input.courtId,
    input.date,
    input.timeStart,
    input.timeEnd,
    tx,
  )

  const depositAmount = input.depositAmount ?? 0
  const depositStatus = input.depositStatus ?? 'not_required'
  // chk_booking_payment_consistency:
  //   * mercadopago + payment_id NOT NULL  (P10 only — manual flow rejects this)
  //   * cash/transfer/other + payment_id NULL
  //   * NULL method + deposit_status='not_required'
  const paymentMethod =
    input.depositMethod && input.depositMethod !== 'mercadopago'
      ? input.depositMethod
      : null

  try {
    const inserted = await tx
      .insert(bookings)
      .values({
        tenantId,
        courtId: input.courtId,
        playerId: input.playerId ?? null,
        createdByStaff: input.staffUserId,
        date: new Date(`${input.date}T00:00:00Z`),
        timeStart: input.timeStart,
        timeEnd: input.timeEnd,
        type: input.type,
        status: 'confirmed',
        priceSnapshot,
        depositAmount,
        depositStatus,
        paymentMethod,
        guestName: input.playerId ? null : (input.guestName ?? null),
        guestPhone: input.playerId ? null : (input.guestPhone ?? null),
        notesInternal: input.notesInternal ?? null,
        notesPlayer: input.notesPlayer ?? null,
      })
      .returning()

    return rowToBookingRow(inserted[0]!)
  } catch (err) {
    if (isExclusionViolation(err)) throw new SlotTakenError()
    throw err
  }
}

// ─── createOnlineBooking (Flujo 2) ──────────────────────────────────
// With deposit: status='pending_payment', deposit_status='pending', payment_method=null
// (migration 009 allows this; P10 sets payment_method='mercadopago' + payment_id).
// Without deposit: status='confirmed', deposit_status='not_required'.
// Always upserts player_tenant_relationships and checks for active bans.
export async function createOnlineBooking(
  tenantId: string,
  input: CreateOnlineBookingInput,
  tx: DbTx,
): Promise<BookingRow> {
  const banResult = await checkPlayerBanned(input.playerId, tenantId, tx)
  if (banResult.banned) {
    throw new PlayerBannedError(
      input.playerId,
      tenantId,
      banResult.bannedGlobal,
      banResult.reason,
      banResult.until,
    )
  }

  const court = await lockCourtOrThrow(input.courtId, tx)
  if (court.tenantId !== tenantId) {
    throw new CourtOfflineError(input.courtId)
  }

  const calc = calculatePrice(
    court.pricing,
    artDateAt(input.date, input.timeStart),
    input.durationMins,
  )
  if (calc === null) throw new PriceUnavailableError()
  const priceSnapshot = calc

  await checkOverlapOrThrow(
    input.courtId,
    input.date,
    input.timeStart,
    input.timeEnd,
    tx,
  )

  const withDeposit = input.requiresDeposit && input.depositPercentage > 0
  const depositAmount = withDeposit
    ? Math.round(priceSnapshot * input.depositPercentage / 100)
    : 0

  try {
    const inserted = await tx
      .insert(bookings)
      .values({
        tenantId,
        courtId: input.courtId,
        playerId: input.playerId,
        date: new Date(`${input.date}T00:00:00Z`),
        timeStart: input.timeStart,
        timeEnd: input.timeEnd,
        type: 'spontaneous',
        status: withDeposit ? 'pending_payment' : 'confirmed',
        priceSnapshot,
        depositAmount,
        depositStatus: withDeposit ? 'pending' : 'not_required',
        paymentMethod: null,
        notesPlayer: input.notesPlayer ?? null,
      })
      .returning()

    const booking = rowToBookingRow(inserted[0]!)
    await ensurePTR(input.playerId, tenantId, tx)
    return booking
  } catch (err) {
    if (isExclusionViolation(err)) throw new SlotTakenError()
    throw err
  }
}

// ─── completeBooking ────────────────────────────────────────────────
export async function completeBooking(
  bookingId: string,
  actor: 'admin' | 'system',
  tx: DbTx,
): Promise<BookingRow> {
  assertTransition('confirmed', 'completed', { actor })
  const rows = await tx
    .update(bookings)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, 'confirmed')))
    .returning()

  if (rows.length === 0) throw new BookingNotInConfirmedError(bookingId)
  return rowToBookingRow(rows[0]!)
}

/**
 * Bulk auto-complete: confirms all bookings whose time_end + 30min has passed.
 * Used by the cron job (Flujo 4D, scenario B). Returns affected rows.
 */
export async function autoCompleteOverdueBookings(
  tx: DbTx,
  graceMinutes = 30,
): Promise<BookingRow[]> {
  const rows = await tx.execute(sql`
    UPDATE bookings
    SET status = 'completed', updated_at = NOW()
    WHERE status = 'confirmed'
      AND (date + time_end) < (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires') - (${graceMinutes} || ' minutes')::interval
    RETURNING *
  `)
  return (rows as unknown as Array<typeof bookings.$inferSelect>).map(
    rowToBookingRow,
  )
}

// ─── markNoShow ─────────────────────────────────────────────────────
export async function markNoShow(
  bookingId: string,
  _staffUserId: string,
  tx: DbTx,
): Promise<BookingRow> {
  assertTransition('confirmed', 'no_show', { actor: 'admin' })
  const rows = await tx
    .update(bookings)
    .set({ status: 'no_show', updatedAt: new Date() })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, 'confirmed')))
    .returning()

  if (rows.length === 0) throw new BookingNotInConfirmedError(bookingId)
  return rowToBookingRow(rows[0]!)
}

// ─── expirePendingBooking ───────────────────────────────────────────
export async function expirePendingBooking(
  bookingId: string,
  tx: DbTx,
): Promise<TransitionResult> {
  return transitionFromPendingPayment(bookingId, 'expired', tx)
}

// ─── getAvailableSlots ──────────────────────────────────────────────
export type GenerateSlotsInput = {
  pricing: CourtPricingData
  dayKey: (typeof DAY_KEYS)[number]
  openHhmm: string
  closeHhmm: string
  closedDay: boolean
  occupied: Array<{ timeStartMins: number; timeEndMins: number }>
  durationMins: 60 | 120
}

export function generateSlots(p: GenerateSlotsInput): AvailableSlot[] {
  if (p.closedDay) return []
  const openMins = timeToMins(p.openHhmm)
  let closeMins = timeToMins(p.closeHhmm)
  if (closeMins === 0) closeMins = 24 * 60
  const lastStart = closeMins - p.durationMins

  const slots: AvailableSlot[] = []
  for (let start = openMins; start <= lastStart; start += p.durationMins) {
    const slotEnd = start + p.durationMins
    const overlaps = p.occupied.some(
      (b) => start < b.timeEndMins && slotEnd > b.timeStartMins,
    )
    const timeStart = minsToTime(start)
    const timeEnd = minsToTime(slotEnd)
    const price = priceForDuration(p.pricing, p.dayKey, timeStart, p.durationMins)
    slots.push({
      timeStart,
      timeEnd,
      price,
      available: !overlaps,
    })
  }
  return slots
}

function priceForDuration(
  pricing: CourtPricingData,
  dayKey: string,
  slotTime: string,
  durationMins: 60 | 120,
): number | null {
  const slotMins = timeToMins(slotTime)
  for (const rule of pricing.rules) {
    if (!rule.days.includes(dayKey)) continue
    const from = timeToMins(rule.from)
    const toRaw = timeToMins(rule.to)
    const to = toRaw === 0 ? 24 * 60 : toRaw
    if (slotMins >= from && slotMins < to) {
      return rule.prices[String(durationMins) as '60' | '120'] ?? null
    }
  }
  return null
}

export async function getAvailableSlots(
  tenantId: string,
  courtId: string,
  dateStr: string,
  durationMins: 60 | 120,
  tx: DbTx,
): Promise<AvailableSlot[]> {
  const courtRows = await tx
    .select({
      id: courts.id,
      tenantId: courts.tenantId,
      pricing: courts.pricing,
      status: courts.status,
    })
    .from(courts)
    .where(eq(courts.id, courtId))
    .limit(1)

  const court = courtRows[0]
  if (!court || court.status !== 'online' || court.tenantId !== tenantId) {
    return []
  }

  const tenantRows = await tx
    .select({
      openingHours: tenants.openingHours,
      closedDates: tenants.closedDates,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  const tenant = tenantRows[0]
  if (!tenant) return []

  const [y, mo, d] = dateStr.split('-').map(Number)
  const targetUtc = new Date(Date.UTC(y!, (mo ?? 1) - 1, d ?? 1))
  const dayKey = DAY_KEYS[targetUtc.getUTCDay()]!

  const opening = tenant.openingHours as OpeningHours
  const dayHours = opening[dayKey as keyof OpeningHours]
  const closedDates = (tenant.closedDates ?? []) as string[]
  const closedDay = dayHours?.closed === true || closedDates.includes(dateStr)

  const occupiedRows = await tx
    .select({
      timeStart: bookings.timeStart,
      timeEnd: bookings.timeEnd,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.courtId, courtId),
        sql`${bookings.date} = ${dateStr}::date`,
        sql`${bookings.status} IN ('pending_payment', 'confirmed')`,
      ),
    )

  const occupied = occupiedRows.map((b) => {
    const endMins = timeToMins(b.timeEnd.slice(0, 5))
    return {
      timeStartMins: timeToMins(b.timeStart.slice(0, 5)),
      timeEndMins: endMins === 0 ? 24 * 60 : endMins,
    }
  })

  return generateSlots({
    pricing: court.pricing as CourtPricingData,
    dayKey,
    openHhmm: dayHours?.open ?? '08:00',
    closeHhmm: dayHours?.close ?? '23:00',
    closedDay,
    occupied,
    durationMins,
  })
}

