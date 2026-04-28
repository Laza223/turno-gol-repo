import { type NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { tenants } from '@/shared/db/schema'
import { getDb, withTenantContext } from '@/shared/db/client'
import { MercadoPagoGateway } from '@/modules/payments/mp-gateway.implementation'
import { processWebhook } from '@/modules/payments/payment.service'
import { webhookPayloadSchema } from '@/modules/payments/payment.schema'
import {
  TenantMpNotConnectedError,
  WebhookSignatureError,
} from '@/modules/payments/payment.errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * MP IPN/webhook endpoint.
 *
 * Tenant resolution: the `notification_url` set when creating the preference
 * carries `?tenant=<tenantId>` so we know which OAuth credentials to load.
 *
 * Signature verification: MP v2 sends `x-signature` header with HMAC-SHA256
 * of `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` using the per-tenant
 * webhook secret (configured at MP dashboard) — for v1 we use a single global
 * `MP_WEBHOOK_SECRET` env. The header format is `ts=<ts>,v1=<hash>`.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url)
  const tenantId = url.searchParams.get('tenant')
  if (!tenantId) {
    return NextResponse.json({ error: 'missing tenant' }, { status: 400 })
  }

  const rawBody = await req.text()

  try {
    verifySignature(req, rawBody)
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
    }
    throw err
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const validation = webhookPayloadSchema.safeParse(parsed)
  if (!validation.success) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
  }
  const payload = validation.data

  // Only `payment` events have actionable side effects in v1.
  // (Subscription events handled in billing module — out of scope for P8.)
  if (payload.type !== 'payment') {
    return NextResponse.json({ ok: true, ignored: payload.type })
  }

  const db = getDb()
  const tenantRows = await db
    .select({
      id: tenants.id,
      mpAccessToken: tenants.mpAccessToken,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)

  const tenant = tenantRows[0]
  if (!tenant) {
    return NextResponse.json({ error: 'tenant not found' }, { status: 404 })
  }
  if (!tenant.mpAccessToken) {
    throw new TenantMpNotConnectedError(tenantId)
  }

  const gateway = new MercadoPagoGateway(tenant.mpAccessToken)

  try {
    const outcome = await withTenantContext(tenantId, async (tx) => {
      return processWebhook(
        {
          mpEventId: payload.id,
          eventType: payload.type,
          mpPaymentId: payload.data.id,
          rawPayload: payload,
        },
        tenantId,
        gateway,
        tx,
      )
    })
    return NextResponse.json({ ok: true, ...outcome })
  } catch (err) {
    // Internal error → 500 so MP retries (pg-boss-style retry will be wired
    // when the worker pipeline lands; for now MP's own retry handles it).
    console.error('[mp-webhook]', err)
    return NextResponse.json({ error: 'processing failed' }, { status: 500 })
  }
}

function verifySignature(req: NextRequest, _rawBody: string): void {
  const secret = process.env.MP_WEBHOOK_SECRET
  // In dev/test, signature verification is opt-in.
  if (!secret) return

  const sigHeader = req.headers.get('x-signature')
  const requestId = req.headers.get('x-request-id') ?? ''
  if (!sigHeader) throw new WebhookSignatureError()

  // x-signature: "ts=<ts>,v1=<hash>"
  const parts = Object.fromEntries(
    sigHeader.split(',').map((p) => {
      const [k, v] = p.split('=')
      return [k?.trim() ?? '', v?.trim() ?? '']
    }),
  )
  const ts = parts['ts']
  const v1 = parts['v1']
  if (!ts || !v1) throw new WebhookSignatureError()

  const url = new URL(req.url)
  const dataId = url.searchParams.get('data.id') ?? ''
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`

  const expected = createHmac('sha256', secret).update(manifest).digest('hex')
  const a = Buffer.from(v1)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new WebhookSignatureError()
  }
}
