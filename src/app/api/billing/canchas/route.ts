import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { withTenant } from '@/server/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import { changeBilledCourtsSchema } from '@/modules/billing/billing.schema'
import { changeBilledCourts } from '@/modules/billing/billing.service'
import {
  DowngradeBlockedError,
  PlanNotFoundError,
  ReactivateNotAllowedError,
  SubscriptionNotFoundError,
} from '@/modules/billing/billing.errors'
import { getBillingGateway } from '@/modules/billing/billing.gateway'
import {
  apiError,
  badRequest,
  businessRule,
  conflict,
  notFound,
  validationError,
} from '@/shared/api-error'
import { isFeatureEnabled } from '@/shared/feature-flags'

export const dynamic = 'force-dynamic'

/**
 * Cambiar por cuantas canchas se factura. Reemplaza a
 * `/api/billing/upgrade` y `/api/billing/downgrade`, que existían cuando el
 * precio venía en bandas y subir o bajar eran dos operaciones distintas con
 * dos mecánicas de cobro distintas.
 *
 * Con precio por cancha es una sola operación y nunca cobra en el momento
 * (decisión 2026-09-17, P4): en trial se aplica ya, con la suscripción activa
 * se agenda para el próximo ciclo.
 *
 * Facturación: solo admin (audit_report.md 3-07/3-16).
 */
export const POST = withTenant(
  async (req: NextRequest, user, tx) => {
    const throttled = await guard('adminCrud', user.tenantId!)
    if (throttled) return throttled

    // Kill switch heredado de `/api/billing/upgrade` (migr. 067). Sigue siendo
    // plata real por un camino que se toca cada vez que alguien agrega una
    // cancha: una fila de override por complejo lo apaga sin esperar un deploy.
    const enabled = await isFeatureEnabled('saas_upgrade', user.tenantId!)
    if (!enabled) {
      return apiError(501, 'NOT_IMPLEMENTED', 'Cambio de canchas facturadas no disponible.')
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return badRequest('JSON inválido.', { code: 'INVALID_JSON' })
    }
    const parsed = changeBilledCourtsSchema.safeParse(body)
    if (!parsed.success) {
      return validationError(parsed.error, { status: 422 })
    }
    try {
      const result = await changeBilledCourts(
        user.tenantId!,
        parsed.data.billedCourts,
        getBillingGateway(),
        tx,
      )
      return NextResponse.json({ data: result }, { status: 200 })
    } catch (err) {
      if (err instanceof DowngradeBlockedError) {
        return businessRule(
          `Tenés ${err.currentCourtCount} canchas prendidas: no podés facturar por ${err.targetBilledCourts}. Apagá las canchas que no uses antes de bajar tu cuota.`,
          {
            code: 'DOWNGRADE_BLOCKED',
            details: {
              currentCourtCount: err.currentCourtCount,
              targetBilledCourts: err.targetBilledCourts,
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
      throw err
    }
  },
  { roles: ['admin'] },
)
