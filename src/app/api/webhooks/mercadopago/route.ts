import { type NextRequest, NextResponse } from 'next/server'
import { getBoss } from '@/shared/jobs/boss'
import {
  MP_WEBHOOK_SEND_OPTIONS,
  QUEUE_PROCESS_MP_WEBHOOK,
} from '@/shared/jobs/queue-names'
import { webhookPayloadSchema, webhookResponseSchema } from '@/modules/payments/payment.schema'
import { handleMpWebhookJob, type MpWebhookJob } from '@/modules/payments/mp-webhook.handler'
import { verifyWebhookSignature } from '@/modules/payments/webhook-auth'
import { MP_MOCK_ENABLED } from '@/modules/payments/mock-mp'
import { track, withSpan } from '@/shared/observability'
import { logger } from '@/shared/lib/logger'
import { validatedJson } from '@/shared/api-output'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url)
  const tenantId = url.searchParams.get('tenant')
  if (!tenantId) {
    return NextResponse.json({ error: 'missing tenant' }, { status: 400 })
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

  const xSignature = req.headers.get('x-signature')
  const xRequestId = req.headers.get('x-request-id')
  const dataId = url.searchParams.get('data.id') ?? payload.data.id

  if (!verifyWebhookSignature(xSignature, xRequestId, dataId)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  track.webhook('mp.webhook.received', {
    mpEventId: payload.id,
    tenantId,
    eventType: payload.type,
    mpPaymentId: payload.data.id,
  })

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
    return validatedJson(
      webhookResponseSchema,
      { ok: true, ignored: payload.type },
      'POST /api/webhooks/mercadopago',
    )
  }

  // `source=saas` lo pone TurnoGol al crear el preapproval / la preferencia de
  // proraeo (billing.service.computeNotificationUrl): marca que el pago vive en
  // la cuenta MASTER y no en el MP del complejo. Se normaliza a un literal para
  // no propagar texto arbitrario de la query al job.
  const source = url.searchParams.get('source') === 'saas' ? ('saas' as const) : undefined

  const job: MpWebhookJob = {
    tenantId,
    mpEventId: payload.id,
    eventType: payload.type,
    mpPaymentId: payload.data.id,
    rawPayload: payload,
    ...(source ? { source } : {}),
  }

  try {
    await withSpan('mp.webhook.process', 'webhook.mp', async () => {
      if (MP_MOCK_ENABLED) {
        await handleMpWebhookJob(job) // process inline → deterministic for E2E
      } else {
        const boss = await getBoss()
        await boss.send(QUEUE_PROCESS_MP_WEBHOOK, job, MP_WEBHOOK_SEND_OPTIONS)
      }
    })
  } catch (err) {
    // Enqueue/processing failure → MP will retry. Return 5xx so MP doesn't mark delivered.
    logger.error('webhook processing failed', { module: 'mp-webhook', error: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: 'enqueue failed' }, { status: 500 })
  }

  return validatedJson(webhookResponseSchema, { ok: true }, 'POST /api/webhooks/mercadopago')
}
