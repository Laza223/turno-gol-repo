import { redirect } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { extractAuthUser } from '@/modules/auth/auth.middleware'
import { withPlayerContext } from '@/shared/db/client'
import { MisReservasView, type MisReservasBookingRow } from './MisReservasView'
import { cancelMyBookingAction } from './actions'

function artToday(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
}

export default async function MisReservasPage(
  props: {
    searchParams: Promise<{ tab?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const user = await extractAuthUser()
  if (!user || user.type !== 'player') redirect('/ingresar')

  const today = artToday()
  const tab = searchParams.tab === 'historial' ? 'historial' : 'proximos'

  const rows = await withPlayerContext(user.playerId, (tx) =>
    tx.execute(sql`
      SELECT b.id, b.date::text, b.time_start::text, b.time_end::text,
             b.type, b.status, b.price_snapshot,
             c.name AS court_name, t.name AS tenant_name, t.slug AS tenant_slug,
             EXISTS (SELECT 1 FROM reviews r WHERE r.booking_id = b.id) AS has_review
      FROM bookings b
      JOIN courts c ON c.id = b.court_id
      JOIN tenants t ON t.id = b.tenant_id
      WHERE b.player_id = ${user.playerId}
      ORDER BY b.date DESC, b.time_start DESC
      LIMIT 200
    `),
  )

  const allBookings = rows as unknown as MisReservasBookingRow[]
  const bookings = allBookings.filter((b) =>
    tab === 'proximos' ? b.date >= today : b.date < today,
  )
  const upcomingCount = allBookings.filter((b) => b.date >= today).length

  return (
    <MisReservasView
      bookings={bookings}
      tab={tab}
      upcomingCount={upcomingCount}
      cancelAction={cancelMyBookingAction}
    />
  )
}
