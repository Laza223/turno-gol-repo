/**
 * Helpers puros de la vista Caja (pages/caja.md). Sin React ni DB: todo
 * unit-testeable. Los montos entran en centavos positivos; el signo visual
 * (−/+) lo pone el caller o el label ya armado acá.
 */

import { formatArs } from '@/lib/format'
import { METHOD_LABELS, type MethodKey } from '@/lib/payment-method'
import { startLabelFromMins } from '@/shared/time/operating-day'

// ── Métodos de pago ──────────────────────────────────────────────────────────
// Fuente canónica: @/lib/payment-method (la necesitan componentes fuera de
// app/, ver BookingPopover). El tipo se re-exporta acá para no tocar los
// consumidores existentes de caja-lib; los labels se importan de la fuente.

export { type MethodKey }

// Orden fijo de arqueo: el efectivo (lo que se cuenta) primero.
const METHOD_ORDER: MethodKey[] = ['cash', 'transfer', 'mercadopago', 'other']

export const METHOD_OPTIONS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'mercadopago', label: 'MercadoPago' },
] as const

export type SaleMethod = (typeof METHOD_OPTIONS)[number]['value']

export type MethodTotal = { key: MethodKey; label: string; total: number }

/** Desglose neto por método en orden canónico; solo los métodos con movimientos. */
export function methodBreakdown(byMethod: Partial<Record<MethodKey, number>>): MethodTotal[] {
  return METHOD_ORDER.filter((key) => byMethod[key] !== undefined).map((key) => ({
    key,
    label: METHOD_LABELS[key],
    total: byMethod[key] ?? 0,
  }))
}

// ── Stock de cantina (canteen_products, migr. 048) ────────────────────────────

export type StockBadge = { label: string; tone: 'ok' | 'low' | 'out' }

/**
 * Badge de stock para un producto de cantina real (canteen_products). `stock`
 * null/undefined = sin control de stock → sin badge. 0 (o negativo, defensivo)
 * → "Agotado" SIEMPRE, aunque el producto no tenga `minStock` cargado.
 * Con `minStock` definido y `stock <= minStock` → "Quedan N" (alerta). Sin
 * `minStock` (null) nunca hay alerta "low" — solo el corte duro en 0.
 */
export function canteenStockBadge(
  stock?: number | null,
  minStock?: number | null,
): StockBadge | null {
  if (stock == null) return null
  if (stock <= 0) return { label: 'Agotado', tone: 'out' }
  if (minStock != null && stock <= minStock) return { label: `Quedan ${stock}`, tone: 'low' }
  return { label: `Stock ${stock}`, tone: 'ok' }
}

/**
 * Clases de color por tono del badge de stock — UN solo lugar (vivía duplicado
 * en TicketPanel y ProductsTable, y las dos copias usaban amber-600, que no
 * llega a AA 4.5:1 sobre la card clara con Tailwind 4/OKLCH; axe lo cazó).
 * amber-800 = mismo criterio que status-banner; red-700 = mismo que los gastos
 * del libro de Cuentas (NightLedger).
 */
export function stockBadgeToneClass(tone: StockBadge['tone']): string {
  if (tone === 'out') return 'text-red-700 dark:text-red-400'
  if (tone === 'low') return 'text-amber-800 dark:text-amber-300'
  return 'text-muted-foreground'
}

/**
 * ¿Este producto pide una reposición? Es el MISMO corte que el badge "low" y
 * "out" de arriba, dicho como predicado para poder contarlo.
 *
 * Existe para que el aviso agregado (el punto ámbar de la pestaña Productos) y
 * el badge de cada fila no puedan discrepar: un contador que dice "2 bajo el
 * mínimo" mientras las filas muestran tres badges ámbar destruye la confianza
 * en el aviso, que es lo único que hace que alguien lo mire. `lowStockCount()`
 * de `canteen.service.ts` replica este predicado en SQL para las pantallas que
 * no cargan el catálogo.
 */
function isLowStock(p: { stock: number | null; minStock: number | null }): boolean {
  const badge = canteenStockBadge(p.stock, p.minStock)
  return badge?.tone === 'low' || badge?.tone === 'out'
}

/** Los productos activos que piden reposición, en el orden en que llegan. Ver `isLowStock`. */
export function productsToRestock<
  T extends { stock: number | null; minStock: number | null; isActive: boolean },
>(products: T[]): T[] {
  return products.filter((p) => p.isActive && isLowStock(p))
}

/** Cuántos productos activos piden reposición. Ver `isLowStock`. */
export function countLowStock(
  products: { stock: number | null; minStock: number | null; isActive: boolean }[],
): number {
  return productsToRestock(products).length
}

/**
 * Para cuántas noches alcanza el stock al ritmo de los últimos 7 días (lo
 * vendido en la semana, repartido en siete noches). `null` cuando no hay ritmo
 * que medir: el producto no lleva stock o no se vendió en la semana. 0 = no
 * alcanza para una noche entera.
 */
export function nightsOfStockLeft(stock: number | null, unitsLast7Days: number): number | null {
  if (stock == null || unitsLast7Days <= 0) return null
  return Math.max(Math.floor((stock * 7) / unitsLast7Days), 0)
}

// ── Categorías ───────────────────────────────────────────────────────────────

/**
 * Labels en español para los ENUMs de cash_flows. 'other' es ambiguo sin el
 * tipo: como ingreso es "Otro ingreso", como ajuste es "Ajuste".
 */
export function categoryLabel(type: string, category: string): string {
  if (category === 'booking') return 'Reserva'
  if (category === 'product_sale') return 'Cantina/Bar'
  if (category === 'operating_expense') return 'Gasto operativo' // legacy pre-050
  if (category === 'merchandise') return 'Mercadería'
  if (category === 'salaries') return 'Sueldos'
  if (category === 'utilities') return 'Servicios'
  if (category === 'maintenance') return 'Mantenimiento'
  if (category === 'other_expense') return 'Otro gasto'
  if (category === 'no_show_correction') return 'Corrección por ausencia'
  if (category === 'tournament') return 'Inscripción a torneo' // migr. 066
  if (category === 'other') return type === 'adjustment' ? 'Ajuste' : 'Otro ingreso'
  return category
}

/**
 * Título legible de un movimiento en la lista del día. Los tres emisores de la
 * seña escriben `Seña — turno <uuid>` (depositCashFlowDescription,
 * booking.charges.ts) — sin esto, la lista mostraba el UUID crudo. El string
 * persistido NO se toca: `getDebts` lo compara tal cual en SQL para calcular
 * la deuda de turnos con seña.
 */
export function movementTitle(description: string): string {
  if (description.startsWith('Seña — turno ')) return 'Seña del turno'
  return description
}

// ── Fechas ───────────────────────────────────────────────────────────────────

/** Suma días a una fecha "YYYY-MM-DD" (aritmética UTC pura, sin TZ del host). */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * `?dia=AAAA-MM-DD` de Cuentas: el día operativo que se mira. Una fecha mal
 * escrita, que no existe (mes 13, día 00, 30 de febrero) o posterior a hoy
 * vuelve a hoy (no hay movimientos del futuro). Nunca tira: `addDays` con una
 * fecha imposible revienta en `toISOString`, así que no se usa para validar.
 */
export function parseCajaDay(raw: string | undefined, today: string): string {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return today
  const d = new Date(raw + 'T00:00:00Z')
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) return today
  return raw <= today ? raw : today
}

/** "YYYY-MM-DD" → "mié 2 de julio" (formato medio §8.3, armado por partes:
 * el string completo del locale varía entre versiones de ICU). */
export function mediumDateLabel(dateStr: string): string {
  const [y, m, day] = dateStr.split('-').map(Number)
  // Date-only como UTC + formateo en UTC: inmune a la TZ del host.
  const d = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, day ?? 1))
  const tz = { timeZone: 'UTC' } as const
  const weekday = d.toLocaleDateString('es-AR', { weekday: 'short', ...tz }).replace('.', '')
  const dayNum = d.toLocaleDateString('es-AR', { day: 'numeric', ...tz })
  const month = d.toLocaleDateString('es-AR', { month: 'long', ...tz })
  return `${weekday} ${dayNum} de ${month}`
}

/** "jue 24 sep": la fecha corta de las flechas de día de Cuentas. */
export function shortDateLabel(dateStr: string): string {
  const [weekday = '', day = '', , month = ''] = mediumDateLabel(dateStr).split(' ')
  return `${weekday} ${day} ${month.slice(0, 3)}`
}

/**
 * Rótulo del día de trabajo: "vie 12 de septiembre" o, para un complejo que
 * cierra pasada la medianoche, "vie 12 de septiembre · desde las 06:00".
 *
 * El día de Caja no es el del calendario: arranca en el corte nocturno del
 * complejo (`nightCutoffMins`), así que una venta de la 01:00 cuenta para la
 * noche anterior. Ese criterio no se veía en ningún lado y es lo que hace que
 * los totales "no cierren" a ojo cuando el complejo trabaja de madrugada.
 *
 * Con `cutoffMins` 0 —la inmensa mayoría de los complejos— el día ES el
 * calendario y la coletilla no aparece: ahí decir "desde las 00:00" no informa
 * nada y agrega ruido a una pantalla que vive de leerse rápido.
 */
export function operatingDayLabel(dateStr: string, cutoffMins: number): string {
  const base = mediumDateLabel(dateStr)
  if (cutoffMins <= 0) return base
  return `${base} · desde las ${startLabelFromMins(cutoffMins)}`
}

/** Hora ART en 24h §8.3 ("23:40"). Sin hourCycle explícito, algunos ICU
 * resuelven es-AR como 12h ("11:40 p. m.") — h23 lo fija en todos los hosts. */
export function formatTimeArt(date: Date): string {
  return date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

// ── Deltas de KPI ────────────────────────────────────────────────────────────

export type KpiDelta = {
  label: string
  direction: 'up' | 'down' | 'neutral'
  tone: 'positive' | 'negative' | 'neutral'
}

/** "+$ 1.500" / "−$ 800" / "$ 0" — deltas sin decimales (comparativa, no asiento). */
export function signedArs(delta: number): string {
  if (delta > 0) return `+${formatArs(delta)}`
  if (delta < 0) return `−${formatArs(-delta)}`
  return formatArs(0)
}

/**
 * Delta para StatCard: glifo = qué hizo el número, tone = si eso es bueno.
 * Para egresos (`invert`) subir es malo. Devuelve null cuando no hay nada que
 * comparar (día y referencia en cero: tenant nuevo, "→ $ 0 vs ayer" es ruido).
 */
export function buildDelta(
  current: number,
  reference: number,
  compareLabel: string,
  opts: { invert?: boolean } = {},
): KpiDelta | null {
  if (current === 0 && reference === 0) return null
  const delta = current - reference
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral'
  const tone =
    delta === 0 ? 'neutral' : delta > 0 !== (opts.invert ?? false) ? 'positive' : 'negative'
  return { label: `${signedArs(delta)} ${compareLabel}`, direction, tone }
}

// ── Chips ────────────────────────────────────────────────────────────────────

/** Receta única de chip seleccionable (pages/caja.md §7): la usan el modal de
 * movimiento y la venta rápida de cantina. Activo = emerald AA en ambos temas. */
export function chipClass(active: boolean): string {
  return `h-11 rounded-md border px-2 text-xs font-medium transition-colors disabled:opacity-60 md:h-10 ${
    active
      ? 'border-emerald-600 bg-primary/10 text-emerald-800 dark:border-emerald-500 dark:bg-emerald-500/15 dark:text-emerald-300'
      : 'border-border bg-card text-muted-foreground hover:bg-accent'
  }`
}
