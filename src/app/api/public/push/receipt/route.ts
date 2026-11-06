import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { badRequest, forbidden, validationError } from '@/shared/api-error'
import { guard } from '@/shared/rate-limit/route-guard'
import {
  recordPushReceipt,
  verifyPushReceiptToken,
} from '@/modules/notifications/push-receipt.service'

export const runtime = 'nodejs'

const receiptSchema = z.object({
  deliveryId: z.string().min(1).max(250),
  token: z.string().min(1).max(128),
  stage: z.enum(['processed', 'opened']),
})

export async function POST(req: NextRequest) {
  if (Number(req.headers.get('content-length') ?? 0) > 1024) return badRequest('Recibo inválido.')
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return badRequest('JSON inválido.')
  }
  const parsed = receiptSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)
  const { deliveryId, token, stage } = parsed.data
  if (!verifyPushReceiptToken(deliveryId, token)) return forbidden('Recibo inválido.')
  const throttled = await guard('publicAvailability', `push-receipt:${deliveryId}`)
  if (throttled) return throttled
  const recorded = await recordPushReceipt(deliveryId, token, stage)
  return NextResponse.json({ success: recorded }, { headers: { 'Cache-Control': 'no-store' } })
}
