import { withPlayer } from '@/server/middleware/with-player'
import { guard } from '@/shared/rate-limit/route-guard'
import { badRequest, businessRule, conflict, notFound, validationError } from '@/shared/api-error'
import { validatedJson } from '@/shared/api-output'
import {
  createReviewResponseSchema,
  createReviewSchema,
} from '@/modules/reviews/review.schema'
import { createReview } from '@/modules/reviews/review.service'
import {
  ReviewAlreadyExistsError,
  ReviewBookingNotCompletedError,
  ReviewBookingNotFoundError,
} from '@/modules/reviews/review.errors'

export const dynamic = 'force-dynamic'

// POST /api/player/reviews — el jugador deja una reseña de un partido jugado.
export const POST = withPlayer(async (req, user, tx) => {
  const throttled = await guard('playerBooking', user.playerId)
  if (throttled) return throttled

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return badRequest('JSON inválido.')
  }

  const parsed = createReviewSchema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error)
  }

  try {
    const review = await createReview(
      user.playerId,
      parsed.data.bookingId,
      parsed.data.rating,
      parsed.data.comment ?? null,
      tx,
    )
    return validatedJson(
      createReviewResponseSchema,
      { data: review },
      'POST /api/player/reviews',
      { status: 201 },
    )
  } catch (e) {
    if (e instanceof ReviewBookingNotFoundError) return notFound(e.message)
    if (e instanceof ReviewBookingNotCompletedError) return businessRule(e.message)
    if (e instanceof ReviewAlreadyExistsError) return conflict(e.message)
    throw e
  }
})
