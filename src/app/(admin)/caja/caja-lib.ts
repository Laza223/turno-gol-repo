/**
 * Helpers puros de la vista Caja (pages/caja.md). Sin React ni DB: todo
 * unit-testeable. Los montos entran en centavos positivos; el signo visual
 * (−/+) lo pone el caller o el label ya armado acá.
 */

import { formatArs } from '@/lib/format'
import { METHOD_LABELS, type MethodKey } from '@/lib/payment-method'
import { startLabelFromMins } from '@/shared/time/operating-day'
import type { CashFlowCategory } from '@/modules/cashflow/cashflow.types'

// ── Métodos de pago ──────────────────────────────────────────────────────────
// Fuente canónica: @/lib/payment-method (la necesitan componentes fuera de
// app/, ver BookingPopover). Re-exportadas acá para no tocar los consumidores
// existentes de caja-lib.

export { METHOD_LABELS, type MethodKey }

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
 * amber-800 = mismo criterio que status-banner; red-700 = mismo que SignedAmount.
 */
export function stockBadgeToneClass(tone: StockBadge['tone']): string {
  if (tone === 'out') return 'text-red-700 dark:text-red-400'
  if (tone === 'low') return 'text-amber-800 dark:text-amber-300'
  return 'text-muted-foreground'
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

export const CATEGORY_BADGE: Record<CashFlowCategory | 'fallback', string> = {
  booking:
    'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-600/20 dark:ring-emerald-500/30',
  product_sale:
    'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 ring-sky-600/20 dark:ring-sky-500/30',
  // Todos los gastos comparten la familia roja: el color codifica el SIGNO
  // (egreso), no la categoría — el texto del chip diferencia (migr. 050).
  operating_expense:
    'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 ring-red-600/20 dark:ring-red-500/30',
  merchandise:
    'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 ring-red-600/20 dark:ring-red-500/30',
  salaries:
    'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 ring-red-600/20 dark:ring-red-500/30',
  utilities:
    'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 ring-red-600/20 dark:ring-red-500/30',
  maintenance:
    'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 ring-red-600/20 dark:ring-red-500/30',
  other_expense:
    'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 ring-red-600/20 dark:ring-red-500/30',
  no_show_correction:
    'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-600/20 dark:ring-amber-500/30',
  // Ingreso (migr. 066), pero con familia propia: el violeta lo separa de la
  // reserva y de la cantina en el listado del día sin depender del texto.
  tournament:
    'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-violet-600/20 dark:ring-violet-500/30',
  other: 'bg-muted text-foreground ring-slate-500/20',
  fallback: 'bg-muted text-foreground ring-slate-500/20',
}

// ── Fechas ───────────────────────────────────────────────────────────────────

/** Suma días a una fecha "YYYY-MM-DD" (aritmética UTC pura, sin TZ del host). */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
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
