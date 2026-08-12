import { redirect } from 'next/navigation'
import { and, eq, sql } from 'drizzle-orm'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { listCourts } from '@/modules/courts/court.service'
import { safeDateParam } from '@/shared/validation/calendar-date'
import { bookings, players } from '@/shared/db/schema'
import type { GridBooking } from '@/components/booking/BookingGrid'
import { GrillaView } from './GrillaView'
import { GrillaTabs } from './GrillaTabs'
import {
  createBookingAction,
  checkSlotAvailabilityAction,
  searchBookingPlayersAction,
  addBookingChargeAction,
  completeAndChargeBookingAction,
  markNoShowAction,
  revertNoShowAction,
  listRescheduleSlotsAction,
  rescheduleBookingAction,
} from '@/app/(admin)/reservas/actions'
import { chargeDebtAction } from '@/app/(admin)/caja/deudas/actions'
import { listCanteenForBookingAction, sellTicketAction } from '@/app/(admin)/caja/cantina/actions'
import { sumBookingChargesByBooking } from '@/app/(admin)/reservas/queries'
import { summarizeBookingCharges } from '@/modules/bookings/booking.charges'
import { artTodayStr } from '@/shared/dates/art'
import type {
  BookingStatus,
  BookingType,
  DepositStatus,
  PaymentMethodValue,
} from '@/modules/bookings/booking.types'

export default async function GrillaPage(props: { searchParams: Promise<{ date?: string }> }) {
  const searchParams = await props.searchParams
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/onboarding')

  const todayArt = artTodayStr()
  const dateStr = safeDateParam(searchParams.date, todayArt)

  const { courts, rawBookings, chargesByBooking } = await withTenantContext(
    tenant.id,
    async (tx) => {
      const [courtList, bookingRows] = await Promise.all([
        listCourts(tenant.id, tx),
        tx
          .select({
            id: bookings.id,
            courtId: bookings.courtId,
            date: bookings.date,
            timeStart: bookings.timeStart,
            timeEnd: bookings.timeEnd,
            status: bookings.status,
            type: bookings.type,
            guestName: bookings.guestName,
            priceSnapshot: bookings.priceSnapshot,
            paymentMethod: bookings.paymentMethod,
            depositStatus: bookings.depositStatus,
            depositAmount: bookings.depositAmount,
            // B15: sin created_at la grilla no puede decir cuánto le queda al
            // hold. Eran 15 columnas y esta no estaba.
            createdAt: bookings.createdAt,
            playerFirstName: players.firstName,
            playerLastName: players.lastName,
          })
          .from(bookings)
          .leftJoin(players, eq(bookings.playerId, players.id))
          .where(
            and(
              eq(bookings.tenantId, tenant.id),
              sql`${bookings.date} = ${dateStr}::date`,
              sql`${bookings.status} IN ('confirmed', 'pending_payment', 'completed', 'no_show')`,
            ),
          ),
      ])

      // Los cobros de mostrador se piden DESPUÉS de saber qué turnos hay: es una
      // sola query agregada para todo el día, no una por celda.
      const charges = await sumBookingChargesByBooking(
        tenant.id,
        bookingRows.map((r) => r.id),
        tx,
      )

      return { courts: courtList, rawBookings: bookingRows, chargesByBooking: charges }
    },
  )

  const initialBookings: GridBooking[] = rawBookings.map((r) => {
    // La alarma "sin cobrar" de Fase 3 necesita plata, no estado: el saldo sale
    // de la misma función que usa el detalle del turno, así los dos números no
    // pueden discrepar.
    const { totalPaid, pending } = summarizeBookingCharges({
      priceSnapshot: r.priceSnapshot,
      depositAmount: r.depositAmount,
      depositStatus: r.depositStatus,
      chargesTotal: chargesByBooking.get(r.id) ?? 0,
    })
    return {
      id: r.id,
      courtId: r.courtId,
      date: (r.date as Date).toISOString().slice(0, 10),
      timeStart: r.timeStart.slice(0, 5),
      timeEnd: r.timeEnd.slice(0, 5),
      status: r.status as BookingStatus,
      type: r.type as BookingType,
      guestName: r.guestName ?? null,
      playerFirstName: r.playerFirstName ?? null,
      playerLastName: r.playerLastName ?? null,
      priceSnapshot: r.priceSnapshot,
      paymentMethod: r.paymentMethod as PaymentMethodValue | null,
      depositStatus: r.depositStatus as DepositStatus,
      depositAmount: r.depositAmount,
      totalPaid,
      pending,
    }
  })

  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-4 h-full">
      <GrillaTabs active="/grilla" />
      <GrillaView
        key={dateStr}
        courts={courts}
        initialBookings={initialBookings}
        date={dateStr}
        tenantId={tenant.id}
        openingHours={tenant.openingHours}
        closedDates={tenant.closedDates ?? []}
        closesNextDay={tenant.closesNextDay}
        action={createBookingAction}
        checkAvailabilityAction={checkSlotAvailabilityAction}
        searchPlayersAction={searchBookingPlayersAction}
        // Sugerencia de seña del popover de alta rápida (Fase 3). Mismo default
        // que usa el resto del producto cuando el complejo no lo configuró.
        depositPercentage={tenant.settings.deposit_percentage ?? 30}
        slotPanelActions={{
          chargeDebtAction,
          completeAndChargeBookingAction,
          addBookingChargeAction,
          markNoShowAction,
          revertNoShowAction,
          listRescheduleSlotsAction,
          rescheduleBookingAction,
        }}
        canteen={{
          listCatalogAction: listCanteenForBookingAction,
          // sellTicketAction toma `unknown` y valida con Zod: el bookingId
          // extra que le agrega el diálogo entra por el mismo schema.
          sellTicketAction,
        }}
      />
    </div>
  )
}
