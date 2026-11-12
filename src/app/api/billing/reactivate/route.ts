import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { withBillingTenant } from '@/server/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import { requireVerifiedOwnerEmail } from '@/modules/auth/email-verification.service'
import { reactivateSchema } from '@/modules/billing/billing.schema'
import { reactivate } from '@/modules/billing/billing.service'
import {
  InvalidPayerEmailError,
  PlanNotFoundError,
  ReactivateNotAllowedError,
  SubscriptionNotFoundError,
} from '@/modules/billing/billing.errors'
import { getBillingGateway } from '@/modules/billing/billing.gateway'
import {
  badRequest,
  businessRule,
  conflict,
  forbidden,
  notFound,
  validationError,
} from '@/shared/api-error'

export const dynamic = 'force-dynamic'

// Facturación: solo admin (audit_report.md 3-07/3-16).
export const POST = withBillingTenant(
  async (req: NextRequest, user, tx) => {
    const throttled = await guard('adminCrud', user.tenantId!)
    if (throttled) return throttled

    // Plata: el payer de MP es este mail, así que primero tiene que estar probado.
    const verified = await requireVerifiedOwnerEmail(user.staffUserId!)
    if (!verified.ok) return forbidden(verified.error, { code: 'EMAIL_NOT_VERIFIED' })

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return badRequest('JSON inválido.', { code: 'INVALID_JSON' })
    }
    const parsed = reactivateSchema.safeParse(body)
    if (!parsed.success) {
      return validationError(parsed.error, {
        status: 422,
        message: parsed.error.issues[0]?.message ?? 'Datos inválidos',
      })
    }
    try {
      const result = await reactivate(
        user.tenantId!,
        parsed.data.billedCourts,
        parsed.data.billingCycle,
        getBillingGateway(),
        tx,
      )
      return NextResponse.json({ data: result }, { status: 201 })
    } catch (err) {
      if (err instanceof ReactivateNotAllowedError) {
        return conflict(err.message, { code: 'REACTIVATE_NOT_ALLOWED' })
      }
      if (err instanceof PlanNotFoundError) {
        return notFound(err.message, { code: 'PLAN_NOT_FOUND' })
      }
      if (err instanceof SubscriptionNotFoundError) {
        return notFound(err.message)
      }
      if (err instanceof InvalidPayerEmailError) {
        return businessRule(err.message, { code: 'INVALID_PAYER_EMAIL' })
      }
      throw err
    }
  },
  { roles: ['admin'] },
)
