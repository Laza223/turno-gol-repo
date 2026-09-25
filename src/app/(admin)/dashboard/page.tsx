import { redirect } from 'next/navigation'
import { requireOperatorStaff } from '@/modules/staff/guards'
import { withTenantContext } from '@/shared/db/client'
import { nightCutoffMins, operatingDateOf } from '@/shared/time/operating-day'
import { addDays } from '@/shared/dates/art'
import { daySlotsFor } from '@/lib/dashboard/day-bookings'
import { getHoyData } from '@/modules/home/home.service'
import { listCourts } from '@/modules/courts/court.service'
import { listProducts } from '@/modules/canteen/canteen.service'
import { getSalesRanking } from '@/modules/canteen/canteen-report.service'
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist'
import { DashboardTour } from '@/components/dashboard/dashboard-tour'
import { WhileYouWereAway } from '@/components/dashboard/WhileYouWereAway'
import { NeedsAttention } from '@/components/dashboard/NeedsAttention'
import { listDayGridBookings, listUnpaidGridBookingsBefore } from '@/app/(admin)/reservas/queries'
import { mediumDateLabel } from '@/app/(admin)/caja/caja-lib'
import {
  addBookingChargeAction,
  cancelBookingAction,
  completeAndChargeBookingAction,
  confirmDepositPaymentAction,
  editBookingAction,
  listRescheduleSlotsAction,
  markNoShowAction,
  releaseBlockAction,
  rescheduleBookingAction,
  revertNoShowAction,
} from '@/app/(admin)/reservas/actions'
import { getBookingEditDetailAction } from '@/app/(admin)/reservas/edit-detail-actions'
import { chargeDebtAction } from '@/app/(admin)/caja/deudas/actions'
import { createTabAction, sellTicketAction } from '@/app/(admin)/caja/cantina/actions'
import { HoyHeaderSlot } from './HoyHeaderSlot'
import { HoyShell } from './_components/HoyShell'
import { VenderProvider } from './_components/VenderProvider'
import { getChecklistState } from './queries'
import {
  markPublicLinkSharedAction,
  markTourSeenAction,
  markChecklistDismissedAction,
} from './actions'

/** Fecha de hoy formato medio §8.3, "mié 2 de julio", y corta, "mié 2 jul", para
 * el teléfono (nunca ISO ni coma). Armado por partes: el string completo del
 * locale varía entre versiones de ICU (coma, "de" incluido o no, "sept." con
 * punto) y acá el formato es contrato de diseño. */
/**
 * Cuántos turnos no cobrados de días anteriores baja Hoy. El total y la cantidad
 * se cuentan sobre todos; la lista es para cobrar, y más allá de esto el resto
 * está en Caja › Cuentas.
 */
const EARLIER_UNPAID_LIMIT = 50

/** "Más vendidos" del modal de Vender: cuántos días mira y cuántos productos muestra. */
const TOP_SELLERS_DAYS = 30
const TOP_SELLERS_COUNT = 8

function todayLabelsArt(now: Date): { medium: string; short: string } {
  const tz = { timeZone: 'America/Argentina/Buenos_Aires' } as const
  const weekday = now.toLocaleDateString('es-AR', { weekday: 'short', ...tz }).replace('.', '')
  const day = now.toLocaleDateString('es-AR', { day: 'numeric', ...tz })
  const month = now.toLocaleDateString('es-AR', { month: 'long', ...tz })
  return {
    medium: `${weekday} ${day} de ${month}`,
    short: `${weekday} ${day} ${month.slice(0, 3)}`,
  }
}

export default async function DashboardPage() {
  // B10 — `requireOperatorStaff` y no `requireAdminStaff`: `requireAdminStaff`
  // rebota al manager A `/dashboard`, que es ESTA página, así que sería un loop
  // de redirects. El guard operator deja pasar a los dos y devuelve el rol ya
  // leído, que es lo que hace falta para decidir qué bloques ve cada uno.
  const auth = await requireOperatorStaff()
  if (!auth.ok) redirect('/login')
  const { tenant, role } = auth

  // Hoy es la pantalla del mostrador y la ve también el Encargado (decisión del
  // dueño, 2026-09-19: docs/decisions/2026-09-19-hoy-cobrar-y-vender.md). Antes
  // era solo del admin (D5) y el manager rebotaba a /grilla. Lo que sigue siendo
  // solo del dueño es la configuración: el checklist de arranque y el tour.
  const isAdmin = role === 'admin'
  const wantsChecklist = isAdmin && !tenant.settings.checklist_dismissed_at

  const cutoffMins = nightCutoffMins(tenant.openingHours, tenant.closesNextDay)
  // Un solo reloj para todo el render: el día operativo y el "hace N min" de
  // cada alerta tienen que salir del mismo instante, o una alerta creada entre
  // las dos lecturas se dibuja con un relativo negativo.
  const now = new Date()
  const date = operatingDateOf(now, cutoffMins)

  const [{ data, courts, dayBookings, earlierUnpaid, products, ranking }, checklistState] =
    await Promise.all([
      withTenantContext(tenant.id, async (tx) => {
        // La cola de cobro sale del MISMO loader que la Grilla (`listDayGridBookings`):
        // el "falta cobrar" de cada fila es el número de la Grilla, del detalle y de Caja.
        const [hoy, courtRows, bookingRows, earlierRows, productRows, rankingRows] =
          await Promise.all([
            getHoyData(tenant.id, tx, {
              date,
              cutoffMins,
              openingHours: tenant.openingHours,
              closedDates: tenant.closedDates,
              closesNextDay: tenant.closesNextDay,
            }),
            listCourts(tenant.id, tx),
            listDayGridBookings(tenant.id, date, tx),
            // Lo que se jugó en días anteriores y nadie cobró, con el mismo saldo que
            // Caja › Cuentas: Hoy lo muestra debajo de "Cobrar ahora".
            listUnpaidGridBookingsBefore(tenant.id, date, tx, { limit: EARLIER_UNPAID_LIMIT }),
            // El catálogo del modal de "Vender": el mismo de /caja.
            listProducts(tenant.id, tx),
            // "Más vendidos" del modal: la misma cuenta que el reporte de Caja › Productos,
            // sobre los últimos 30 días operativos.
            getSalesRanking(
              tenant.id,
              tx,
              { from: addDays(date, -(TOP_SELLERS_DAYS - 1)), to: date },
              cutoffMins,
            ),
          ])
        return {
          data: hoy,
          courts: courtRows,
          dayBookings: bookingRows,
          earlierUnpaid: earlierRows,
          products: productRows,
          ranking: rankingRows,
        }
      }),
      // El checklist de arranque es solo del dueño: al Encargado no se le pagan sus queries.
      // Y si el dueño ya lo descartó tampoco: Hoy se refresca cada minuto y no tiene
      // sentido consultar siete pasos para no dibujarlos.
      wantsChecklist ? getChecklistState(tenant, tenant.settings, !!tenant.mpConnectedAt) : null,
    ])

  // Todos los pasos de la checklist, no solo 2 de 7 (bug: antes el complejo
  // podía dar "por terminado" el onboarding con canchas/horarios sin cargar).
  const allDone = checklistState === null || Object.values(checklistState).every(Boolean)
  const showChecklist = wantsChecklist && !allDone
  const showTour =
    isAdmin && tenant.settings.onboarding_completed === true && !tenant.settings.admin_tour_seen_at

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const { whileYouWereAway, needsAttention } = data

  // `dayIsClosed` se recalcula acá (función pura, sin DB) porque getHoyData no
  // distingue "día cerrado" de "0 disponible": los dos casos llegan con
  // `available = 0` y se leen distinto en pantalla.
  const daySlots = daySlotsFor(
    date,
    tenant.openingHours,
    tenant.closedDates ?? [],
    tenant.closesNextDay,
  )
  const dayIsClosed = daySlots.length === 0

  // Lo que baja al cliente: canchas sin fotos ni datos de más, y los turnos con
  // sus instantes físicos en milisegundos (fuente de "ya terminó").
  const hoyCourts = courts.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    capacity: c.capacity,
    pricing: c.pricing,
  }))
  const today = todayLabelsArt(now)
  const hoyBookings = dayBookings.map(({ startsAt, endsAt, ...booking }) => ({
    ...booking,
    startsAtMs: startsAt.getTime(),
    endsAtMs: endsAt.getTime(),
  }))
  // El día de cada turno no cobrado, escrito para la pantalla: "ayer" o "lun 22
  // de septiembre" (nunca la fecha ISO).
  const yesterday = addDays(date, -1)
  const earlier = {
    bookings: earlierUnpaid.bookings.map(({ startsAt, endsAt, ...booking }) => ({
      ...booking,
      startsAtMs: startsAt.getTime(),
      endsAtMs: endsAt.getTime(),
      dayLabel: booking.date === yesterday ? 'ayer' : mediumDateLabel(booking.date),
    })),
    count: earlierUnpaid.count,
    pendingCents: earlierUnpaid.pendingCents,
  }

  return (
    <VenderProvider
      products={products}
      topProductIds={topSellerIds(ranking)}
      sellTicketAction={sellTicketAction}
      createTabAction={createTabAction}
    >
      {/* Una sola columna a todo el ancho (2026-09-25): la venta dejó de ser una columna
          fija a la derecha y pasó a un modal que abre "Vender" o la tecla V. */}
      <div className="min-w-0 space-y-4">
        {showTour && <DashboardTour action={markTourSeenAction} />}

        {/* La banda `PageHeader` se fue (rediseño 2026-09-12): el riel ya dice
          "Hoy" y la fecha cuelga del hueco de la barra superior, que es la
          regla del armazón desde MASTER §6.8 y lo que ya hicieron la Grilla y
          Configuración. En 375px eso devuelve ~110px a la primera pantalla.
          El `<h1>` sigue existiendo para lectores de pantalla y para el
          esquema de encabezados: lo que se eliminó es la FILA, no el título. */}
        <HoyHeaderSlot dateLabel={today.medium} shortDateLabel={today.short} />
        <h1 className="sr-only">Hoy</h1>

        {/* ORDEN (rediseño 2026-09-12): lo que exige acción va primero y siempre
          en el mismo lugar. Antes las alertas quedaban entre dos bloques de
          lectura —lo crítico en el medio, justo lo que MASTER §9 (serial
          position) dice que no—, así que a las 17:00, con el cliente parado en
          el mostrador, el botón de cobrar aparecía después de scrollear el
          tablero entero. Sin alertas no hay bloque (2026-09-24): el tablero
          arranca en el primer renglón. */}
        {needsAttention.length > 0 && (
          <div className="card-entrance">
            <NeedsAttention items={needsAttention} nowMs={now.getTime()} />
          </div>
        )}

        {/* Rediseño 2026-09-25 (docs/decisions/2026-09-25-hoy-cobrar-ahora.md): Hoy
          ya no muestra todos los turnos del día ni la ocupación. Muestra lo que
          hay que COBRAR: los turnos a los que les llegó la hora y no se cobraron
          ("Cobrar ahora") y lo que quedó sin cobrar de días anteriores. Lo que
          viene aparece solo cuando no hay nada para cobrar; el día entero está en
          la Grilla. */}
        <div className="card-entrance" style={{ animationDelay: '60ms' }}>
          <HoyShell
            bookings={hoyBookings}
            earlier={earlier}
            courts={hoyCourts}
            daySlots={daySlots}
            dayIsClosed={dayIsClosed}
            // Solo el dueño puede activar canchas (Configuración es suya).
            canManageCourts={isAdmin}
            serverNowMs={now.getTime()}
            cancellationPolicyHours={tenant.settings.cancellation_policy.hours_before}
            actions={{
              chargeDebtAction,
              completeAndChargeBookingAction,
              addBookingChargeAction,
              confirmDepositPaymentAction,
              markNoShowAction,
              revertNoShowAction,
              listRescheduleSlotsAction,
              rescheduleBookingAction,
              cancelBookingAction,
              releaseBlockAction,
              editBookingAction,
              getBookingEditDetailAction,
            }}
          />
        </div>

        {/* La checklist de arranque va DEBAJO del tablero (decisión del dueño,
          2026-09-24): el encargado entra con el usuario del dueño, así que arriba
          le ocupaba 240 px de la notebook del mostrador todas las noches. Lo de
          cada mes no le gana el lugar a lo de cada minuto (principio 1 de
          PRODUCT.md); el dueño la sigue viendo al bajar. */}
        {showChecklist && checklistState && (
          <div className="card-entrance" style={{ animationDelay: '120ms' }}>
            <OnboardingChecklist
              state={checklistState}
              tenantSlug={tenant.slug}
              appUrl={appUrl}
              action={markPublicLinkSharedAction}
              onDismiss={markChecklistDismissedAction}
              staffRole={role}
            />
          </div>
        )}

        {/* Sin novedades no hay bloque (2026-09-24): "Nada nuevo desde la última
          vez" ocupaba una tarjeta entera todas las noches para no decir nada. */}
        {whileYouWereAway.length > 0 && (
          <div className="card-entrance" style={{ animationDelay: '180ms' }}>
            <WhileYouWereAway items={whileYouWereAway} />
          </div>
        )}
      </div>
    </VenderProvider>
  )
}

/**
 * Los más vendidos por UNIDADES, que es lo que se busca en el mostrador (el reporte
 * de Caja los ordena por plata: una cerveza cara no es la que más se pide).
 */
function topSellerIds(ranking: { productId: string; units: number }[]): string[] {
  return [...ranking]
    .sort((a, b) => b.units - a.units)
    .slice(0, TOP_SELLERS_COUNT)
    .map((r) => r.productId)
}
