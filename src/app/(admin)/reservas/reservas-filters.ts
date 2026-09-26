import { capitalizeFirst, formatDayHeader } from '@/lib/format'
import type { ReservaScope } from './queries'

/**
 * Vocabulario de scope/estado + `buildHref`, compartidos entre `(list)/page.tsx`
 * (Server Component) y `ReservasHeaderBar.tsx` (`'use client'`). Viven en un
 * módulo SIN `'use client'` a propósito: un Server Component que importa una
 * función común desde un archivo `'use client'` recibe una client reference y
 * no puede invocarla — mismo motivo por el que las Server Actions de
 * QuickActions entran por prop y no por import directo.
 */

export const SCOPES: Array<{ value: ReservaScope; label: string }> = [
  { value: 'proximos', label: 'Próximos' },
  { value: 'pasados', label: 'Pasados' },
]
const ALLOWED_SCOPES = new Set<string>(SCOPES.map((s) => s.value))

/**
 * `?dia=` viejo (tres pestañas por día calendario, pre-Agenda): `hoy` y
 * `proximas` caen en `proximos` (lo más parecido — "lo que viene"),
 * `historial` cae en `pasados`. Un link guardado/bookmark no se rompe.
 */
const LEGACY_SCOPE: Record<string, ReservaScope> = {
  hoy: 'proximos',
  proximas: 'proximos',
  historial: 'pasados',
}

export function resolveScope(raw: string): ReservaScope {
  if (ALLOWED_SCOPES.has(raw)) return raw as ReservaScope
  return LEGACY_SCOPE[raw] ?? 'proximos'
}

/**
 * Chips de estado de la Agenda: "Todos" (todo menos cancelado/expirado),
 * "Esperando seña", "Ausentes", "Cancelados" (agrupa `canceled_*` + `expired`,
 * ver `statusCond` en queries.ts). "Confirmadas"/"Completadas" se fueron: la
 * plata de cada fila ya dice esa historia, un chip de estado aparte era
 * redundante. Un `?status=` viejo con esos valores (o cualquier otro no
 * listado acá) degrada en silencio a "Todos" — mismo criterio que #30.
 */
export const STATUS_CHIPS = [
  { value: '', label: 'Todos' },
  { value: 'pending_payment', label: 'Esperando seña' },
  { value: 'no_show', label: 'Ausentes' },
  { value: 'canceladas', label: 'Cancelados' },
] as const
export const ALLOWED_STATUS: Set<string> = new Set(STATUS_CHIPS.map((f) => f.value).filter(Boolean))

/** Arma /reservas?… omitiendo defaults para URLs limpias y compartibles. */
export function buildHref(params: {
  dia: ReservaScope
  status: string
  q: string
  /** H110 — courts.id, o '' para "Todas las canchas". */
  cancha: string
  /** Página 0-based; se omite en la 1 (`?pagina=` es 1-based, como se lee). */
  page?: number
}): string {
  const search = new URLSearchParams()
  if (params.dia !== 'proximos') search.set('dia', params.dia)
  if (params.status) search.set('status', params.status)
  if (params.q) search.set('q', params.q)
  if (params.cancha) search.set('cancha', params.cancha)
  if (params.page && params.page > 0) search.set('pagina', String(params.page + 1))
  const qs = search.toString()
  return qs ? `/reservas?${qs}` : '/reservas'
}

/**
 * `canceled_refunded`/`canceled_no_refund`/`expired`: lo que "Todos" resta y
 * "Cancelados" agrupa. Mismo set que `statusCond` en queries.ts — si uno
 * cambia, cambian los dos o el chip miente sobre lo que filtra la query.
 */
const HIDDEN_FROM_ALL = new Set(['canceled_refunded', 'canceled_no_refund', 'expired'])

/**
 * Contador para un chip: '' suma todo MENOS lo cancelado/expirado, 'canceladas'
 * agrupa los tres. Los counts vienen sin filtro de estado para que cada chip
 * muestre su número aunque otro esté activo.
 */
export function countFor(counts: Record<string, number>, filterValue: string): number {
  if (!filterValue) {
    return Object.entries(counts).reduce(
      (acc, [status, n]) => (HIDDEN_FROM_ALL.has(status) ? acc : acc + n),
      0,
    )
  }
  if (filterValue === 'canceladas') {
    return (
      (counts.canceled_refunded ?? 0) + (counts.canceled_no_refund ?? 0) + (counts.expired ?? 0)
    )
  }
  return counts[filterValue] ?? 0
}

/** Agrupa preservando el orden de llegada (la query ya ordena). */
export function groupBy<T>(rows: T[], key: (r: T) => string): Array<[string, T[]]> {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const k = key(row)
    const bucket = groups.get(k)
    if (bucket) bucket.push(row)
    else groups.set(k, [row])
  }
  return Array.from(groups.entries())
}

/**
 * Encabezado de un grupo de día de la Agenda: "Hoy · viernes 25 de
 * septiembre", "Mañana · …", "Ayer · …", o la fecha sola ("Martes 29 de
 * septiembre") para cualquier otro día. `date`/`today`/`tomorrow`/`yesterday`
 * son YYYY-MM-DD en ART — la page los calcula una sola vez con `artTodayStr`
 * + `addDays`.
 */
export function agendaDayLabel(
  date: string,
  today: string,
  tomorrow: string,
  yesterday: string,
): string {
  const plain = formatDayHeader(date)
  if (date === today) return `Hoy · ${plain}`
  if (date === tomorrow) return `Mañana · ${plain}`
  if (date === yesterday) return `Ayer · ${plain}`
  return capitalizeFirst(plain)
}

/** `?pagina=` es 1-based en la URL y 0-based adentro. Basura → página 1. */
export function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(n) && n > 1 ? n - 1 : 0
}
