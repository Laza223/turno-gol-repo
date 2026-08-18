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

/**
 * Centavos de ARS → string de moneda. Ej: 1250000 → `"$ 12.500"`.
 *
 * El separador entre el `$` y el número es un **NBSP** (U+00A0), no un espacio
 * común y no nada. Al testear, el matcher de testing-library va con un espacio
 * COMÚN: la librería normaliza el texto que saca del DOM (colapsa `\s+`, que
 * incluye el NBSP) y NO normaliza el matcher, así que escribirlo con el NBSP
 * compara dos strings que se ven iguales y no lo son. El error que tira
 * —"Unable to find an element with the text"— se lee como si el componente no
 * hubiera renderizado, cuando renderizó perfecto.
 */
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

const pctFormatter = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })

/**
 * Porcentaje ya en escala 0–100 → texto es-AR. `0.2` → `"0,2%"`.
 *
 * F-011 (QA de producción 2026-08-17): la ocupación por cancha se interpolaba
 * cruda (`{c.occupancyPct}%`), o sea con el punto decimal de JavaScript, en una
 * pantalla donde todo lo demás ya usa coma (`$ 60.000,00`, `Tasa de ausencias
 * 0,0%`). El `%` se concatena a mano a propósito: `style: 'percent'` mete un
 * NBSP antes del signo y complica los matchers de test sin ganar nada.
 */
export function formatPct(value: number): string {
  return `${pctFormatter.format(value)}%`
}

/** "Desde $X" para tarjetas de complejo. Devuelve null si no hay precio. */
export function formatFromPrice(cents: number | null | undefined): string | null {
  if (cents == null) return null
  return `Desde ${formatArs(cents)}`
}

/**
 * Precio aproximado por jugador en centavos, redondeado hacia arriba al
 * múltiplo de $100 (10.000 centavos) más cercano.
 *
 * Lógica: toma el formato más chico del complejo (el que más probablemente
 * corresponde al `fromPriceCents`) y divide el precio entre el total de
 * jugadores (formato × 2). Si no hay formatos o precio, retorna null.
 *
 * Ej: $60.000 (6.000.000¢) ÷ 14 jugadores (F7) = ~$4.286 → $4.300.
 */
export function perPlayerPriceCents(
  fromPriceCents: number | null | undefined,
  formats: number[],
): number | null {
  if (fromPriceCents == null || formats.length === 0) return null
  const minFormat = Math.min(...formats)
  const totalPlayers = minFormat * 2
  const perPlayer = fromPriceCents / totalPlayers
  // Redondear hacia arriba a la centena de pesos más cercana (= 10.000 centavos).
  return Math.ceil(perPlayer / 10000) * 10000
}

/** Precio por jugador formateado: "~$4.300/jugador". Retorna null si no aplica. */
export function formatPerPlayer(
  fromPriceCents: number | null | undefined,
  formats: number[],
): string | null {
  const pp = perPlayerPriceCents(fromPriceCents, formats)
  if (pp == null) return null
  return `~${formatArs(pp)}/jugador`
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
