import { NextResponse } from 'next/server'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { withPlayer } from '@/shared/middleware/with-player'
import { guard } from '@/shared/rate-limit/route-guard'
import { tenants } from '@/shared/db/schema'
import { resolveTenantGateway } from '@/modules/payments/mp-oauth'
import { cancelByPlayer } from '@/modules/bookings/booking.cancellation'
import {
  BookingNotInConfirmedError,
  BookingNotOwnedByPlayerError,
  TenantInactiveError,
} from '@/modules/bookings/booking.errors'
import type { PaymentGateway } from '@/modules/payments/mp-gateway'

export const dynamic = 'force-dynamic'

const cancelBodySchema = z.object({
  reason: z.string().max(1000).optional(),
})

export const POST = withPlayer(async (req, user, tx) => {
  const throttled = await guard('playerBooking', user.playerId)
  if (throttled) return throttled

  const parts = req.nextUrl.pathname.split('/')
  const bookingId = parts[parts.length - 2]!

  let body: unknown
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const parsed = cancelBodySchema.safeParse(body)
  const reason = parsed.success ? parsed.data.reason : undefined

  // Pre-read booking to get tenantId + depositStatus (then lock inside service).
  const preRead = await tx.execute(sql`
    SELECT tenant_id, deposit_status
    FROM bookings
    WHERE id = ${bookingId}
    LIMIT 1
  `)
  const pre = (preRead as unknown as Array<{ tenant_id: string; deposit_status: string }>)[0]
  if (!pre) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // Set tenant context so audit_logs INSERT passes RLS (same pattern as /api/player/bookings).
  await tx.execute(
    sql`SELECT set_config('app.current_tenant_id', ${pre.tenant_id}, true)`,
  )

  let gateway: PaymentGateway | null = null
  if (pre.deposit_status === 'paid') {
    const tenantRows = await tx
      .select({ mpAccessToken: tenants.mpAccessToken })
      .from(tenants)
      .where(eq(tenants.id, pre.tenant_id))
      .limit(1)
    const mpAccessToken = tenantRows[0]?.mpAccessToken
    if (mpAccessToken) {
      gateway = resolveTenantGateway(pre.tenant_id, mpAccessToken)
    }
  }

  try {
    const booking = await cancelByPlayer(bookingId, user.playerId, reason, gateway, tx)
    return NextResponse.json({ data: booking })
  } catch (err) {
    if (err instanceof BookingNotOwnedByPlayerError) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'No tenés permiso para cancelar esta reserva.' } },
        { status: 403 },
      )
    }
    if (err instanceof BookingNotInConfirmedError) {
      return NextResponse.json(
        { error: { code: 'CONFLICT', message: 'La reserva no está en estado confirmado.' } },
        { status: 409 },
      )
    }
    if (err instanceof TenantInactiveError) {
      return NextResponse.json(
        {
          error: {
            code: 'TENANT_INACTIVE',
            message: 'Este complejo no está disponible. Contactá al complejo para gestionar la cancelación.',
          },
        },
        { status: 409 },
      )
    }
    throw err
  }
})
