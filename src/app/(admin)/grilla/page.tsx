import { redirect } from 'next/navigation'
import { and, eq, sql } from 'drizzle-orm'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { listCourts } from '@/modules/courts/court.service'
import { safeDateParam } from '@/shared/validation/calendar-date'
import { bookings, players } from '@/shared/db/schema'
import { BookingGrid, type GridBooking } from '@/components/booking/BookingGrid'
import {
  createBookingAction,
  checkSlotAvailabilityAction,
  searchBookingPlayersAction,
} from '@/app/(admin)/reservas/actions'
import type {
  BookingStatus,
  BookingType,
  DepositStatus,
  PaymentMethodValue,
} from '@/modules/bookings/booking.types'

export default async function GrillaPage(
  props: {
    searchParams: Promise<{ date?: string }>
  }
) {
  const searchParams = await props.searchParams
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/onboarding')

  const todayArt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const dateStr = safeDateParam(searchParams.date, todayArt)

  const [courts, rawBookings] = await withTenantContext(tenant.id, async (tx) => {
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

    return [courtList, bookingRows] as const
  })

  const initialBookings: GridBooking[] = rawBookings.map((r) => ({
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
  }))

  return (
    <div className="flex-1 flex flex-col min-h-0 space-y-4 h-full">
      <BookingGrid
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
      />
    </div>
  )
}
