import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { withTenant } from '@/server/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import { subscribeSchema } from '@/modules/billing/billing.schema'
import { subscribe } from '@/modules/billing/billing.service'
import {
  DowngradeBlockedError,
  InvalidPayerEmailError,
  PlanNotFoundError,
  ReactivateNotAllowedError,
  SubscriptionNotFoundError,
} from '@/modules/billing/billing.errors'
import { getBillingGateway } from '@/modules/billing/billing.gateway'
import { badRequest, businessRule, validationError, notFound, conflict } from '@/shared/api-error'

export const dynamic = 'force-dynamic'

// Facturación: solo admin (audit_report.md 3-07/3-16).
export const POST = withTenant(
  async (req: NextRequest, user, tx) => {
    const throttled = await guard('adminCrud', user.tenantId!)
    if (throttled) return throttled

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return badRequest('JSON inválido.', { code: 'INVALID_JSON' })
    }
    const parsed = subscribeSchema.safeParse(body)
    if (!parsed.success) {
      return validationError(parsed.error, { status: 422 })
    }
    try {
      const result = await subscribe(
        user.tenantId!,
        parsed.data.planId,
        parsed.data.billingCycle,
        getBillingGateway(),
        tx,
      )
      return NextResponse.json({ data: result }, { status: 201 })
    } catch (err) {
      // El plan elegido no le entra por cantidad de canchas. Sin este catch el
      // error salía como 500 genérico justo en el alta —el momento donde el
      // complejo confirma su plan por primera vez— y el dueño se quedaba sin
      // saber qué hacer. Mensaje propio, no `err.message`: el del error es
      // técnico y en inglés, pensado para los logs.
      if (err instanceof DowngradeBlockedError) {
        return businessRule(
          `Ese plan cubre hasta ${err.targetMaxCourts} canchas y tenés ${err.currentCourtCount} activas. Elegí un plan más grande, o desactivá las canchas que no estés usando.`,
          {
            code: 'DOWNGRADE_BLOCKED',
            details: {
              currentCourtCount: err.currentCourtCount,
              targetMaxCourts: err.targetMaxCourts,
            },
          },
        )
      }
      if (err instanceof PlanNotFoundError) {
        return notFound(err.message, { code: 'PLAN_NOT_FOUND' })
      }
      if (err instanceof ReactivateNotAllowedError) {
        return conflict(err.message, { code: 'INVALID_STATE' })
      }
      if (err instanceof SubscriptionNotFoundError) {
        return notFound(err.message, { code: 'NOT_FOUND' })
      }
      if (err instanceof InvalidPayerEmailError) {
        return businessRule(err.message, { code: 'INVALID_PAYER_EMAIL' })
      }
      throw err
    }
  },
  { roles: ['admin'] },
)
