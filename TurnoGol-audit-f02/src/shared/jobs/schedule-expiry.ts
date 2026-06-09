import { getBoss } from './boss'
import {
  QUEUE_EXPIRE_PENDING_BOOKING,
  EXPIRE_PENDING_BOOKING_SEND_OPTIONS,
  DEFAULT_EXPIRY_SECONDS,
  type ExpirePendingBookingJobData,
} from './definitions'

/**
 * Schedules the `pending_payment → expired` timer (Hallazgo 1).
 *
 * Indirected through a settable seam (mirrors `setBillingGateway`) so tests
 * never spin up a real pg-boss instance — the suite does not globally mock the
 * boss singleton, and starting it leaks an open handle that hangs teardown.
 */
export type ExpiryScheduler = (
  bookingId: string,
  startAfterSeconds: number,
) => Promise<void>

let _override: ExpiryScheduler | null = null

/** Test seam. Pass `null` to restore the real pg-boss-backed scheduler. */
export function setExpiryScheduler(fn: ExpiryScheduler | null): void {
  _override = fn
}

export async function scheduleBookingExpiry(
  bookingId: string,
  startAfterSeconds: number = DEFAULT_EXPIRY_SECONDS,
): Promise<void> {
  const startAfter = Math.max(0, Math.round(startAfterSeconds))
  if (_override) {
    await _override(bookingId, startAfter)
    return
  }
  const boss = await getBoss()
  const data: ExpirePendingBookingJobData = { bookingId }
  await boss.send(QUEUE_EXPIRE_PENDING_BOOKING, data, {
    ...EXPIRE_PENDING_BOOKING_SEND_OPTIONS,
    startAfter,
  })
}
