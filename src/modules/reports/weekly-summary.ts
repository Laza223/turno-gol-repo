import { formatArs } from '@/lib/format'
import { addDays } from '@/shared/dates/art'
import type { WeeklySummaryData } from '@/modules/notifications/templates/weekly-summary'
import type { MethodReport, WeekRevenue } from './report.types'
import { computeDelta, formatMethodLabel } from './report.utils'

/** Mismo orden que "Por dónde entró" en Métricas (`MethodSummary`, MonthBoard.tsx). */
const METHOD_ORDER: MethodReport['method'][] = ['cash', 'mercadopago', 'transfer']

/**
 * Primer día de la semana a resumir, o `null` si hoy no sale el semanal.
 *
 * Sale los lunes y cubre la semana operativa lun–dom que terminó ayer: el
 * barrido del diario corre a las 08:00 ART y ya pasa AYER, así que el domingo
 * llega cerrado. `today` es el día OPERATIVO del complejo, no el calendario.
 */
export function weeklySummaryWeekStart(today: string): string | null {
  // Mediodía UTC para leer el día de semana: inmune al corrimiento de zona
  // (mismo truco que `calcAvailableMinutes`).
  const isMonday = new Date(`${today}T12:00:00Z`).getUTCDay() === 1
  return isMonday ? addDays(today, -7) : null
}

function dayParts(date: string): { weekday: string; day: string; month: string } {
  const d = new Date(`${date}T12:00:00Z`)
  return {
    weekday: d.toLocaleDateString('es-AR', { weekday: 'short', timeZone: 'UTC' }).replace('.', ''),
    day: d.toLocaleDateString('es-AR', { day: 'numeric', timeZone: 'UTC' }),
    month: d.toLocaleDateString('es-AR', { month: 'long', timeZone: 'UTC' }),
  }
}

/** "lun 13 al dom 19 de octubre"; si cruza de mes, "lun 27 de octubre al dom 2 de noviembre". */
function weekRangeLabel(weekStart: string): string {
  const from = dayParts(weekStart)
  const to = dayParts(addDays(weekStart, 6))
  const fromLabel =
    from.month === to.month
      ? `${from.weekday} ${from.day}`
      : `${from.weekday} ${from.day} de ${from.month}`
  return `${fromLabel} al ${to.weekday} ${to.day} de ${to.month}`
}

/**
 * Contenido del mail semanal. Contenido elegido por el dueño (2026-10-22): lo
 * que entró, por dónde y el % contra la semana anterior. Son dos semanas
 * completas, así que el % es justo; sin ingresos la semana anterior no hay
 * comparación (`computeDelta` → `null`).
 */
export function buildWeeklySummary(weekStart: string, revenue: WeekRevenue): WeeklySummaryData {
  const total = (m: MethodReport['method']) =>
    revenue.byMethod.find((r) => r.method === m)?.total ?? 0
  const methods = total('other') > 0 ? [...METHOD_ORDER, 'other' as const] : METHOD_ORDER
  const delta = computeDelta(revenue.income, revenue.prevIncome, 'vs la semana anterior')

  return {
    kind: 'weekly',
    weekLabel: weekRangeLabel(weekStart),
    totalArs: formatArs(revenue.income),
    comparison: delta ? { ...delta, prevArs: formatArs(revenue.prevIncome) } : null,
    methods: methods.map((m) => ({ label: formatMethodLabel(m), amountArs: formatArs(total(m)) })),
  }
}
