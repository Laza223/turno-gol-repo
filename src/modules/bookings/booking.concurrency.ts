import { and, eq } from 'drizzle-orm'
import { bookings } from '@/shared/db/schema'
import type { DbTx } from '@/shared/db/client'
import { rowToBookingRow } from './booking.mappers'
import { assertTransition } from './booking.state-machine'
import type { TransitionResult } from './booking.types'
import { track } from '@/shared/observability'

/**
 * Conditional UPDATE primitive for race-safe transitions out of pending_payment.
 *
 * INVIOLABLE: callers MUST gate side effects (email, cashflow, audit log)
 * on `won === true`. If `won === false`, another worker already transitioned
 * the row — do nothing. See audit Fix #9 (Fase 1).
 *
 * Used by:
 *   - MP webhook handler (P10): pending_payment -> confirmed
 *   - Expiry cron job (P5):     pending_payment -> expired
 */
export async function transitionFromPendingPayment(
  bookingId: string,
  newStatus: 'confirmed' | 'expired',
  tx: DbTx,
): Promise<TransitionResult> {
  assertTransition('pending_payment', newStatus, { actor: 'system' })

  // doc7 Flujo 2 PASO 5: on MP approval, booking transitions to 'confirmed'
  // AND deposit_status transitions to 'paid'. Without this, the deposit row
  // stays 'pending' forever even though the payment was approved.
  const rows = await tx
    .update(bookings)
    .set({
      status: newStatus,
      ...(newStatus === 'confirmed' ? { depositStatus: 'paid' as const } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(eq(bookings.id, bookingId), eq(bookings.status, 'pending_payment')),
    )
    .returning()

  if (rows.length === 0) return { won: false }

  if (newStatus === 'confirmed') {
    track.booking('booking.transition.confirmed', { bookingId })
  } else {
    track.booking('booking.transition.expired', { bookingId })
  }

  return { won: true, row: rowToBookingRow(rows[0]!) }
}
