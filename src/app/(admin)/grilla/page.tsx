import { redirect } from 'next/navigation'
import { and, eq, sql } from 'drizzle-orm'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { getStaffTenant } from '@/modules/tenants/tenant.service'
import { withTenantContext } from '@/shared/db/client'
import { listCourts } from '@/modules/courts/court.service'
import { bookings, players } from '@/shared/db/schema'
import { BookingGrid, type GridBooking } from '@/components/booking/BookingGrid'
import type { BookingStatus, BookingType } from '@/modules/bookings/booking.types'


export default async function GrillaPage({
  searchParams,
}: {
  searchParams: { date?: string }
}) {
  const user = await extractAuthUser()
  if (!user || user.type !== 'staff' || !user.staffUserId) redirect('/login')

  const tenant = await getStaffTenant(user.staffUserId)
  if (!tenant) redirect('/onboarding')

  const todayArt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const dateStr = searchParams.date ?? todayArt

  const [courts, rawBookings] = await withTenantContext(tenant.id, async (tx) => {
    const courtList = await listCourts(tx)
    const bookingRows = await tx
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
      )
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
  }))

  return (
    <main className="max-w-full px-4 py-8 space-y-6">
      <BookingGrid
        key={dateStr}
        courts={courts}
        initialBookings={initialBookings}
        date={dateStr}
        tenantId={tenant.id}
        openingHours={tenant.openingHours}
        closedDates={tenant.closedDates ?? []}
      />
    </main>
  )
}
