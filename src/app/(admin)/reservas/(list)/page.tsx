import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarX, CalendarCheck, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/admin/PageHeader'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { artTodayStr } from '@/shared/dates/art'
import { formatDateLong } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  countTenantBookingsByStatus,
  listTenantBookings,
  RESERVAS_PAGE_SIZE,
  sumBookingChargesByBooking,
  type ReservaListRow,
  type ReservaScope,
} from '../queries'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import { listCourts } from '@/modules/courts/court.service'
import { BookingListItem } from '../BookingListItem'
import { ReservasToolbar } from '../ReservasToolbar'
import { GrillaTabs } from '@/app/(admin)/grilla/GrillaTabs'
import { EmptyState } from '@/components/ui/empty-state'
import {
  cancelBookingAction,
  completeAndChargeBookingAction,
  confirmDepositPaymentAction,
  markNoShowAction,
  revertNoShowAction,
} from '../actions'
import { getBookingChargesAction } from '../charges-actions'

const QUICK_ACTIONS = {
  cancelBookingAction,
  completeAndChargeBookingAction,
  confirmDepositPaymentAction,
  markNoShowAction,
  revertNoShowAction,
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
  { value: 'pending_payment', label: 'Esperando seña' },
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
function buildHref(params: {
  dia: ReservaScope
  status: string
  q: string
  compact: boolean
  /** H110 — courts.id, o '' para "Todas las canchas". */
  cancha: string
  /** Página 0-based; se omite en la 1 (`?pagina=` es 1-based, como se lee). */
  page?: number
}): string {
  const search = new URLSearchParams()
  if (params.dia !== 'hoy') search.set('dia', params.dia)
  if (params.status) search.set('status', params.status)
  if (params.q) search.set('q', params.q)
  if (params.compact) search.set('vista', 'compacta')
  if (params.cancha) search.set('cancha', params.cancha)
  if (params.page && params.page > 0) search.set('pagina', String(params.page + 1))
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
function groupBy(
  rows: ReservaListRow[],
  key: (r: ReservaListRow) => string,
): Array<[string, ReservaListRow[]]> {
  const groups = new Map<string, ReservaListRow[]>()
  for (const row of rows) {
    const k = key(row)
    const bucket = groups.get(k)
    if (bucket) bucket.push(row)
    else groups.set(k, [row])
  }
  return Array.from(groups.entries())
}

type Props = {
  searchParams: Promise<{
    dia?: string
    status?: string
    q?: string
    vista?: string
    pagina?: string
    /** H110 — courts.id; se valida contra las canchas reales del tenant. */
    cancha?: string
  }>
}

/** `?pagina=` es 1-based en la URL y 0-based adentro. Basura → página 1. */
function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(n) && n > 1 ? n - 1 : 0
}

export default async function ReservasPage(props: Props) {
  const searchParams = await props.searchParams
  const auth = await requireOperatorStaff()
  if (!auth.ok) redirect('/login')
  const { tenant } = auth
  // Mismo dato/mismo default (24) que `getBookingDetail` (queries.ts) usa vía
  // COALESCE en SQL para `ReservaDetail.cancellationPolicyHours` — acá se lee
  // en JS porque el guard ya devuelve el `tenant` con `settings` completo, sin
  // query extra. Reenviado a QuickActions (cluster F bug 2).
  const cancellationPolicyHours = tenant.settings?.cancellation_policy?.hours_before ?? 24

  const today = artTodayStr()
  const requestedScope = searchParams.dia ?? ''
  const scope: ReservaScope = ALLOWED_SCOPES.has(requestedScope)
    ? (requestedScope as ReservaScope)
    : 'hoy'
  const requestedStatus = searchParams.status ?? ''
  const status = ALLOWED_STATUS.has(requestedStatus) ? requestedStatus : ''
  const q = (searchParams.q ?? '').trim().slice(0, 80)
  const compact = searchParams.vista === 'compacta'
  const page = parsePage(searchParams.pagina)
  const requestedCourt = searchParams.cancha ?? ''

  // Mismo tx (una conexión): secuencial, no Promise.all.
  const { rows, counts, hasMore, courts, courtId } = await withTenantContext(
    tenant.id,
    async (tx) => {
      // H110 — allowlist contra las canchas reales del tenant, mismo criterio
      // que #30 con `status`: un `?cancha` que no es una cancha del tenant
      // (basura, o de otro tenant) se degrada a "sin filtro", nunca revienta
      // la query ni filtra por una cancha ajena.
      const courtRows = await listCourts(tenant.id, tx)
      const courtIds = new Set(courtRows.map((c) => c.id))
      const courtId = courtIds.has(requestedCourt) ? requestedCourt : undefined

      const { rows: list, hasMore: more } = await listTenantBookings(
        tenant.id,
        {
          scope,
          today,
          ...(status ? { status } : {}),
          ...(q ? { q } : {}),
          ...(courtId ? { courtId } : {}),
        },
        tx,
        page,
      )
      const byStatus = await countTenantBookingsByStatus(
        tenant.id,
        { scope, today, ...(q ? { q } : {}), ...(courtId ? { courtId } : {}) },
        tx,
      )
      // El saldo pendiente dejó de ser insumo exclusivo de la alarma
      // (`isUnpaidAlarm` en slot-visual.ts, que solo mira completed): 3.2
      // lo usa como columna de TODAS las filas de la lista ("Cobrado"/"Falta $X"),
      // así que ahora se pide para toda la página. Siempre son 3 queries (antes 2
      // en el scope 'proximas'), pero acotadas a `RESERVAS_PAGE_SIZE` (100) ids —
      // el mismo costo que ya paga la grilla con todos los turnos del día.
      const charges = await sumBookingChargesByBooking(
        tenant.id,
        list.map((r) => r.id),
        tx,
      )
      const withMoney = list.map((r) => ({
        ...r,
        ...summarizeBookingCharges({
          priceSnapshot: r.priceSnapshot,
          depositAmount: r.depositAmount,
          depositStatus: r.depositStatus,
          chargesTotal: charges.get(r.id) ?? 0,
        }),
      }))
      return {
        rows: withMoney,
        counts: byStatus,
        hasMore: more,
        courts: courtRows.map((c) => ({ id: c.id, name: c.name })),
        courtId,
      }
    },
  )

  // Hoy: secciones por cancha (la query ordena cancha, hora). Próximas e
  // historial: secciones por fecha para que el día sea escaneable.
  const groups = scope === 'hoy' ? groupBy(rows, (r) => r.courtName) : groupBy(rows, (r) => r.date)

  const total = status ? countFor(counts, status) : countFor(counts, '')
  const reservaWord = total === 1 ? '1 reserva' : `${total} reservas`
  const headerSubtitle = scope === 'hoy' ? `${formatDateLong(today)} · ${reservaWord}` : reservaWord

  // B10 — el subtítulo y las píldoras salen de un COUNT sin techo, y la lista
  // venía de un `LIMIT 200` mudo: podía decir "740 reservas" y mostrar 200, sin
  // avisar ni dar forma de llegar al resto. Ahora el rango que se está viendo se
  // dice explícito y las páginas siguientes son alcanzables.
  const firstIndex = page * RESERVAS_PAGE_SIZE + 1
  const lastIndex = page * RESERVAS_PAGE_SIZE + rows.length
  const paginado = page > 0 || hasMore

  return (
    <div className="space-y-5">
      {/* Fase 4: esta pantalla es la vista Lista del espacio Grilla. El CTA
          "Ir a la grilla" que vivía en el encabezado se fue: la pestaña
          Calendario hace exactamente eso, y dos caminos al mismo lugar en la
          misma pantalla son ruido. */}
      <GrillaTabs active="/reservas" />

      <PageHeader
        title="Reservas"
        subtitle={headerSubtitle}
        icon={<CalendarCheck className="h-6 w-6" aria-hidden="true" />}
      />

      <div
        className="card-entrance flex flex-wrap items-center justify-between gap-3"
        style={{ animationDelay: '80ms' }}
      >
        <nav aria-label="Rango de fechas" className="inline-flex rounded-lg bg-muted p-1">
          {SCOPES.map((s) => {
            const active = scope === s.value
            return (
              <Link
                key={s.value}
                href={buildHref({ dia: s.value, status, q, compact, cancha: courtId ?? '' })}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-md px-4 py-1.5 text-sm font-medium transition-colors md:min-h-8',
                  active
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {s.label}
              </Link>
            )
          })}
        </nav>
        <Suspense
          fallback={<div className="h-10 w-full rounded-lg bg-muted sm:w-72" aria-hidden />}
        >
          <ReservasToolbar />
        </Suspense>
      </div>

      <nav
        aria-label="Filtro por estado"
        className="card-entrance flex flex-wrap gap-2"
        style={{ animationDelay: '120ms' }}
      >
        {FILTERS.map((f) => {
          const active = status === f.value
          const count = countFor(counts, f.value)
          return (
            <Link
              key={f.label}
              href={buildHref({ dia: scope, status: f.value, q, compact, cancha: courtId ?? '' })}
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
                  active
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {count}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* H110 — filtro por cancha: sin esto no había forma de ver de un saque
          qué tiene una cancha puntual hacia adelante (scope 'proximas', que
          agrupa por fecha, no por cancha). Mismo patrón de chips que
          "Filtro por estado", una sola cancha a la vez. */}
      {courts.length > 1 && (
        <nav
          aria-label="Filtro por cancha"
          className="card-entrance flex flex-wrap gap-2"
          style={{ animationDelay: '140ms' }}
        >
          <Link
            href={buildHref({ dia: scope, status, q, compact, cancha: '' })}
            aria-current={!courtId ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 items-center rounded-full px-3 py-1.5 text-xs font-medium transition-colors md:min-h-0',
              !courtId
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground ring-1 ring-inset ring-border hover:bg-accent',
            )}
          >
            Todas las canchas
          </Link>
          {courts.map((c) => {
            const active = courtId === c.id
            return (
              <Link
                key={c.id}
                href={buildHref({ dia: scope, status, q, compact, cancha: c.id })}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-full px-3 py-1.5 text-xs font-medium transition-colors md:min-h-0',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-muted-foreground ring-1 ring-inset ring-border hover:bg-accent',
                )}
              >
                {c.name}
              </Link>
            )
          })}
        </nav>
      )}

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
        <div className="card-entrance space-y-6" style={{ animationDelay: '200ms' }}>
          {paginado && (
            <p className="text-sm text-muted-foreground" role="status">
              Mostrando{' '}
              <span className="font-medium tabular-nums text-foreground">
                {firstIndex}–{lastIndex}
              </span>{' '}
              de <span className="font-medium tabular-nums text-foreground">{total}</span>
            </p>
          )}
          {groups.map(([groupKey, groupRows]) => (
            <section
              key={groupKey}
              aria-label={scope === 'hoy' ? groupKey : formatDateLong(groupKey)}
            >
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

          {paginado && (
            <nav
              aria-label="Paginación de reservas"
              className="flex items-center justify-between gap-3 border-t border-border pt-4"
            >
              {page > 0 ? (
                <Link
                  href={buildHref({
                    dia: scope,
                    status,
                    q,
                    compact,
                    cancha: courtId ?? '',
                    page: page - 1,
                  })}
                  rel="prev"
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground ring-1 ring-inset ring-border transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  Anteriores
                </Link>
              ) : (
                <span />
              )}
              <span className="text-xs text-muted-foreground tabular-nums">Página {page + 1}</span>
              {hasMore ? (
                <Link
                  href={buildHref({
                    dia: scope,
                    status,
                    q,
                    compact,
                    cancha: courtId ?? '',
                    page: page + 1,
                  })}
                  rel="next"
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground ring-1 ring-inset ring-border transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Siguientes
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </div>
      )}
    </div>
  )
}
