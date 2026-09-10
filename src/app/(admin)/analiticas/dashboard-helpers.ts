import type { DailyAmount, NoShowMetric } from '@/modules/metrics/metrics.service'
export { formatArs as formatARS } from '@/lib/format'

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
const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('es-AR', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

function monthLabel(dateStr: string): string {
  const { y, m } = parseYmd(dateStr)
  return MONTH_LABEL_FORMATTER.format(new Date(Date.UTC(y, m - 1, 1)))
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

/**
 * Piso mínimo de turnos terminados (completed + no_show), en CUALQUIERA de
 * las dos ventanas, para tratar la tasa de ausencias como comparable (H174).
 * Por debajo de este piso el valor del período se sigue mostrando —es la
 * tasa real de esos turnos, ningún número inventado—, pero la comparación
 * "vs período anterior" y su semáforo (flecha + rojo/verde) se ocultan: con
 * pocas decenas de turnos el error estándar de una proporción es grande (para
 * una tasa típica de ~10%, n=24 da un desvío de ~6 puntos), así que un salto
 * de +16,7 pts entre dos ventanas así de chicas es ruido, no tendencia, y una
 * alarma que no significa nada entrena a ignorar la que sí. 30 es la regla de
 * pulgar clásica para que la aproximación normal de una proporción deje de
 * ser frágil (n≥30 / np≥5) y, para un complejo de fútbol activo, se cruza en
 * la primera semana o dos de uso — no es un piso que deje a nadie afuera por
 * mucho tiempo.
 */
export const MIN_FINISHED_FOR_TREND = 30

export type NoShowTrend =
  { kind: 'no_prev' } | { kind: 'low_sample' } | { kind: 'up' | 'down' | 'flat'; deltaPts: number }

/**
 * Tendencia de la tasa de ausencias vs la ventana anterior, en puntos
 * porcentuales. Sin reservas terminadas en la ventana previa no hay base de
 * comparación → 'no_prev'. Con muestra chica en cualquiera de las dos
 * ventanas (< MIN_FINISHED_FOR_TREND) la comparación no es confiable →
 * 'low_sample' (H174). Subir ausencias es malo (la UI lo pinta en rojo).
 */
export function noShowTrend(current: NoShowMetric, prev: NoShowMetric): NoShowTrend {
  if (prev.finished === 0) return { kind: 'no_prev' }
  if (current.finished < MIN_FINISHED_FOR_TREND || prev.finished < MIN_FINISHED_FOR_TREND) {
    return { kind: 'low_sample' }
  }
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
