import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withTenant } from '@/shared/middleware/with-tenant'
import { guard } from '@/shared/rate-limit/route-guard'
import {
  pauseAbonado,
  reactivateAbonado,
  cancelAbonado,
} from '@/modules/abonados/abonado.service'
import {
  AbonadoNotFoundError,
  AbonadoConflictError,
  AbonadoAlreadyCanceledError,
  ReactivationConflictError,
} from '@/modules/abonados/abonado.errors'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

const patchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('pause') }),
  z.object({ action: z.literal('reactivate') }),
  z.object({ action: z.literal('cancel'), from_date: z.string().date() }),
])

export const PATCH = withTenant(async (req: NextRequest, user, tx) => {
  const throttled = await guard('adminCrud', user.tenantId!)
  if (throttled) return throttled

  const id = req.nextUrl.pathname.split('/').at(-1)!

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Datos inválidos' } },
      { status: 422 },
    )
  }

  try {
    if (parsed.data.action === 'pause') {
      const abonado = await pauseAbonado(user.tenantId!, id, user.staffUserId!, tx)
      return NextResponse.json({ data: abonado })
    }
    if (parsed.data.action === 'reactivate') {
      const result = await reactivateAbonado(user.tenantId!, id, user.staffUserId!, tx)
      return NextResponse.json({ data: result })
    }
    const abonado = await cancelAbonado(
      user.tenantId!,
      id,
      parsed.data.from_date,
      user.staffUserId!,
      tx,
    )
    return NextResponse.json({ data: abonado })
  } catch (err) {
    if (err instanceof AbonadoNotFoundError) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: (err as Error).message } },
        { status: 404 },
      )
    }
    if (err instanceof AbonadoConflictError || err instanceof ReactivationConflictError) {
      return NextResponse.json(
        { error: { code: 'CONFLICT', message: (err as Error).message } },
        { status: 409 },
      )
    }
    if (err instanceof AbonadoAlreadyCanceledError) {
      return NextResponse.json(
        { error: { code: 'ALREADY_CANCELED', message: (err as Error).message } },
        { status: 422 },
      )
    }
    throw err
  }
})
