import type { ReservaListRow, ReservaScope } from './queries'

/**
 * Vocabulario de scope/estado + `buildHref`, compartidos entre `(list)/page.tsx`
 * (Server Component) y `ReservasHeaderBar.tsx` (`'use client'`). Viven en un
 * módulo SIN `'use client'` a propósito: un Server Component que importa una
 * función común desde un archivo `'use client'` recibe una client reference y
 * no puede invocarla — mismo motivo por el que las Server Actions de
 * QuickActions entran por prop y no por import directo.
 */

export const SCOPES: Array<{ value: ReservaScope; label: string }> = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'proximas', label: 'Próximas' },
  { value: 'historial', label: 'Historial' },
]
export const ALLOWED_SCOPES = new Set<string>(SCOPES.map((s) => s.value))

export const FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'confirmed', label: 'Confirmadas' },
  { value: 'pending_payment', label: 'Esperando seña' },
  { value: 'completed', label: 'Completadas' },
  { value: 'no_show', label: 'Ausentes' },
  { value: 'canceladas', label: 'Canceladas' },
] as const
// #30: allowlist de estados filtrables. Un ?status fuera de este set (texto
// basura o un enum no listado) reventaba el cast `${status}::booking_status`
// en la query -> 500/error.tsx. Lo degradamos a "sin filtro" (Todas).
// 'canceladas' es un valor virtual que la query expande a ambos enums canceled_*.
export const ALLOWED_STATUS: Set<string> = new Set(FILTERS.map((f) => f.value).filter(Boolean))

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
  if (params.dia !== 'hoy') search.set('dia', params.dia)
  if (params.status) search.set('status', params.status)
  if (params.q) search.set('q', params.q)
  if (params.cancha) search.set('cancha', params.cancha)
  if (params.page && params.page > 0) search.set('pagina', String(params.page + 1))
  const qs = search.toString()
  return qs ? `/reservas?${qs}` : '/reservas'
}

/**
 * Contador para una píldora/radio: '' suma todo, 'canceladas' agrupa ambos
 * enums. Los counts vienen sin filtro de estado para que cada opción muestre
 * su número aunque otra esté activa.
 */
export function countFor(counts: Record<string, number>, filterValue: string): number {
  if (!filterValue) return Object.values(counts).reduce((acc, n) => acc + n, 0)
  if (filterValue === 'canceladas') {
    return (counts.canceled_refunded ?? 0) + (counts.canceled_no_refund ?? 0)
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

/** `?pagina=` es 1-based en la URL y 0-based adentro. Basura → página 1. */
export function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(n) && n > 1 ? n - 1 : 0
}

/** Agrupa las reservas de UNA cancha por fecha, preservando el orden cronológico que ya trae la query (Próximas). */
export function groupByDate(rows: ReservaListRow[]): Array<[string, ReservaListRow[]]> {
  return groupBy(rows, (r) => r.date)
}
