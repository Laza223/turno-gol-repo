import { sql } from 'drizzle-orm'
import { withPlayer } from '@/shared/middleware/with-player'
import { guard } from '@/shared/rate-limit/route-guard'
import { notFound } from '@/shared/api-error'
import { validatedJson } from '@/shared/api-output'
import { paymentStatusResponseSchema } from '@/modules/payments/payment.schema'
import { parseRouteUuid } from '@/shared/api/route-params'

export const dynamic = 'force-dynamic'

// Mirrors DEPOSIT_TIMER_MINUTES in src/modules/payments/payment.service.ts.
// Kept local to avoid importing server-only payment code into this route.
const DEPOSIT_TIMER_MINUTES = 15

export const GET = withPlayer(async (req, user, tx) => {
  const throttled = await guard('bookingStatus', user.playerId)
  if (throttled) return throttled

  const parsedId = parseRouteUuid(req, 'second-last')
  if ('response' in parsedId) return parsedId.response
  const bookingId = parsedId.uuid

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

  return validatedJson(
    paymentStatusResponseSchema,
    { data: { status, depositStatus, expiresAt } },
    'GET /api/player/bookings/:id/status',
  )
})
