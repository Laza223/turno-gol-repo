/**
 * Helpers de formateo para la interfaz pública.
 *
 * Los montos se guardan SIEMPRE en centavos de ARS (integer). Ver CLAUDE.md.
 * Estos helpers son la fuente única para mostrar precios/fechas en el front público.
 */

const arsFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

/** Centavos de ARS → string de moneda. Ej: 1250000 → "$12.500". */
export function formatArs(cents: number): string {
  return arsFormatter.format(Math.round(cents) / 100)
}

const arsContableFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Formato contable §8.2 (caja / cierres / reportes): 1250000 → "$ 12.500,00".
 * Recibe montos positivos por convención: el signo (−/+) y su color los pone el caller. */
export function formatArsContable(cents: number): string {
  return arsContableFormatter.format(Math.round(cents) / 100)
}

/** "Desde $X" para tarjetas de complejo. Devuelve null si no hay precio. */
export function formatFromPrice(cents: number | null | undefined): string | null {
  if (cents == null) return null
  return `Desde ${formatArs(cents)}`
}

const dateFormatter = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

/** Capitaliza solo la primera letra (no cada palabra, como hace `text-transform: capitalize`). */
export function capitalizeFirst(value: string): string {
  return value.length === 0 ? value : value.charAt(0).toUpperCase() + value.slice(1)
}

/** Date | "YYYY-MM-DD" → "Lunes, 2 de junio". */
export function formatDateLong(value: Date | string): string {
  const d = typeof value === 'string' ? parseDateOnly(value) : value
  return capitalizeFirst(dateFormatter.format(d))
}

const dateShortFormatter = new Intl.DateTimeFormat('es-AR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

/** Date | "YYYY-MM-DD" → "vie 3 jul". */
export function formatDateShort(value: Date | string): string {
  const d = typeof value === 'string' ? parseDateOnly(value) : value
  return dateShortFormatter.format(d).replace(/\./g, '')
}

/** Parsea "YYYY-MM-DD" como fecha local (evita el shift UTC de new Date(str)). */
function parseDateOnly(value: string): Date {
  const [y, m, day] = value.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, day ?? 1)
}

/** "HH:MM:SS" | "HH:MM" → "HH:MM". */
export function formatTime(value: string): string {
  return value.slice(0, 5)
}

/** Iniciales de un nombre para avatares. Ej: ("Tomás", "Pérez") → "TP". */
export function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
}
