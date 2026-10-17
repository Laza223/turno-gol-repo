/**
 * Fechas del panel super-admin. En la base todo es UTC; acá se pasa a hora
 * argentina solo para mostrar. Formato de DESIGN.md (The Tabular Rule): "vie 3
 * jul", hora en 24 h, nada de ISO ni dd/mm/aaaa frente al usuario.
 */

const ART = 'America/Argentina/Buenos_Aires'

const dayFmt = new Intl.DateTimeFormat('es-AR', {
  timeZone: ART,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

const dayYearFmt = new Intl.DateTimeFormat('es-AR', {
  timeZone: ART,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const timeFmt = new Intl.DateTimeFormat('es-AR', {
  timeZone: ART,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** Intl agrega puntos ("vie., 3 oct.") que en una tabla densa sobran. */
function clean(value: string): string {
  return value.replace(/\./g, '').replace(',', '')
}

/** Date → "vie 3 oct". `null` → "—". */
export function formatShortDate(value: Date | null | undefined): string {
  return value ? clean(dayFmt.format(value)) : '—'
}

/** Date → "3 oct 2026": para lo que puede ser de otro año (alta de un complejo). */
export function formatDateWithYear(value: Date | null | undefined): string {
  return value ? clean(dayYearFmt.format(value)) : '—'
}

/** Date → "vie 3 oct · 18:40". */
export function formatShortDateTime(value: Date | null | undefined): string {
  return value ? `${formatShortDate(value)} · ${timeFmt.format(value)}` : '—'
}

/** 'YYYY-MM-DD' (día operativo, sin zona) → "vie 3 oct". */
export function formatDayStr(day: string): string {
  // Mediodía UTC: el día sale del string, sin corrimiento de zona.
  return formatShortDate(new Date(`${day}T15:00:00Z`))
}

/** "HH:MM:SS" de dos columnas → "18:00–19:00" (raya, sin espacios). */
export function formatTimeRange(start: string, end: string): string {
  return `${start.slice(0, 5)}–${end.slice(0, 5)}`
}
