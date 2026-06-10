// Argentina is UTC-3 with no DST (fixed offset, safe to use as constant).
const ART_OFFSET_MS = 3 * 3600_000

export function artDateOf(ts: Date): string {
  return new Date(ts.getTime() - ART_OFFSET_MS).toISOString().slice(0, 10)
}

export function todayART(): string {
  return artDateOf(new Date())
}
