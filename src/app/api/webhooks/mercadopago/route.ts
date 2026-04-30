import { type NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getBoss } from '@/shared/jobs/boss'
import {
  MP_WEBHOOK_SEND_OPTIONS,
  QUEUE_PROCESS_MP_WEBHOOK,
} from '@/shared/jobs/queue-names'
import { webhookPayloadSchema } from '@/modules/payments/payment.schema'
import type { MpWebhookJob } from '@/modules/payments/mp-webhook.handler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Validates the `X-Webhook-Secret` header against `MP_WEBHOOK_SECRET`.
 *
 * Behavior:
 *   - secret env unset + non-production → return true (dev/test).
 *   - secret env unset + production → return false (fail closed).
 *   - secret env set + header missing or mismatched → return false.
 *   - secret env set + header equal → return true (timing-safe compare).
 */
export function verifyWebhookSecret(headerValue: string | null): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  if (!headerValue) return false
  const a = Buffer.from(headerValue)
  const b = Buffer.from(secret)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url)
  const tenantId = url.searchParams.get('tenant')
  if (!tenantId) {
    return NextResponse.json({ error: 'missing tenant' }, { status: 400 })
  }

  if (!verifyWebhookSecret(req.headers.get('x-webhook-secret'))) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const parsed = webhookPayloadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
  }
  const payload = parsed.data

  // Handled types:
  //   - `payment`                          → booking deposit OR SaaS upgrade proration
  //   - `subscription_authorized_payment`  → SaaS recurring charge (preapproval child)
  //   - `subscription_preapproval`         → preapproval lifecycle change (cancel / hold)
  const HANDLED_TYPES = new Set([
    'payment',
    'subscription_authorized_payment',
    'subscription_preapproval',
  ])
  if (!HANDLED_TYPES.has(payload.type)) {
    return NextResponse.json({ ok: true, ignored: payload.type })
  }

  const job: MpWebhookJob = {
    tenantId,
    mpEventId: payload.id,
    eventType: payload.type,
    mpPaymentId: payload.data.id,
    rawPayload: payload,
  }

  try {
    const boss = await getBoss()
    await boss.send(QUEUE_PROCESS_MP_WEBHOOK, job, MP_WEBHOOK_SEND_OPTIONS)
  } catch (err) {
    // Enqueue failure → MP will retry. Return 5xx so MP doesn't mark delivered.
    console.error('[mp-webhook] enqueue failed', err)
    return NextResponse.json({ error: 'enqueue failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
