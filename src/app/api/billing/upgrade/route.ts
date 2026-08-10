import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { withTenant } from '@/server/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import { upgradeSchema } from '@/modules/billing/billing.schema'
import { upgrade } from '@/modules/billing/billing.service'
import {
  PlanNotFoundError,
  ReactivateNotAllowedError,
  SubscriptionNotFoundError,
} from '@/modules/billing/billing.errors'
import { getBillingGateway } from '@/modules/billing/billing.gateway'
import { badRequest, validationError, notFound, conflict, apiError } from '@/shared/api-error'
import { isFeatureEnabled } from '@/shared/feature-flags'

export const dynamic = 'force-dynamic'

// Facturación: solo admin (audit_report.md 3-07/3-16).
export const POST = withTenant(async (req: NextRequest, user, tx) => {
  const throttled = await guard('adminCrud', user.tenantId!)
  if (throttled) return throttled

  // TG-P1-MP-02 CERRADO: el webhook ya distingue los pagos de la cuenta MASTER
  // de los del MP del complejo vía `source=saas` (mp-webhook.handler.ts), así
  // que el proraeo se consulta y se aplica contra la cuenta correcta. La migr.
  // 067 dejó el flag global en `true`.
  //
  // El gate sobrevive como kill switch, no como "todavía no está listo": es
  // plata real por un camino recién estrenado, y una fila de override por
  // complejo (o volver el global a `false`) lo apaga sin esperar un deploy.
  const upgradesEnabled = await isFeatureEnabled('saas_upgrade', user.tenantId!)
  if (!upgradesEnabled) {
    return apiError(501, 'NOT_IMPLEMENTED', 'Cambio de plan no disponible todavía.')
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return badRequest('JSON inválido.', { code: 'INVALID_JSON' })
  }
  const parsed = upgradeSchema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error, { status: 422 })
  }
  try {
    const result = await upgrade(
      user.tenantId!,
      parsed.data.targetPlanId,
      getBillingGateway(),
      tx,
    )
    return NextResponse.json({ data: result }, { status: 200 })
  } catch (err) {
    if (err instanceof PlanNotFoundError) {
      return notFound(err.message, { code: 'PLAN_NOT_FOUND' })
    }
    if (err instanceof ReactivateNotAllowedError) {
      return conflict(err.message, { code: 'INVALID_STATE' })
    }
    if (err instanceof SubscriptionNotFoundError) {
      return notFound(err.message, { code: 'NOT_FOUND' })
    }
    throw err
  }
}, { roles: ['admin'] })
