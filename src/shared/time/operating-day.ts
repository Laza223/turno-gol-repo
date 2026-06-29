/**
 * Operating-day ("día operativo") time helpers.
 *
 * A complex can close after midnight (00:00–04:00). When `closes_next_day` is
 * on, those late hours belong to the SAME operating day as the evening they
 * follow: a turn at 01:00 of Tuesday (calendar) belongs to Monday (operating).
 * `bookings.date` stores the operating day, so the grid, cash close and reports
 * group the whole night together.
 *
 * Slots are laid out on a continuous "minutes from the open day's midnight"
 * axis: 08:00 → 480, 23:00 → 1380, the 23:00→24:00 slot ends at 1440, and the
 * post-midnight slots continue at 1440 (00:00), 1500 (01:00)… This keeps the
 * slot loop monotonic, the grid ordered (late hours render after 23:00) and
 * past-detection correct without per-slot day math.
 */

export const END_OF_DAY_MINS = 24 * 60

function hhmmToMins(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

function minsToHhmm(mins: number): string {
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Effective close in minutes from the open day's midnight.
 *
 *  - close `00:00` ALWAYS means midnight = end of day (1440). Long-standing
 *    convention so "cierra a medianoche" is a valid same-day schedule.
 *  - when `closesNextDay` is on AND close ≤ open (e.g. open 08:00, close 02:00),
 *    the close falls on the FOLLOWING calendar day, so it lands at close + 1440.
 *    A day whose close is still > open (e.g. 23:00) stays same-day even with the
 *    flag on, which is exactly what lets one global flag serve mixed per-day
 *    schedules (sun 23:00 same-day, fri 02:00 next-day).
 */
export function effectiveCloseMins(
  openHhmm: string,
  closeHhmm: string,
  closesNextDay: boolean,
): number {
  const open = hhmmToMins(openHhmm)
  const close = hhmmToMins(closeHhmm)
  if (close === 0) return END_OF_DAY_MINS
  if (closesNextDay && close <= open) return close + END_OF_DAY_MINS
  return close
}

/**
 * Time label for a slot END expressed in continuous minutes.
 *
 * The slot ending exactly at calendar midnight is `'24:00'` — a valid Postgres
 * TIME that is `> '23:00'`, so the `chk_time_valid` (time_end > time_start)
 * constraint accepts the 23:00→24:00 slot. Post-midnight ends wrap to normal
 * wall-clock (`'01:00'`, `'02:00'`…): those rows store the next calendar day's
 * clock time, with the operating day living in `bookings.date`.
 */
export function endLabelFromMins(mins: number): string {
  if (mins === END_OF_DAY_MINS) return '24:00'
  return minsToHhmm(mins)
}

/**
 * Normalises a stored booking range onto the open-day continuous axis so a
 * post-midnight booking (stored with small wall-clock times like 00:00–01:00)
 * overlap-matches the post-midnight slots (start ≥ 1440). Pre-midnight ranges
 * and the 23:00→24:00 range are returned unchanged.
 *
 * Callers must already have collapsed a legacy `time_end = '00:00'` into 1440
 * before calling (the `endMins === 0 ? 1440` guard) so the midnight end is not
 * mistaken for a post-midnight start.
 */
export function normalizeRangeToOpenDay(
  startMins: number,
  endMins: number,
  openMins: number,
  closesNextDay: boolean,
): { startMins: number; endMins: number } {
  if (closesNextDay && startMins < openMins) {
    return {
      startMins: startMins + END_OF_DAY_MINS,
      endMins: endMins + END_OF_DAY_MINS,
    }
  }
  return { startMins, endMins }
}
