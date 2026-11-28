/**
 * Helpers puros de meses y fechas calendario para abonos y saldados.
 * Sin dependencias de DB o React para reutilizarse entre UI, server actions y services.
 */

const MONTH_NAMES_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const

/** Devuelve true si `ym` tiene formato `YYYY-MM` válido (mes `01..12`). */
export function isValidYearMonth(ym: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(ym)
}

/** Último día calendario (`YYYY-MM-DD`) del mes `YYYY-MM`. */
function monthEndDateStr(ym: string): string {
  const [yStr, mStr] = ym.split('-')
  const year = Number(yStr)
  const month = Number(mStr)
  // Día 0 del mes siguiente en UTC = último día de este mes.
  const lastDay = new Date(Date.UTC(year, month, 0))
  return lastDay.toISOString().slice(0, 10)
}

function monthStartDateStr(ym: string): string {
  return `${ym}-01`
}

/**
 * Rango inclusivo `[periodStart, periodEnd]` para cubrir un mes calendario.
 * Si se indica `startsFromDate` dentro de ese mismo mes, acota el inicio a esa
 * fecha para que un abono que arranca a mitad de mes no reclame fechas pasadas.
 */
export function resolveMonthlyCoverageBounds(
  ym: string,
  startsFromDate?: string,
): { periodStart: string; periodEnd: string } {
  const first = monthStartDateStr(ym)
  const last = monthEndDateStr(ym)
  const periodStart =
    startsFromDate && startsFromDate > first && startsFromDate <= last ? startsFromDate : first
  return { periodStart, periodEnd: last }
}

/** "2026-11" → "Noviembre 2026" (con mayúscula inicial, español argentino). */
export function formatYearMonthEs(ym: string): string {
  if (!isValidYearMonth(ym)) return ym
  const [yStr, mStr] = ym.split('-')
  const name = MONTH_NAMES_ES[Number(mStr) - 1] ?? ''
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${yStr}`
}

/** Suma `delta` meses a un `YYYY-MM` devolviendo otro `YYYY-MM`. */
function shiftYearMonth(ym: string, delta: number): string {
  const [yStr, mStr] = ym.split('-')
  const d = new Date(Date.UTC(Number(yStr), Number(mStr) - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Próximos `count` meses calendario empezando desde `startYm` (inclusive). */
export function listUpcomingYearMonths(
  startYm: string,
  count = 6,
): Array<{ value: string; label: string }> {
  return Array.from({ length: count }, (_, i) => {
    const value = shiftYearMonth(startYm, i)
    return { value, label: formatYearMonthEs(value) }
  })
}
