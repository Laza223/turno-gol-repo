import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarX, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { artTodayStr } from '@/shared/dates/art'
import { formatDateLong } from '@/lib/format'
import {
  countTenantBookingsByStatus,
  listTenantBookings,
  listTenantBookingsForBoard,
  RESERVAS_PAGE_SIZE,
  sumBookingChargesByBooking,
  type ReservaListRow,
  type ReservaScope,
} from '../queries'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import { listCourts } from '@/modules/courts/court.service'
import { BookingListItem } from '../BookingListItem'
import { CourtBoard } from '../CourtBoard'
import { ReservasHeaderBar } from '../ReservasHeaderBar'
import { EmptyState } from '@/components/ui/empty-state'
import {
  ALLOWED_SCOPES,
  ALLOWED_STATUS,
  buildHref,
  countFor,
  groupBy,
  parsePage,
} from '../reservas-filters'
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

type Props = {
  searchParams: Promise<{
    dia?: string
    status?: string
    q?: string
    pagina?: string
    /** H110 — courts.id; se valida contra las canchas reales del tenant. */
    cancha?: string
  }>
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
  // `?vista=` (densidad) se eliminó del todo: un valor viejo en un link
  // compartido/bookmark se ignora en silencio, no rompe nada.
  const page = parsePage(searchParams.pagina)
  const requestedCourt = searchParams.cancha ?? ''

  // Mismo tx (una conexión): secuencial, no Promise.all.
  const { rows, counts, hasMore, courts, courtId, courtTotals } = await withTenantContext(
    tenant.id,
    async (tx) => {
      // H110 — allowlist contra las canchas reales del tenant, mismo criterio
      // que #30 con `status`: un `?cancha` que no es una cancha del tenant
      // (basura, o de otro tenant) se degrada a "sin filtro", nunca revienta
      // la query ni filtra por una cancha ajena.
      const courtRows = await listCourts(tenant.id, tx)
      const courtIds = new Set(courtRows.map((c) => c.id))
      const courtId = courtIds.has(requestedCourt) ? requestedCourt : undefined

      // Tablero (Hoy/Próximas) SIN filtro de cancha: cupo por cancha, no
      // OFFSET global (hallazgo #3, revisión redesign booking modal
      // 2026-09-14) — ver `listTenantBookingsForBoard`. Con `?cancha=` (una
      // sola columna) o en Historial, sigue el paginado de siempre.
      const boardMode = scope !== 'historial' && !courtId

      let list: ReservaListRow[]
      let more = false
      let courtTotals: Map<string, number> | undefined
      if (boardMode) {
        const boardRows = await listTenantBookingsForBoard(
          tenant.id,
          { scope, today, ...(status ? { status } : {}), ...(q ? { q } : {}) },
          tx,
        )
        list = boardRows
        courtTotals = new Map(boardRows.map((r) => [r.courtId, r.courtTotal]))
      } else {
        const page1 = await listTenantBookings(
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
        list = page1.rows
        more = page1.hasMore
      }

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
        courtTotals,
      }
    },
  )

  // Historial: secciones por fecha (mezcla canchas, así que el header de
  // columna de CourtBoard no serviría). Hoy/Próximas: tablero por cancha,
  // ver CourtBoard (agrupa adentro).
  const historialGroups = scope === 'historial' ? groupBy(rows, (r) => r.date) : []
  const boardCourts = courtId ? courts.filter((c) => c.id === courtId) : courts
  // Tablero sin filtro de cancha: sin paginado global (cada columna tiene su
  // propio cupo/link "Ver todas" — nunca un OFFSET que corta canchas).
  const boardMode = scope !== 'historial' && !courtId

  const total = countFor(counts, status)

  // B10 — el subtítulo y las píldoras salen de un COUNT sin techo, y la lista
  // venía de un `LIMIT 200` mudo: podía decir "740 reservas" y mostrar 200, sin
  // avisar ni dar forma de llegar al resto. Ahora el rango que se está viendo se
  // dice explícito y las páginas siguientes son alcanzables.
  const firstIndex = page * RESERVAS_PAGE_SIZE + 1
  const lastIndex = page * RESERVAS_PAGE_SIZE + rows.length
  const paginado = !boardMode && (page > 0 || hasMore)

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
      {/* Fase 4/rediseño: sin `PageHeader` — el segmento Grilla|Reservas
          (ReservasHeaderBar, portalizado) es el único lugar donde la
          pantalla se nombra. El h1 queda solo para el árbol de accesibilidad. */}
      <h1 className="sr-only">Reservas</h1>

      <ReservasHeaderBar
        scope={scope}
        status={status}
        q={q}
        cancha={courtId ?? ''}
        courts={courts}
        counts={counts}
        total={total}
      />

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
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto lg:overflow-hidden">
          {paginado && (
            <p className="shrink-0 text-sm text-muted-foreground" role="status">
              Mostrando{' '}
              <span className="font-medium tabular-nums text-foreground">
                {firstIndex}–{lastIndex}
              </span>{' '}
              de <span className="font-medium tabular-nums text-foreground">{total}</span>
            </p>
          )}

          {scope === 'historial' ? (
            <div className="grid min-h-0 content-start gap-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1 xl:grid-cols-2">
              {historialGroups.map(([date, dateRows]) => (
                <section key={date} aria-label={formatDateLong(date)}>
                  <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {formatDateLong(date)}
                  </h2>
                  <ul className="space-y-2">
                    {dateRows.map((r) => (
                      <BookingListItem
                        key={r.id}
                        booking={r}
                        actions={QUICK_ACTIONS}
                        cancellationPolicyHours={cancellationPolicyHours}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <CourtBoard
              courts={boardCourts}
              bookings={rows}
              scope={scope}
              status={status}
              q={q}
              actions={QUICK_ACTIONS}
              cancellationPolicyHours={cancellationPolicyHours}
              courtTotals={courtTotals}
            />
          )}

          {paginado && (
            <nav
              aria-label="Paginación de reservas"
              className="flex shrink-0 items-center justify-between gap-3 border-t border-border pt-3"
            >
              {page > 0 ? (
                <Link
                  href={buildHref({
                    dia: scope,
                    status,
                    q,
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
