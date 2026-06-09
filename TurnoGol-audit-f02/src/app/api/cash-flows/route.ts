import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withTenant } from '@/shared/middleware/with-tenant'
import {
  createCashFlow,
  getCashFlows,
  validateCashFlowCombo,
} from '@/modules/cashflow/cashflow.service'
import {
  InvalidCashFlowTypeError,
  InvalidCashFlowCategoryError,
  DayAlreadyClosedError,
} from '@/modules/cashflow/cashflow.errors'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

function artDateOf(ts: Date): string {
  return new Date(ts.getTime() - 3 * 3600_000).toISOString().slice(0, 10)
}

const createCashFlowSchema = z.object({
  type: z.enum(['income', 'adjustment']),
  category: z.enum(['booking', 'product_sale', 'other', 'no_show_correction']),
  amount: z.number().int().positive(),
  method: z.enum(['cash', 'transfer', 'mercadopago', 'other']),
  description: z.string().min(1).max(500),
  booking_id: z.string().uuid().optional(),
  product_id: z.string().uuid().optional(),
  occurred_at: z.string().datetime().optional(),
})

export const GET = withTenant(async (req: NextRequest, user, tx) => {
  const date = new URL(req.url).searchParams.get('date') ?? artDateOf(new Date())
  const rows = await getCashFlows(user.tenantId!, date, tx)
  return NextResponse.json({ data: rows })
})

export const POST = withTenant(async (req: NextRequest, user, tx) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = createCashFlowSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Datos inválidos' } },
      { status: 422 },
    )
  }

  // Double-check combo even though Zod enum restricts it (defense-in-depth)
  try {
    validateCashFlowCombo(parsed.data.type, parsed.data.category)
  } catch (err) {
    if (err instanceof InvalidCashFlowTypeError || err instanceof InvalidCashFlowCategoryError) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: (err as Error).message } },
        { status: 422 },
      )
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
    return NextResponse.json({ data: cashFlow }, { status: 201 })
  } catch (err) {
    if (err instanceof InvalidCashFlowTypeError || err instanceof InvalidCashFlowCategoryError) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: (err as Error).message } },
        { status: 422 },
      )
    }
    if (err instanceof DayAlreadyClosedError) {
      return NextResponse.json(
        { error: { code: 'DAY_CLOSED', message: (err as Error).message } },
        { status: 409 },
      )
    }
    throw err
  }
})
