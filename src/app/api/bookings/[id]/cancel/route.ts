import { eq } from 'drizzle-orm'
import { badRequest, validationError, conflict } from '@/shared/api-error'
import { validatedJson } from '@/shared/api-output'
import { z } from 'zod'
import { withTenant } from '@/shared/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import { parseRouteUuid } from '@/shared/api/route-params'
import { tenants } from '@/shared/db/schema'
import { resolveTenantGateway } from '@/modules/payments/mp-oauth'
import { cancelByAdmin } from '@/modules/bookings/booking.cancellation'
import { bookingResponseSchema } from '@/modules/bookings/booking.schema'
import {
  BookingNotInConfirmedError,
  RefundUnavailableError,
} from '@/modules/bookings/booking.errors'
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
    return badRequest('JSON inválido.', { code: 'INVALID_JSON' })
  }

  const parsed = cancelBodySchema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error, { status: 422 })
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
    return validatedJson(bookingResponseSchema, { data: booking }, 'POST /api/bookings/:id/cancel')
  } catch (err) {
    if (err instanceof BookingNotInConfirmedError) {
      return conflict('La reserva no está en estado confirmado.', { code: 'CONFLICT' })
    }
    // Hallazgo 2: refund pedido pero MP no disponible para el complejo.
    if (err instanceof RefundUnavailableError) {
      return conflict(
        'No se pudo procesar el reembolso por MercadoPago. Cancelá sin reembolso o gestionalo manualmente.',
        { code: 'REFUND_UNAVAILABLE' },
      )
    }
    throw err
  }
})
