import { NextResponse } from 'next/server'
import { withTenant } from '@/shared/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import { handleNoShow } from '@/modules/bookings/booking.cancellation'
import { BookingNotInConfirmedError } from '@/modules/bookings/booking.errors'
import { uuid } from '@/shared/validation/primitives'

export const dynamic = 'force-dynamic'

export const POST = withTenant(async (req, user, tx) => {
  const throttled = await guard('adminCrud', user.tenantId!)
  if (throttled) return throttled

  const parts = req.nextUrl.pathname.split('/')
  const parsedId = uuid.safeParse(parts[parts.length - 2])
  if (!parsedId.success) {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'invalid_id' } }, { status: 400 })
  }
  const bookingId = parsedId.data
  const staffUserId = user.staffUserId ?? ''

  try {
    const booking = await handleNoShow(bookingId, staffUserId, tx)
    return NextResponse.json({ data: booking })
  } catch (err) {
    if (err instanceof BookingNotInConfirmedError) {
      return NextResponse.json(
        { error: { code: 'CONFLICT', message: 'La reserva no está en estado confirmado.' } },
        { status: 409 },
      )
    }
    throw err
  }
})
