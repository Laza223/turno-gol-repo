import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarX } from 'lucide-react'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { artTodayStr } from '@/shared/dates/art'
import { formatDateLong } from '@/lib/format'
import { cn } from '@/lib/utils'
import { listTenantBookings, type ReservaListRow, type ReservaScope } from './queries'
import { BookingListItem } from './BookingListItem'
import { EmptyState } from '@/components/ui/empty-state'

const SCOPES: Array<{ value: ReservaScope; label: string }> = [
  { value: 'hoy', label: 'Hoy' },
  { value: 'proximas', label: 'Próximas' },
  { value: 'historial', label: 'Historial' },
]
const ALLOWED_SCOPES = new Set<string>(SCOPES.map((s) => s.value))

const FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'confirmed', label: 'Confirmadas' },
  { value: 'pending_payment', label: 'Pendientes' },
  { value: 'completed', label: 'Completadas' },
  { value: 'no_show', label: 'Ausentes' },
  { value: 'canceladas', label: 'Canceladas' },
]
// #30: allowlist de estados filtrables. Un ?status fuera de este set (texto
// basura o un enum no listado) reventaba el cast `${status}::booking_status`
// en la query -> 500/error.tsx. Lo degradamos a "sin filtro" (Todas).
// 'canceladas' es un valor virtual que la query expande a ambos enums canceled_*.
const ALLOWED_STATUS = new Set(FILTERS.map((f) => f.value).filter(Boolean))

/** Arma /reservas?… omitiendo defaults para URLs limpias y compartibles. */
function buildHref(params: { dia: ReservaScope; status: string }): string {
  const search = new URLSearchParams()
  if (params.dia !== 'hoy') search.set('dia', params.dia)
  if (params.status) search.set('status', params.status)
  const qs = search.toString()
  return qs ? `/reservas?${qs}` : '/reservas'
}

/** Agrupa preservando el orden de llegada (la query ya ordena). */
function groupBy(rows: ReservaListRow[], key: (r: ReservaListRow) => string): Array<[string, ReservaListRow[]]> {
  const groups = new Map<string, ReservaListRow[]>()
  for (const row of rows) {
    const k = key(row)
    const bucket = groups.get(k)
    if (bucket) bucket.push(row)
    else groups.set(k, [row])
  }
  return Array.from(groups.entries())
}

type Props = { searchParams: { dia?: string; status?: string } }

export default async function ReservasPage({ searchParams }: Props) {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')
  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')

  const today = artTodayStr()
  const requestedScope = searchParams.dia ?? ''
  const scope: ReservaScope = ALLOWED_SCOPES.has(requestedScope) ? (requestedScope as ReservaScope) : 'hoy'
  const requestedStatus = searchParams.status ?? ''
  const status = ALLOWED_STATUS.has(requestedStatus) ? requestedStatus : ''

  const rows = await withTenantContext(tenant.id, (tx) =>
    listTenantBookings(tenant.id, { scope, today, ...(status ? { status } : {}) }, tx),
  )

  // Hoy: secciones por cancha (la query ordena cancha, hora). Próximas e
  // historial: secciones por fecha para que el día sea escaneable.
  const groups =
    scope === 'hoy'
      ? groupBy(rows, (r) => r.courtName)
      : groupBy(rows, (r) => r.date)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Reservas</h1>
          {scope === 'hoy' && (
            <p className="text-sm text-slate-500">
              {formatDateLong(today)} · {rows.length === 1 ? '1 reserva' : `${rows.length} reservas`}
            </p>
          )}
        </div>
        <Link
          href="/grilla"
          className="inline-flex h-9 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          Ir a la grilla
        </Link>
      </div>

      <nav aria-label="Rango de fechas" className="inline-flex rounded-lg bg-slate-100 p-1">
        {SCOPES.map((s) => {
          const active = scope === s.value
          return (
            <Link
              key={s.value}
              href={buildHref({ dia: s.value, status })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
              )}
            >
              {s.label}
            </Link>
          )
        })}
      </nav>

      <nav aria-label="Filtro por estado" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = status === f.value
          return (
            <Link
              key={f.label}
              href={buildHref({ dia: scope, status: f.value })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50',
              )}
            >
              {f.label}
            </Link>
          )
        })}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title="Sin reservas"
          description={
            scope === 'hoy'
              ? 'No hay reservas para hoy con los filtros seleccionados.'
              : 'No hay reservas para los filtros seleccionados.'
          }
        />
      ) : (
        <div className="space-y-6">
          {groups.map(([groupKey, groupRows]) => (
            <section key={groupKey} aria-label={scope === 'hoy' ? groupKey : formatDateLong(groupKey)}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                {scope === 'hoy' ? groupKey : formatDateLong(groupKey)}
              </h2>
              <ul className="space-y-2">
                {groupRows.map((r) => (
                  <BookingListItem key={r.id} booking={r} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
