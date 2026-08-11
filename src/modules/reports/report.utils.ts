import type { OpeningHours } from '@/modules/tenants/tenant.types'
import type { MethodReport } from './report.types'
import { capitalizeFirst } from '@/lib/format'
import { effectiveCloseMins, operatingDayRangeUtc } from '@/shared/time/operating-day'

function hhmmToMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

export type TrendDelta = { direction: 'up' | 'down'; label: string }

/**
 * % de cambio de `prev` a `current`, listo para `StatCard.delta` (§6.4). `null`
 * cuando no hay período previo comparable (`prev === 0`) — evita un "↑ Infinity%".
 */
export function computeDelta(
  current: number,
  prev: number,
  suffix = 'vs mes ant.',
): TrendDelta | null {
  if (prev === 0) return null
  const pct = Math.round(((current - prev) / prev) * 100)
  return { direction: pct >= 0 ? 'up' : 'down', label: `${Math.abs(pct)}% ${suffix}` }
}

const METHOD_LABELS: Record<MethodReport['method'], string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  mercadopago: 'MercadoPago',
  other: 'Otro',
}

/** Nombre es-AR de un método de pago (§8.1 — cero anglicismos en UI). */
export function formatMethodLabel(method: MethodReport['method']): string {
  return METHOD_LABELS[method]
}

// Matches getUTCDay() — 0=Sunday, 1=Monday, ..., 6=Saturday
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
type DayKey = (typeof DAY_KEYS)[number]

export type MonthBounds = {
  /** Primer día operativo del mes, 'YYYY-MM-DD' (inclusive). */
  fromDate: string
  /** Primer día operativo del mes siguiente, 'YYYY-MM-DD' (exclusivo). */
  toDate: string
  /** Instante en que ARRANCA `fromDate` como día operativo. */
  fromUtc: Date
  /** Instante en que arranca `toDate` — fin exclusivo del período. */
  toUtc: Date
}

/**
 * Límites de un mes (YYYY-MM) en día OPERATIVO del tenant.
 *
 * Antes esto devolvía medianoche UTC. En ART (UTC-3) eso hace que el mes
 * arranque a las 21:00 del último día del mes anterior: tres horas de cobros
 * que `/caja` cuenta en un mes y el reporte contaba en el otro. Con
 * `cutoffMins > 0` (complejos que cierran de madrugada) el corrimiento es
 * todavía mayor.
 *
 * Devuelve las dos formas a propósito, porque el período se consulta contra dos
 * cosas distintas: `cash_flows.occurred_at` es un instante y `bookings.date` ya
 * es un día operativo. Derivar una de la otra con `toISOString().split('T')[0]`
 * —que es lo que hacía el servicio— vuelve a meter el corrimiento por la
 * ventana.
 */
export function getMonthBounds(month: string, cutoffMins = 0): MonthBounds {
  const [year, mon] = month.split('-').map(Number)
  const pad = (n: number) => String(n).padStart(2, '0')
  const fromDate = `${year}-${pad(mon)}-01`
  const nextYear = mon === 12 ? year + 1 : year
  const nextMon = mon === 12 ? 1 : mon + 1
  const toDate = `${nextYear}-${pad(nextMon)}-01`

  return {
    fromDate,
    toDate,
    fromUtc: operatingDayRangeUtc(fromDate, cutoffMins).fromUtc,
    toUtc: operatingDayRangeUtc(toDate, cutoffMins).fromUtc,
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
  const result: MethodReport[] = []
  for (const [method, total] of Array.from(methodMap)) {
    if (total > 0) result.push({ method: method as MethodReport['method'], total })
  }
  return result
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
  // Mediodía UTC: el label sale del string del mes, sin pasar por los límites
  // del período (que ahora dependen del cutoff del tenant y no hacen falta acá).
  const d = new Date(`${month}-01T12:00:00Z`)
  return capitalizeFirst(
    d.toLocaleDateString('es-AR', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
  )
}

/**
 * Minutos reservables en `[fromDate, toDate)` (días OPERATIVOS, no calendario)
 * por `courtCount` canchas. Los días `closed`, los de `closedDates` y las
 * ventanas de largo cero aportan 0.
 *
 * El cierre lo resuelve `effectiveCloseMins` — el mismo que usan los
 * generadores de slots de la grilla — en vez del cálculo local que había acá.
 * No es un refactor cosmético: ese cálculo trataba `'00:00'` como 1440 pero
 * dejaba cualquier otro cierre de madrugada tal cual, así que un complejo con
 * `closes_next_day` abierto 08:00→02:00 daba `Math.max(0, 120 - 480) = 0`
 * minutos disponibles. Con el denominador en cero, `calcOccupancyPct` devolvía
 * 0% de ocupación TODOS los días — un complejo lleno se reportaba vacío.
 *
 * Recibe fechas 'YYYY-MM-DD' y no `Date`: antes iteraba instantes UTC y sacaba
 * el día con `toISOString()`/`getUTCDay()`, que en ART corre el día de semana
 * (y por lo tanto el horario aplicado) para todo lo que pase después de las
 * 21:00.
 */
export function calcAvailableMinutes(
  fromDate: string,
  toDate: string,
  openingHours: OpeningHours,
  courtCount: number,
  closedDates?: string[] | null,
  closesNextDay = false,
): number {
  if (courtCount === 0) return 0
  const closedSet = new Set(closedDates ?? [])
  let totalPerCourt = 0

  // Mediodía UTC para leer el día de la semana: inmune al corrimiento de zona
  // en ambos sentidos (mismo truco que `daySlotsFor` en day-bookings.ts).
  const cursor = new Date(`${fromDate}T12:00:00Z`)
  const end = new Date(`${toDate}T12:00:00Z`)

  while (cursor < end) {
    const dateStr = cursor.toISOString().slice(0, 10)
    if (!closedSet.has(dateStr)) {
      const dayKey = DAY_KEYS[cursor.getUTCDay()] as DayKey
      const hours = openingHours[dayKey]
      if (hours && !hours.closed) {
        const openMins = hhmmToMins(hours.open)
        const closeMins = effectiveCloseMins(hours.open, hours.close, closesNextDay)
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
