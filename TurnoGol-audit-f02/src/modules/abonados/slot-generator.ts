export type GenerateSlotsOpts = {
  dayOfWeek: number
  startsOn: string
  endsOn: string | null
  fromDate: string
  count: number
  closedDates: string[]
}

export function generateSlotDates(opts: GenerateSlotsOpts): string[] {
  const { dayOfWeek, startsOn, endsOn, fromDate, count, closedDates } = opts
  const closedSet = new Set(closedDates)
  const result: string[] = []

  // Start from max(fromDate, startsOn)
  const startMs = Math.max(parseDate(fromDate), parseDate(startsOn))
  const endMs = endsOn ? parseDate(endsOn) : Infinity

  // Find first occurrence of dayOfWeek >= startMs
  let current = startMs
  const startDow = getDow(current)
  const daysUntilTarget = (dayOfWeek - startDow + 7) % 7
  current += daysUntilTarget * 86_400_000

  while (current <= endMs && result.length < count) {
    const dateStr = toDateStr(current)
    if (!closedSet.has(dateStr)) {
      result.push(dateStr)
    }
    current += 7 * 86_400_000
  }

  return result
}

function parseDate(str: string): number {
  return new Date(`${str}T00:00:00Z`).getTime()
}

function getDow(ms: number): number {
  return new Date(ms).getUTCDay()
}

function toDateStr(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}
