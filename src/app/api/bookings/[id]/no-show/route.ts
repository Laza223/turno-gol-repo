import { NextResponse } from 'next/server'
import { withTenant } from '@/shared/middleware/with-tenant'
import { handleNoShow } from '@/modules/bookings/booking.cancellation'
import { BookingNotInConfirmedError } from '@/modules/bookings/booking.errors'

export const dynamic = 'force-dynamic'

export const POST = withTenant(async (req, user, tx) => {
  const parts = req.nextUrl.pathname.split('/')
  const bookingId = parts[parts.length - 2]!
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
