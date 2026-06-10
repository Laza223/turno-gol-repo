import type { OpeningHours } from '@/modules/tenants/tenant.types'
import type { MethodReport } from './report.types'
import { capitalizeFirst } from '@/lib/format'

// Matches getUTCDay() — 0=Sunday, 1=Monday, ..., 6=Saturday
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
type DayKey = (typeof DAY_KEYS)[number]

/** Returns UTC midnight for the first day of `month` (YYYY-MM) and the first day of the next month. */
export function getMonthBounds(month: string): { from: Date; to: Date } {
  const [year, mon] = month.split('-').map(Number)
  return {
    from: new Date(Date.UTC(year, mon - 1, 1)),
    to: new Date(Date.UTC(year, mon, 1)),
  }
}

/** Returns "YYYY-MM" for the month before the given month string. */
export function prevMonthStr(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  const d = new Date(Date.UTC(year, mon - 2, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Returns "YYYY-MM" for the month after the given month string. */
export function nextMonthStr(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  const d = new Date(Date.UTC(year, mon, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Una fila agregada de cash_flows por (type, method). `total` puede llegar como
 * string (BIGINT de Postgres), por eso se normaliza con Number(). */
export type CashflowTypeMethodRow = { type: string; method: string; total: number | string }

/**
 * Agrega el total por método de pago considerando SOLO los movimientos de tipo
 * `income`. Los `adjustment` no representan ingresos por método y no deben
 * inflar la tabla "Por método de pago" (#43). Descarta métodos con total <= 0.
 */
export function aggregateByMethod(rows: CashflowTypeMethodRow[]): MethodReport[] {
  const methodMap = new Map<string, number>()
  for (const r of rows) {
    if (r.type !== 'income') continue
    methodMap.set(r.method, (methodMap.get(r.method) ?? 0) + Number(r.total))
  }
  return Array.from(methodMap.entries())
    .filter(([, total]) => total > 0)
    .map(([method, total]) => ({ method: method as MethodReport['method'], total }))
}

/**
 * Un reporte está vacío solo si no hay ingresos, ni ajustes, ni reservas. Antes
 * se ignoraba `adjustment`, ocultando períodos con solo ajustes de caja (#42).
 */
export function isReportEmpty(r: {
  income: number
  adjustment: number
  bookingCount: number
}): boolean {
  return r.income === 0 && r.adjustment === 0 && r.bookingCount === 0
}

/** Returns a Spanish locale label like "mayo 2026". */
export function formatMonthLabel(month: string): string {
  const { from } = getMonthBounds(month)
  return capitalizeFirst(
    from.toLocaleDateString('es-AR', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
  )
}

/**
 * Total available booking minutes in [from, to) across courtCount courts.
 * Uses tenant opening hours per day-of-week. close='00:00' means midnight (1440 min).
 * Days with `closed: true`, in `closedDates`, or zero-length windows contribute 0 minutes.
 */
export function calcAvailableMinutes(
  from: Date,
  to: Date,
  openingHours: OpeningHours,
  courtCount: number,
  closedDates?: string[] | null,
): number {
  if (courtCount === 0) return 0
  const closedSet = new Set(closedDates ?? [])
  let totalPerCourt = 0
  const cursor = new Date(from)
  while (cursor < to) {
    const dateStr = cursor.toISOString().slice(0, 10)
    if (!closedSet.has(dateStr)) {
      const dayKey = DAY_KEYS[cursor.getUTCDay()] as DayKey
      const hours = openingHours[dayKey]
      if (hours && !hours.closed) {
        const [openH, openM] = hours.open.split(':').map(Number)
        const [closeH, closeM] = hours.close.split(':').map(Number)
        const openMins = openH * 60 + openM
        // '00:00' close means midnight of next day = 1440 total minutes
        const closeMins = closeH === 0 && closeM === 0 ? 24 * 60 : closeH * 60 + closeM
        totalPerCourt += Math.max(0, closeMins - openMins)
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return totalPerCourt * courtCount
}

/** Returns occupancy as a 0–100 number rounded to 1 decimal. Returns 0 if availableMinutes is 0. */
export function calcOccupancyPct(bookedMinutes: number, availableMinutes: number): number {
  if (availableMinutes === 0) return 0
  return Math.round((bookedMinutes / availableMinutes) * 1000) / 10
}

/** Converts an array of objects to an RFC 4180 CSV string. Returns '' for empty input. */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (v: unknown): string => {
    const s = String(v ?? '')
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ].join('\r\n')
}
