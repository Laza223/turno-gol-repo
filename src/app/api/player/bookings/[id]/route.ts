import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { withPlayer } from '@/shared/middleware/with-player'
import { guard } from '@/shared/rate-limit/route-guard'
import { badRequest, notFound } from '@/shared/api-error'
import { uuid } from '@/shared/validation/primitives'

export const dynamic = 'force-dynamic'

export const GET = withPlayer(async (req, user, tx) => {
  const throttled = await guard('playerBooking', user.playerId)
  if (throttled) return throttled

  const parsedId = uuid.safeParse(req.nextUrl.pathname.split('/').at(-1))
  if (!parsedId.success) {
    return badRequest('ID inválido.', { code: 'INVALID_ID' })
  }
  const bookingId = parsedId.data

  // El jugador no tiene app.current_tenant_id, así que el JOIN a courts (RLS por
  // tenant, FORCE RLS) quedaría vacío y la ruta devolvería 404 hasta para el
  // dueño. Pre-leemos el tenant desde bookings: player_own_bookings_select solo
  // expone la fila si la reserva es del jugador. Si no lo es, 0 filas → 404 sin
  // setear contexto ajeno (preserva la protección IDOR). Recién con el tenant
  // del propio booking seteado, el JOIN a courts resuelve.
  const pre = await tx.execute(sql`
    SELECT tenant_id FROM bookings WHERE id = ${bookingId} LIMIT 1
  `)
  const owned = (pre as unknown as Array<{ tenant_id: string }>)[0]
  if (!owned) {
    return notFound('La reserva no existe.')
  }
  await tx.execute(
    sql`SELECT set_config('app.current_tenant_id', ${owned.tenant_id}, true)`,
  )

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
    return notFound('La reserva no existe.')
  }

  return NextResponse.json({ data: { booking } })
})
