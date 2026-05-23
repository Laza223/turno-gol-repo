import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createOnlineBooking } from '@/modules/bookings/booking.service'
import { SlotTakenError } from '@/modules/bookings/booking.errors'
import { withTenantContext } from '@/shared/db/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isE2EAllowed(): boolean {
  return process.env.NEXT_PUBLIC_E2E === '1' && process.env.NODE_ENV !== 'production'
}

const bodySchema = z.object({
  tenantId: z.string().uuid(),
  courtId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeStart: z.string().regex(/^\d{2}:\d{2}$/),
  timeEnd: z.string().regex(/^\d{2}:\d{2}$/),
})

function durationMins(timeStart: string, timeEnd: string): 60 | 120 {
  const [sh, sm] = timeStart.split(':').map(Number)
  const [eh, em] = timeEnd.split(':').map(Number)
  const diff = (eh! * 60 + em!) - (sh! * 60 + sm!)
  return diff >= 120 ? 120 : 60
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isE2EAllowed()) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  const playerId = req.headers.get('x-e2e-player-id')
  if (!playerId) {
    return NextResponse.json({ error: 'missing player header' }, { status: 400 })
  }
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  try {
    const booking = await withTenantContext(parsed.data.tenantId, (tx) =>
      createOnlineBooking(
        parsed.data.tenantId,
        {
          playerId,
          courtId: parsed.data.courtId,
          date: parsed.data.date,
          timeStart: parsed.data.timeStart,
          timeEnd: parsed.data.timeEnd,
          durationMins: durationMins(parsed.data.timeStart, parsed.data.timeEnd),
          // E2E tenant has requires_deposit=false → booking confirms without MP.
          requiresDeposit: false,
          depositPercentage: 0,
        },
        tx,
      ),
    )
    return NextResponse.json({ bookingId: booking.id }, { status: 200 })
  } catch (e) {
    const msg = (e as Error).message ?? 'unknown'
    if (e instanceof SlotTakenError || /SlotTaken|exclusion|23P01/i.test(msg)) {
      return NextResponse.json({ error: 'SLOT_TAKEN' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
