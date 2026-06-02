import { withTenant } from '@/shared/middleware/with-tenant'
import { validatedJson } from '@/shared/api-output'
import { guard } from '@/shared/rate-limit/route-guard'
import { handleNoShow } from '@/modules/bookings/booking.cancellation'
import { bookingResponseSchema } from '@/modules/bookings/booking.schema'
import { BookingNotInConfirmedError } from '@/modules/bookings/booking.errors'
import { parseRouteUuid } from '@/shared/api/route-params'
import { conflict } from '@/shared/api-error'

export const dynamic = 'force-dynamic'

export const POST = withTenant(async (req, user, tx) => {
  const throttled = await guard('adminCrud', user.tenantId!)
  if (throttled) return throttled

  const idResult = parseRouteUuid(req, 'second-last')
  if ('response' in idResult) return idResult.response
  const bookingId = idResult.uuid
  const staffUserId = user.staffUserId ?? ''

  try {
    const booking = await handleNoShow(bookingId, staffUserId, tx)
    return validatedJson(bookingResponseSchema, { data: booking }, 'POST /api/bookings/:id/no-show')
  } catch (err) {
    if (err instanceof BookingNotInConfirmedError) {
      return conflict('La reserva no está en estado confirmado.')
    }
    throw err
  }
})
