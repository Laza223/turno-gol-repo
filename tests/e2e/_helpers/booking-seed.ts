/**
 * Shared seed helpers for booking E2E specs.
 *
 * Re-exports the tenant/court constants from player-seed so downstream specs
 * can import everything from one place. STAFF_USER_ID is defined here because
 * player-seed does not export it.
 *
 * tomorrowDateIsoArt() uses date-fns-tz (prod dep, package.json line 72) for
 * correct DST-aware conversion instead of the manual UTC-3 offset used in
 * older specs.
 */

import { randomUUID } from 'node:crypto'
import { addDays } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { makeServiceClient } from './player-seed'

export {
  E2E_TENANT_ID,
  E2E_COURT_ID,
  makeServiceClient,
} from './player-seed'

export const E2E_STAFF_USER_ID = '00000000-0000-4000-8000-000000000003'

// ─── Date helper ─────────────────────────────────────────────────────────────

/** Returns YYYY-MM-DD for tomorrow in ART (America/Argentina/Buenos_Aires). */
export function tomorrowDateIsoArt(): string {
  return formatInTimeZone(
    addDays(new Date(), 1),
    'America/Argentina/Buenos_Aires',
    'yyyy-MM-dd',
  )
}

// ─── Types ───────────────────────────────────────────────────────────────────

type InsertBookingOpts = {
  tenantId?: string
  courtId?: string
  date?: string
  timeStart?: string
  timeEnd?: string
  type?: string
  status?: string
  priceSnapshot?: number
  depositAmount?: number
  depositStatus?: string
  paymentMethod?: string | null
  playerId?: string | null
  guestName?: string | null
  guestPhone?: string | null
  createdByStaff?: string | null
}

// ─── Insert helper ────────────────────────────────────────────────────────────

/**
 * Inserts a booking via the Supabase service-role client (bypasses RLS).
 *
 * Sensible defaults match the E2E seed constants so callers only need to
 * provide the fields that vary per test.
 *
 * Returns the generated booking UUID.
 */
export async function insertBookingServiceRole(
  supabase: ReturnType<typeof makeServiceClient>,
  opts: InsertBookingOpts = {},
): Promise<string> {
  const bookingId = randomUUID()
  const tomorrow = tomorrowDateIsoArt()

  const { error } = await supabase.from('bookings').insert({
    id: bookingId,
    tenant_id: opts.tenantId ?? '00000000-0000-4000-8000-000000000001',
    court_id: opts.courtId ?? '00000000-0000-4000-8000-000000000010',
    date: opts.date ?? tomorrow,
    time_start: opts.timeStart ?? '14:00:00',
    time_end: opts.timeEnd ?? '15:00:00',
    type: opts.type ?? 'spontaneous',
    status: opts.status ?? 'confirmed',
    price_snapshot: opts.priceSnapshot ?? 10000,
    deposit_amount: opts.depositAmount ?? 0,
    deposit_status: opts.depositStatus ?? 'not_required',
    payment_method: opts.paymentMethod ?? null,
    player_id: opts.playerId ?? null,
    guest_name: opts.guestName ?? null,
    guest_phone: opts.guestPhone ?? null,
    created_by_staff: opts.createdByStaff !== undefined ? opts.createdByStaff : E2E_STAFF_USER_ID,
  })

  if (error) {
    throw new Error(`insertBookingServiceRole failed: ${error.message}`)
  }

  return bookingId
}

// ─── Cleanup helper ───────────────────────────────────────────────────────────

/**
 * Deletes bookings by their IDs using the service-role client.
 *
 * Defensive: null-outs payment_id first to satisfy any FK constraint,
 * then deletes. Errors per-ID are logged as warnings — a cleanup failure
 * must not mask the real test result.
 */
export async function cleanupBookingsByIds(
  supabase: ReturnType<typeof makeServiceClient>,
  ids: string[],
): Promise<void> {
  for (const id of ids) {
    try {
      // Null out payment FK before delete to avoid constraint violations.
      await supabase
        .from('bookings')
        .update({ payment_id: null, payment_method: null })
        .eq('id', id)

      const { error } = await supabase.from('bookings').delete().eq('id', id)
      if (error) {
        console.warn(`[booking-seed] cleanupBookingsByIds: DELETE failed for ${id}: ${error.message}`)
      }
    } catch (err) {
      console.warn(`[booking-seed] cleanupBookingsByIds: unexpected error for ${id}:`, err)
    }
  }
}
