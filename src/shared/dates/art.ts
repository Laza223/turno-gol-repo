/**
 * Argentina time (UTC-3, no DST) helpers.
 *
 * Argentina does not observe DST, so the offset is always fixed at UTC-3.
 * All functions use the UTC-3 approximation (subtract 3h from UTC) rather than
 * a timezone database to avoid a runtime dependency.
 */

/** Returns today's date string in YYYY-MM-DD format in Argentine time (UTC-3). */
export function artTodayStr(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * Adds `days` to a YYYY-MM-DD string (can be negative).
 * Uses UTC arithmetic to avoid DST shifts.
 */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
