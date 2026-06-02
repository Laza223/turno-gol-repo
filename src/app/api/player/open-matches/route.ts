import { withPlayer } from '@/shared/middleware/with-player'
import { guard } from '@/shared/rate-limit/route-guard'
import { badRequest, businessRule, conflict, notFound, validationError } from '@/shared/api-error'
import { validatedJson } from '@/shared/api-output'
import {
  createOpenMatchSchema,
  openMatchResponseSchema,
} from '@/modules/open-matches/open-match.schema'
import { createOpenMatch } from '@/modules/open-matches/open-match.service'
import {
  OpenMatchAlreadyExistsError,
  OpenMatchBookingNotConfirmedError,
  OpenMatchBookingNotFoundError,
} from '@/modules/open-matches/open-match.errors'

export const dynamic = 'force-dynamic'

// POST /api/player/open-matches — abrir un "Falta Uno" desde una reserva propia.
export const POST = withPlayer(async (req, user, tx) => {
  const throttled = await guard('playerBooking', user.playerId)
  if (throttled) return throttled

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return badRequest('JSON inválido.')
  }

  const parsed = createOpenMatchSchema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error)
  }

  try {
    const match = await createOpenMatch(
      user.playerId,
      parsed.data.bookingId,
      parsed.data.slotsTotal,
      parsed.data.restrictions ?? null,
      tx,
    )
    return validatedJson(
      openMatchResponseSchema,
      { data: match },
      'POST /api/player/open-matches',
      { status: 201 },
    )
  } catch (e) {
    if (e instanceof OpenMatchBookingNotFoundError) return notFound(e.message)
    if (e instanceof OpenMatchBookingNotConfirmedError) return businessRule(e.message)
    if (e instanceof OpenMatchAlreadyExistsError) return conflict(e.message)
    throw e
  }
})
