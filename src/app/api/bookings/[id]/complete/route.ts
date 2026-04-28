import { NextResponse } from 'next/server'
import { withTenant } from '@/shared/middleware/with-tenant'
import { completeBooking } from '@/modules/bookings/booking.service'
import { BookingNotInConfirmedError } from '@/modules/bookings/booking.errors'

export const dynamic = 'force-dynamic'

export const POST = withTenant(async (req, _user, tx) => {
  const parts = req.nextUrl.pathname.split('/')
  const bookingId = parts[parts.length - 2]!

  try {
    const booking = await completeBooking(bookingId, 'admin', tx)
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
