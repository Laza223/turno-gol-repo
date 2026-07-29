import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarX, CalendarCheck, CalendarDays } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { artTodayStr } from '@/shared/dates/art'
import { formatDateLong } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  countTenantBookingsByStatus,
  listTenantBookings,
  type ReservaListRow,
  type ReservaScope,
} from './queries'
import { BookingListItem } from './BookingListItem'
import { ReservasToolbar } from './ReservasToolbar'
import { EmptyState } from '@/components/ui/empty-state'
import {
  cancelBookingAction,
  completeAndChargeBookingAction,
  confirmDepositPaymentAction,
  markNoShowAction,
} from './actions'
import { getBookingChargesAction } from './charges-actions'

const QUICK_ACTIONS = {
  cancelBookingAction,
  completeAndChargeBookingAction,
  confirmDepositPaymentAction,
  markNoShowAction,
  getBookingChargesAction,
}

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
function buildHref(params: { dia: ReservaScope; status: string; q: string; compact: boolean }): string {
  const search = new URLSearchParams()
  if (params.dia !== 'hoy') search.set('dia', params.dia)
  if (params.status) search.set('status', params.status)
  if (params.q) search.set('q', params.q)
  if (params.compact) search.set('vista', 'compacta')
  const qs = search.toString()
  return qs ? `/reservas?${qs}` : '/reservas'
}

/**
 * Contador para una píldora: '' suma todo, 'canceladas' agrupa ambos enums.
 * Los counts vienen sin filtro de estado para que cada píldora muestre su
 * número aunque otra esté activa.
 */
function countFor(counts: Record<string, number>, filterValue: string): number {
  if (!filterValue) return Object.values(counts).reduce((acc, n) => acc + n, 0)
  if (filterValue === 'canceladas') {
    return (counts.canceled_refunded ?? 0) + (counts.canceled_no_refund ?? 0)
  }
  return counts[filterValue] ?? 0
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

type Props = { searchParams: Promise<{ dia?: string; status?: string; q?: string; vista?: string }> }

export default async function ReservasPage(props: Props) {
  const searchParams = await props.searchParams;
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')
  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/login')
  // Mismo dato/mismo default (24) que `getBookingDetail` (queries.ts) usa vía
  // COALESCE en SQL para `ReservaDetail.cancellationPolicyHours` — acá se lee
  // en JS porque `getStaffTenant` ya trae `settings` completo, sin query
  // extra. Reenviado a QuickActions (cluster F bug 2).
  const cancellationPolicyHours = tenant.settings?.cancellation_policy?.hours_before ?? 24

  const today = artTodayStr()
  const requestedScope = searchParams.dia ?? ''
  const scope: ReservaScope = ALLOWED_SCOPES.has(requestedScope) ? (requestedScope as ReservaScope) : 'hoy'
  const requestedStatus = searchParams.status ?? ''
  const status = ALLOWED_STATUS.has(requestedStatus) ? requestedStatus : ''
  const q = (searchParams.q ?? '').trim().slice(0, 80)
  const compact = searchParams.vista === 'compacta'

  // Mismo tx (una conexión): secuencial, no Promise.all.
  const { rows, counts } = await withTenantContext(tenant.id, async (tx) => {
    const list = await listTenantBookings(
      tenant.id,
      { scope, today, ...(status ? { status } : {}), ...(q ? { q } : {}) },
      tx,
    )
    const byStatus = await countTenantBookingsByStatus(
      tenant.id,
      { scope, today, ...(q ? { q } : {}) },
      tx,
    )
    return { rows: list, counts: byStatus }
  })

  // Hoy: secciones por cancha (la query ordena cancha, hora). Próximas e
  // historial: secciones por fecha para que el día sea escaneable.
  const groups =
    scope === 'hoy'
      ? groupBy(rows, (r) => r.courtName)
      : groupBy(rows, (r) => r.date)

  const total = status ? countFor(counts, status) : countFor(counts, '')
  const reservaWord = total === 1 ? '1 reserva' : `${total} reservas`
  const headerSubtitle =
    scope === 'hoy' ? `${formatDateLong(today)} · ${reservaWord}` : reservaWord

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reservas"
        subtitle={headerSubtitle}
        icon={<CalendarCheck className="h-6 w-6" aria-hidden="true" />}
        actions={
          <Link
            href="/grilla"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:min-h-9"
          >
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Ir a la grilla
          </Link>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Rango de fechas" className="inline-flex rounded-lg bg-muted p-1">
          {SCOPES.map((s) => {
            const active = scope === s.value
            return (
              <Link
                key={s.value}
                href={buildHref({ dia: s.value, status, q, compact })}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-md px-4 py-1.5 text-sm font-medium transition-colors md:min-h-8',
                  active ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {s.label}
              </Link>
            )
          })}
        </nav>
        <Suspense fallback={<div className="h-10 w-full rounded-lg bg-muted sm:w-72" aria-hidden />}>
          <ReservasToolbar />
        </Suspense>
      </div>

      <nav aria-label="Filtro por estado" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = status === f.value
          const count = countFor(counts, f.value)
          return (
            <Link
              key={f.label}
              href={buildHref({ dia: scope, status: f.value, q, compact })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors md:min-h-0',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground ring-1 ring-inset ring-border hover:bg-accent',
              )}
            >
              {f.label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums',
                  active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {count}
              </span>
            </Link>
          )
        })}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title="Sin reservas"
          description={
            q
              ? `No hay resultados para “${q}” con los filtros seleccionados.`
              : scope === 'hoy'
                ? 'No hay reservas para hoy con los filtros seleccionados.'
                : 'No hay reservas para los filtros seleccionados.'
          }
          action={
            <Link
              href="/grilla"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              Cargar una reserva
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          {groups.map(([groupKey, groupRows]) => (
            <section key={groupKey} aria-label={scope === 'hoy' ? groupKey : formatDateLong(groupKey)}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {scope === 'hoy' ? groupKey : formatDateLong(groupKey)}
              </h2>
              <ul className={compact ? 'space-y-1' : 'space-y-2'}>
                {groupRows.map((r) => (
                  <BookingListItem
                    key={r.id}
                    booking={r}
                    compact={compact}
                    actions={QUICK_ACTIONS}
                    cancellationPolicyHours={cancellationPolicyHours}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
