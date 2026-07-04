/**
 * Helpers puros de la vista Caja (pages/caja.md). Sin React ni DB: todo
 * unit-testeable. Los montos entran en centavos positivos; el signo visual
 * (−/+) lo pone el caller o el label ya armado acá.
 */

import { formatArs } from '@/lib/format'
import type { CashFlowCategory, DailyCashCloseRow } from '@/modules/cashflow/cashflow.types'

// ── Métodos de pago ──────────────────────────────────────────────────────────

export type MethodKey = 'cash' | 'transfer' | 'mercadopago' | 'other'

export const METHOD_LABELS: Record<MethodKey, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  mercadopago: 'MercadoPago',
  other: 'Otro',
}

// Orden fijo de arqueo: el efectivo (lo que se cuenta) primero.
const METHOD_ORDER: MethodKey[] = ['cash', 'transfer', 'mercadopago', 'other']

export type MethodTotal = { key: MethodKey; label: string; total: number }

/** Desglose neto por método en orden canónico; solo los métodos con movimientos. */
export function methodBreakdown(
  byMethod: Partial<Record<MethodKey, number>>,
): MethodTotal[] {
  return METHOD_ORDER.filter((key) => byMethod[key] !== undefined).map((key) => ({
    key,
    label: METHOD_LABELS[key],
    total: byMethod[key] ?? 0,
  }))
}

// ── Categorías ───────────────────────────────────────────────────────────────

/**
 * Labels en español para los ENUMs de cash_flows. 'other' es ambiguo sin el
 * tipo: como ingreso es "Otro ingreso", como ajuste es "Ajuste".
 * `abonado_payment` faltaba y el enum crudo llegaba a la UI (fix pages/caja.md §1.8).
 */
export function categoryLabel(type: string, category: string): string {
  if (category === 'booking') return 'Reserva'
  if (category === 'product_sale') return 'Cantina/Bar'
  if (category === 'abonado_payment') return 'Saldo de abonado'
  if (category === 'operating_expense') return 'Gasto operativo'
  if (category === 'no_show_correction') return 'Corrección por ausencia'
  if (category === 'other') return type === 'adjustment' ? 'Ajuste' : 'Otro ingreso'
  return category
}

export const CATEGORY_BADGE: Record<CashFlowCategory | 'fallback', string> = {
  booking:
    'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-600/20 dark:ring-emerald-500/30',
  product_sale:
    'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 ring-sky-600/20 dark:ring-sky-500/30',
  abonado_payment:
    'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 ring-violet-600/20 dark:ring-violet-500/30',
  operating_expense:
    'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 ring-red-600/20 dark:ring-red-500/30',
  no_show_correction:
    'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-600/20 dark:ring-amber-500/30',
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

/** Subtítulo del header: prefijo relativo §8.3 (Hoy/Ayer) + fecha media. */
export function cajaDateLabel(dateStr: string, todayArt: string): string {
  const medium = mediumDateLabel(dateStr)
  if (dateStr === todayArt) return `Hoy — ${medium}`
  if (dateStr === addDays(todayArt, -1)) return `Ayer — ${medium}`
  return medium
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
    delta === 0 ? 'neutral' : (delta > 0) !== (opts.invert ?? false) ? 'positive' : 'negative'
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

// ── Cierre ───────────────────────────────────────────────────────────────────

export type CloseView = {
  /** false = el server guardó declaredCash=0 con diff=balance: no hubo arqueo
   * declarado (indistinguible de "declaró $0"); ocultar Efectivo/Diferencia
   * para no mostrar una alarma falsa. */
  hasCashCount: boolean
  hasDiff: boolean
}

export function closeView(close: Pick<DailyCashCloseRow, 'declaredCash' | 'diffAmount' | 'balance'>): CloseView {
  const hasCashCount = !(close.declaredCash === 0 && close.diffAmount === close.balance)
  return { hasCashCount, hasDiff: hasCashCount && close.diffAmount !== 0 }
}
