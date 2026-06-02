import { withPlayer } from '@/shared/middleware/with-player'
import { guard } from '@/shared/rate-limit/route-guard'
import { badRequest, businessRule, conflict, notFound } from '@/shared/api-error'
import { validatedJson } from '@/shared/api-output'
import { uuid } from '@/shared/validation/primitives'
import { openMatchResponseSchema } from '@/modules/open-matches/open-match.schema'
import { joinMatch } from '@/modules/open-matches/open-match.service'
import {
  OpenMatchAlreadyJoinedError,
  OpenMatchCannotJoinOwnError,
  OpenMatchNotFoundError,
  OpenMatchNotJoinableError,
} from '@/modules/open-matches/open-match.errors'

export const dynamic = 'force-dynamic'

// POST /api/player/open-matches/[id]/join — sumarse a un partido abierto.
export const POST = withPlayer(async (req, user, tx) => {
  const throttled = await guard('playerBooking', user.playerId)
  if (throttled) return throttled

  // Path: /api/player/open-matches/<id>/join → el id es el penúltimo segmento.
  const parsedId = uuid.safeParse(req.nextUrl.pathname.split('/').filter(Boolean).at(-2))
  if (!parsedId.success) {
    return badRequest('ID inválido.', { code: 'INVALID_ID' })
  }

  try {
    const match = await joinMatch(user.playerId, parsedId.data, tx)
    return validatedJson(
      openMatchResponseSchema,
      { data: match },
      'POST /api/player/open-matches/[id]/join',
    )
  } catch (e) {
    if (e instanceof OpenMatchNotFoundError) return notFound(e.message)
    if (e instanceof OpenMatchCannotJoinOwnError) return businessRule(e.message)
    if (e instanceof OpenMatchAlreadyJoinedError) return conflict(e.message)
    if (e instanceof OpenMatchNotJoinableError) return businessRule(e.message)
    throw e
  }
})
