import { NextResponse } from 'next/server'
import { withTenant } from '@/shared/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import { handleNoShow } from '@/modules/bookings/booking.cancellation'
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
    return NextResponse.json({ data: booking })
  } catch (err) {
    if (err instanceof BookingNotInConfirmedError) {
      return conflict('La reserva no está en estado confirmado.')
    }
    throw err
  }
})
