import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withTenant } from '@/shared/middleware/with-tenant'
import { createAbonado, getAbonados } from '@/modules/abonados/abonado.service'
import { AbonadoConflictError } from '@/modules/abonados/abonado.errors'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const createAbonadoSchema = z.object({
  court_id: z.string().uuid(),
  player_id: z.string().uuid().optional(),
  contact_name: z.string().min(1),
  contact_phone: z.string().min(1),
  day_of_week: z.number().int().min(0).max(6),
  time_start: z.string().regex(/^\d{2}:\d{2}$/),
  time_end: z.string().regex(/^\d{2}:\d{2}$/),
  price_per_session: z.number().int().min(0),
  monthly_price: z.number().int().min(0),
  starts_on: z.string().date(),
  ends_on: z.string().date().optional(),
  payment_method: z.enum(['cash', 'transfer']).default('cash'),
  notes: z.string().optional(),
})

export const GET = withTenant(async (_req: NextRequest, user, tx) => {
  const rows = await getAbonados(user.tenantId!, {}, tx)
  return NextResponse.json({ data: rows })
})

export const POST = withTenant(async (req: NextRequest, user, tx) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = createAbonadoSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Datos inválidos' } },
      { status: 422 },
    )
  }

  const d = parsed.data
  try {
    const result = await createAbonado(
      user.tenantId!,
      user.staffUserId!,
      {
        courtId: d.court_id,
        playerId: d.player_id,
        contactName: d.contact_name,
        contactPhone: d.contact_phone,
        dayOfWeek: d.day_of_week,
        timeStart: d.time_start,
        timeEnd: d.time_end,
        pricePerSession: d.price_per_session,
        monthlyPrice: d.monthly_price,
        startsOn: d.starts_on,
        endsOn: d.ends_on,
        paymentMethod: d.payment_method,
        notes: d.notes,
      },
      tx,
    )
    return NextResponse.json({ data: result }, { status: 201 })
  } catch (err) {
    if (err instanceof AbonadoConflictError) {
      return NextResponse.json(
        { error: { code: 'ABONADO_CONFLICT', message: (err as Error).message } },
        { status: 409 },
      )
    }
    throw err
  }
})
