import { NextResponse } from 'next/server'
import { sql } from 'drizzle-orm'
import { withPlayer } from '@/shared/middleware/with-player'
import { guard } from '@/shared/rate-limit/route-guard'
import { badRequest, notFound } from '@/shared/api-error'
import { uuid } from '@/shared/validation/primitives'

export const dynamic = 'force-dynamic'

// Mirrors DEPOSIT_TIMER_MINUTES in src/modules/payments/payment.service.ts.
// Kept local to avoid importing server-only payment code into this route.
const DEPOSIT_TIMER_MINUTES = 15

export const GET = withPlayer(async (req, user, tx) => {
  const throttled = await guard('bookingStatus', user.playerId)
  if (throttled) return throttled

  // Path is .../[id]/status — the booking id is the second-to-last segment.
  const parsedId = uuid.safeParse(req.nextUrl.pathname.split('/').at(-2))
  if (!parsedId.success) {
    return badRequest('ID inválido.', { code: 'INVALID_ID' })
  }
  const bookingId = parsedId.data

  const rows = await tx.execute(sql`
    SELECT status, deposit_status AS "depositStatus", created_at AS "createdAt"
    FROM bookings
    WHERE id = ${bookingId}
    LIMIT 1
  `)

  const row = (rows as unknown[])[0] as
    | { status: string; depositStatus: string; createdAt: string }
    | undefined

  if (!row) {
    // RLS hides other players' bookings → null → 404 (desired behavior).
    return notFound('La reserva no existe.')
  }

  const { status, depositStatus, createdAt } = row
  const expiresAt = new Date(
    new Date(createdAt).getTime() + DEPOSIT_TIMER_MINUTES * 60_000,
  ).toISOString()

  return NextResponse.json({ data: { status, depositStatus, expiresAt } })
})
