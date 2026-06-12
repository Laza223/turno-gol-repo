import { NextResponse } from 'next/server'
import { z } from 'zod'
import { badRequest, businessRule, conflict, validationError } from '@/shared/api-error'
import { validatedJson } from '@/shared/api-output'
import { withTenant } from '@/shared/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import {
  createCashFlow,
  getCashFlows,
  validateCashFlowCombo,
} from '@/modules/cashflow/cashflow.service'
import { cashFlowResponseSchema } from '@/modules/cashflow/cashflow.schema'
import {
  InvalidCashFlowTypeError,
  InvalidCashFlowCategoryError,
  DayAlreadyClosedError,
} from '@/modules/cashflow/cashflow.errors'
import { artDateOf } from '@/shared/time/art-date'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const createCashFlowSchema = z.object({
  type: z.enum(['income', 'adjustment', 'expense']),
  category: z.enum(['booking', 'product_sale', 'other', 'no_show_correction', 'operating_expense']),
  amount: z.number().int().positive(),
  method: z.enum(['cash', 'transfer', 'mercadopago', 'other']),
  description: z.string().min(1).max(500),
  booking_id: z.string().uuid().optional(),
  product_id: z.string().uuid().optional(),
  occurred_at: z.string().datetime().optional(),
})

export const GET = withTenant(async (req: NextRequest, user, tx) => {
  const throttled = await guard('adminCrud', user.tenantId!)
  if (throttled) return throttled

  const date = new URL(req.url).searchParams.get('date') ?? artDateOf(new Date())
  const rows = await getCashFlows(user.tenantId!, date, tx)
  return NextResponse.json({ data: rows })
})

export const POST = withTenant(async (req: NextRequest, user, tx) => {
  const throttled = await guard('adminCrud', user.tenantId!)
  if (throttled) return throttled

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return badRequest('JSON inválido.', { code: 'INVALID_JSON' })
  }

  const parsed = createCashFlowSchema.safeParse(body)
  if (!parsed.success) {
    return validationError(parsed.error, { status: 422 })
  }

  // Double-check combo even though Zod enum restricts it (defense-in-depth)
  try {
    validateCashFlowCombo(parsed.data.type, parsed.data.category)
  } catch (err) {
    if (err instanceof InvalidCashFlowTypeError || err instanceof InvalidCashFlowCategoryError) {
      return businessRule((err as Error).message, { code: 'VALIDATION_ERROR' })
    }
    throw err
  }

  try {
    const cashFlow = await createCashFlow(
      user.tenantId!,
      user.staffUserId!,
      {
        type: parsed.data.type,
        category: parsed.data.category,
        amount: parsed.data.amount,
        method: parsed.data.method,
        description: parsed.data.description,
        bookingId: parsed.data.booking_id,
        productId: parsed.data.product_id,
        occurredAt: parsed.data.occurred_at ? new Date(parsed.data.occurred_at) : undefined,
      },
      tx,
    )
    return validatedJson(cashFlowResponseSchema, { data: cashFlow }, 'POST /api/cash-flows', {
      status: 201,
    })
  } catch (err) {
    if (err instanceof InvalidCashFlowTypeError || err instanceof InvalidCashFlowCategoryError) {
      return businessRule((err as Error).message, { code: 'VALIDATION_ERROR' })
    }
    if (err instanceof DayAlreadyClosedError) {
      return conflict((err as Error).message, { code: 'DAY_CLOSED' })
    }
    throw err
  }
})
