import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { withPlayer } from '@/shared/middleware/with-player'
import { guard } from '@/shared/rate-limit/route-guard'
import { uuid } from '@/shared/validation/primitives'

export const dynamic = 'force-dynamic'

export const GET = withPlayer(async (req, user, tx) => {
  const throttled = await guard('playerBooking', user.playerId)
  if (throttled) return throttled

  const parsedId = uuid.safeParse(req.nextUrl.pathname.split('/').at(-1))
  if (!parsedId.success) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  }
  const bookingId = parsedId.data

  const rows = await tx.execute(sql`
    SELECT b.id, b.date::text, b.time_start::text, b.time_end::text,
           b.type, b.status, b.price_snapshot, b.deposit_status,
           b.notes_player, b.abonado_id,
           c.name AS court_name, c.id AS court_id,
           t.name AS tenant_name, t.slug AS tenant_slug
    FROM bookings b
    JOIN courts c ON c.id = b.court_id
    JOIN tenants t ON t.id = b.tenant_id
    WHERE b.id = ${bookingId}
    LIMIT 1
  `)

  const booking = (rows as unknown[])[0]
  if (!booking) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  return NextResponse.json({ data: { booking } })
})
