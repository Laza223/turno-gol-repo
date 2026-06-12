import type { DailyAmount, NoShowMetric } from '@/modules/metrics/metrics.service'

// Helpers puros del dashboard de métricas (agregación client-side y copys de
// tendencia). Sin imports de React ni recharts: unit-testeables en aislamiento.

export type RevenueGranularity = 'day' | 'week' | 'month'

export type RevenueBucket = { label: string; amountCents: number }

/** 'YYYY-MM-DD' → componentes numéricos sin pasar por Date (evita drift TZ). */
function parseYmd(dateStr: string): { y: number; m: number; d: number } {
  const [y, m, d] = dateStr.split('-').map(Number)
  return { y, m, d }
}

/** Etiqueta corta es-AR 'dd/MM' desde 'YYYY-MM-DD'. */
export function dayLabel(dateStr: string): string {
  const { m, d } = parseYmd(dateStr)
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

/** Lunes (YYYY-MM-DD) de la semana a la que pertenece la fecha; semanas lunes-domingo. */
export function mondayOf(dateStr: string): string {
  const { y, m, d } = parseYmd(dateStr)
  const dt = new Date(Date.UTC(y, m - 1, d))
  // getUTCDay(): 0=domingo … 6=sábado → offset desde el lunes previo.
  const offset = (dt.getUTCDay() + 6) % 7
  dt.setUTCDate(dt.getUTCDate() - offset)
  return dt.toISOString().slice(0, 10)
}

/** Nombre de mes corto es-AR, ej. '2026-06-15' → 'jun 2026'. */
function monthLabel(dateStr: string): string {
  const { y, m } = parseYmd(dateStr)
  return new Intl.DateTimeFormat('es-AR', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)))
}

/**
 * Agrega la serie diaria de ingresos en baldes por día/semana/mes, preservando
 * el orden cronológico de la serie de entrada (que ya viene ascendente).
 * Semanas lunes-domingo; la etiqueta semanal es el lunes que la abre.
 */
export function groupRevenue(
  series: DailyAmount[],
  granularity: RevenueGranularity,
): RevenueBucket[] {
  if (granularity === 'day') {
    return series.map((d) => ({ label: dayLabel(d.date), amountCents: d.amountCents }))
  }
  const buckets = new Map<string, number>()
  for (const d of series) {
    const key = granularity === 'week' ? mondayOf(d.date) : d.date.slice(0, 7) + '-01'
    buckets.set(key, (buckets.get(key) ?? 0) + d.amountCents)
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, amountCents]) => ({
      label: granularity === 'week' ? `Sem ${dayLabel(key)}` : monthLabel(key),
      amountCents,
    }))
}

export type NoShowTrend =
  | { kind: 'no_prev' }
  | { kind: 'up' | 'down' | 'flat'; deltaPts: number }

/**
 * Tendencia de la tasa de ausencias vs la ventana anterior, en puntos
 * porcentuales. Sin reservas terminadas en la ventana previa no hay base de
 * comparación → 'no_prev'. Subir ausencias es malo (la UI lo pinta en rojo).
 */
export function noShowTrend(current: NoShowMetric, prev: NoShowMetric): NoShowTrend {
  if (prev.finished === 0) return { kind: 'no_prev' }
  // Redondeo a 1 decimal para que el copy y la dirección de la flecha coincidan.
  const deltaPts = Math.round((current.rate - prev.rate) * 1000) / 10
  if (deltaPts > 0) return { kind: 'up', deltaPts }
  if (deltaPts < 0) return { kind: 'down', deltaPts }
  return { kind: 'flat', deltaPts: 0 }
}

/**
 * Tiempo relativo en español rioplatense: 'recién', 'hace 3 min', 'hace 2 h',
 * 'hace 5 días'. Para timestamps futuros (clock skew) devuelve 'recién'.
 */
export function relativeTimeEs(iso: string, nowMs: number): string {
  const diffMs = nowMs - new Date(iso).getTime()
  if (!Number.isFinite(diffMs) || diffMs < 60_000) return 'recién'
  const min = Math.floor(diffMs / 60_000)
  if (min < 60) return `hace ${min} min`
  const hours = Math.floor(min / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'hace 1 día' : `hace ${days} días`
}

/** Formato moneda es-AR desde centavos, sin decimales (igual que /reportes). */
export function formatARS(cents: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
  }).format(cents / 100)
}
