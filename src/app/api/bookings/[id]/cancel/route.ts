import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { withTenant } from '@/shared/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import { parseRouteUuid } from '@/shared/api/route-params'
import { tenants } from '@/shared/db/schema'
import { resolveTenantGateway } from '@/modules/payments/mp-oauth'
import { cancelByAdmin } from '@/modules/bookings/booking.cancellation'
import { BookingNotInConfirmedError } from '@/modules/bookings/booking.errors'
import type { PaymentGateway } from '@/modules/payments/mp-gateway'

export const dynamic = 'force-dynamic'

const cancelBodySchema = z.object({
  reason: z.string().min(1).max(1000),
  should_refund: z.boolean(),
})

export const POST = withTenant(async (req, user, tx) => {
  const throttled = await guard('adminCrud', user.tenantId!)
  if (throttled) return throttled

  const idResult = parseRouteUuid(req, 'second-last')
  if ('response' in idResult) return idResult.response
  const bookingId = idResult.uuid

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const parsed = cancelBodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Datos inválidos' } },
      { status: 422 },
    )
  }

  const { reason, should_refund: shouldRefund } = parsed.data

  let gateway: PaymentGateway | null = null
  if (shouldRefund) {
    const tenantRows = await tx
      .select({ mpAccessToken: tenants.mpAccessToken })
      .from(tenants)
      .where(eq(tenants.id, user.tenantId!))
      .limit(1)
    const mpAccessToken = tenantRows[0]?.mpAccessToken
    if (mpAccessToken) {
      gateway = resolveTenantGateway(user.tenantId!, mpAccessToken)
    }
  }

  try {
    const booking = await cancelByAdmin(
      bookingId,
      user.staffUserId ?? '',
      reason,
      shouldRefund,
      gateway,
      tx,
    )
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
