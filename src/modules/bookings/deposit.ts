/**
 * Deposit (seña) calculation for online bookings.
 *
 * Pure and dependency-free so the rounding/boundary behavior can be unit-tested
 * without the DB. `booking.service` imports this for the single production site
 * that computes a booking's deposit.
 */

/**
 * Deposit amount in integer cents for a given price (cents) and percentage.
 * Uses round-half-up (JS Math.round) — ties break toward +∞, not banker's rounding.
 */
export function calcDepositCents(priceSnapshotCents: number, depositPercentage: number): number {
  return Math.round((priceSnapshotCents * depositPercentage) / 100)
}
