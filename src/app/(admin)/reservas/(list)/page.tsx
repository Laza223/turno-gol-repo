import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarX, CalendarDays } from 'lucide-react'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { artTodayStr, addDays } from '@/shared/dates/art'
import {
  countTenantBookingsByStatus,
  listTenantBookings,
  RESERVAS_PAGE_SIZE,
  sumBookingChargesByBooking,
  type ReservaScope,
} from '../queries'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import { listCourts } from '@/modules/courts/court.service'
import { BookingListItem } from '../BookingListItem'
import { ReservasHeaderBar } from '../ReservasHeaderBar'
import { EmptyState } from '@/components/ui/empty-state'
import { Pager } from '@/components/ui/pager'
import {
  ALLOWED_STATUS,
  agendaDayLabel,
  buildHref,
  countFor,
  groupBy,
  parsePage,
  resolveScope,
} from '../reservas-filters'

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

// Función aparte, no `new Date()` directo en el cuerpo del componente:
// react-compiler marca como impura una llamada directa a un builtin conocido
// DENTRO de un componente, pero no una función común — mismo patrón que
// `BookingListItem.tsx`/`BookingDetailCard.tsx`. Server Component: el reloj
// del server alcanza, no hace falta que sea reactivo.
function now(): Date {
  return new Date()
}

export default async function ReservasPage(props: Props) {
  const searchParams = await props.searchParams
  const auth = await requireOperatorStaff()
  if (!auth.ok) redirect('/login')
  const { tenant } = auth

  const today = artTodayStr()
  const tomorrow = addDays(today, 1)
  const yesterday = addDays(today, -1)
  const scope: ReservaScope = resolveScope(searchParams.dia ?? '')
  const requestedStatus = searchParams.status ?? ''
  const status = ALLOWED_STATUS.has(requestedStatus) ? requestedStatus : ''
  const q = (searchParams.q ?? '').trim().slice(0, 80)
  const page = parsePage(searchParams.pagina)
  const requestedCourt = searchParams.cancha ?? ''
  const instant = now()

  // Mismo tx (una conexión): secuencial, no Promise.all.
  const { rows, counts, courts, courtId } = await withTenantContext(tenant.id, async (tx) => {
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
        now: instant,
        ...(status ? { status } : {}),
        ...(q ? { q } : {}),
        ...(courtId ? { courtId } : {}),
      },
      tx,
      page,
    )

    const byStatus = await countTenantBookingsByStatus(
      tenant.id,
      { scope, now: instant, ...(q ? { q } : {}), ...(courtId ? { courtId } : {}) },
      tx,
    )
    // El saldo pendiente es insumo de la plata de TODAS las filas (`agendaMoneyCell`),
    // así que se pide para toda la página. Acotado a `RESERVAS_PAGE_SIZE` (50) ids.
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
        chargesTotal: charges.get(r.id)?.total ?? 0,
      }),
    }))
    return {
      rows: withMoney,
      counts: byStatus,
      hasMore: more,
      courts: courtRows.map((c) => ({ id: c.id, name: c.name })),
      courtId,
    }
  })

  // Un solo agrupador: por día operativo (`b.date`). Los dos segmentos
  // (Próximos/Pasados) son por INSTANTE físico, no por día — un turno de hoy
  // que ya terminó cae en Pasados igual, y su grupo sigue diciendo "Hoy".
  const groups = groupBy(rows, (r) => r.date)

  const total = countFor(counts, status)
  const oppositeScope: ReservaScope = scope === 'proximos' ? 'pasados' : 'proximos'

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-3">
      {/* Fase 4/rediseño de la Agenda: sin `PageHeader` — el segmento
          Grilla|Agenda (ReservasHeaderBar, portalizado) es el único lugar
          donde la pantalla se nombra. El h1 queda solo para el árbol de
          accesibilidad. */}
      <h1 className="sr-only">Agenda</h1>

      {/* useSearchParams adentro: sin Suspense, Next renderiza en el cliente
          todo lo que está por encima del límite más cercano. */}
      <Suspense fallback={null}>
        <ReservasHeaderBar
          scope={scope}
          status={status}
          q={q}
          cancha={courtId ?? ''}
          courts={courts}
          counts={counts}
        />
      </Suspense>

      {rows.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title="Sin turnos"
          description={
            q
              ? `Sin resultados para “${q}” en ${scope === 'proximos' ? 'Próximos' : 'Pasados'}.`
              : `No hay turnos ${scope === 'proximos' ? 'próximos' : 'pasados'} con estos filtros.`
          }
          action={
            q ? (
              <Link
                href={buildHref({ dia: oppositeScope, status, q, cancha: courtId ?? '' })}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Buscar en {oppositeScope === 'proximos' ? 'Próximos' : 'Pasados'}
              </Link>
            ) : (
              <Link
                href="/grilla"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                Cargar una reserva
              </Link>
            )
          }
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto lg:overflow-hidden">
          {/* Una sola lista a todo el ancho (no dos columnas, Fase Agenda):
              `min-h-0` solo desde `lg`, donde la lista scrollea adentro con
              encabezados de día pegajosos; en el teléfono scrollea el
              contenedor de afuera. */}
          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-card shadow-xs lg:min-h-0">
            {groups.map(([date, groupRows]) => (
              <section key={date} aria-label={agendaDayLabel(date, today, tomorrow, yesterday)}>
                {/* Sin "N turnos" al lado: la lista está paginada de a 50, así que
                    el número contaba solo lo de esta página y un día de 130
                    turnos decía "50". El total real va en el paginador. */}
                <div className="sticky top-0 z-10 border-b border-border bg-card px-3 py-2">
                  <h2 className="text-sm font-semibold text-foreground">
                    {agendaDayLabel(date, today, tomorrow, yesterday)}
                  </h2>
                </div>
                <ul className="divide-y divide-border">
                  {groupRows.map((r) => (
                    <BookingListItem key={r.id} booking={r} />
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <Pager
            label="Paginación de la Agenda"
            page={page}
            total={total}
            pageSize={RESERVAS_PAGE_SIZE}
            shown={rows.length}
            className="shrink-0"
            hrefFor={(p) => buildHref({ dia: scope, status, q, cancha: courtId ?? '', page: p })}
          />
        </div>
      )}
    </div>
  )
}
