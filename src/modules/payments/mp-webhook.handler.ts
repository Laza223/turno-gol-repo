import { eq } from 'drizzle-orm'
import { tenants } from '@/shared/db/schema'
import { getDb, withTenantContext } from '@/shared/db/client'
import { MercadoPagoGateway } from './mp-gateway.implementation'
import { processWebhook } from './payment.service'
import { TenantMpNotConnectedError } from './payment.errors'

/**
 * Payload for the `process-mp-webhook` queue. The route enqueues this; the
 * worker passes it straight to `handleMpWebhookJob`.
 */
export type MpWebhookJob = {
  tenantId: string
  mpEventId: string
  eventType: string
  mpPaymentId: string
  rawPayload: unknown
}

/**
 * Unit of work for the pg-boss `process-mp-webhook` queue.
 *
 *   1. Resolve tenant + decrypt MP access token (per-tenant OAuth, ADR-004).
 *   2. Open a tenant-scoped tx and call `processWebhook` (Pilar B idempotency
 *      via `processed_webhooks ON CONFLICT DO NOTHING`).
 *
 * Throws on tenant-not-connected or downstream errors; pg-boss retries up to
 * 5 times with backoff (see `MP_WEBHOOK_SEND_OPTIONS`).
 */
export async function handleMpWebhookJob(job: MpWebhookJob): Promise<void> {
  const db = getDb()
  const rows = await db
    .select({
      id: tenants.id,
      mpAccessToken: tenants.mpAccessToken,
    })
    .from(tenants)
    .where(eq(tenants.id, job.tenantId))
    .limit(1)

  const tenant = rows[0]
  if (!tenant?.mpAccessToken) {
    throw new TenantMpNotConnectedError(job.tenantId)
  }

  const gateway = new MercadoPagoGateway(tenant.mpAccessToken)

  await withTenantContext(job.tenantId, async (tx) => {
    await processWebhook(
      {
        mpEventId: job.mpEventId,
        eventType: job.eventType,
        mpPaymentId: job.mpPaymentId,
        rawPayload: job.rawPayload,
      },
      job.tenantId,
      gateway,
      tx,
    )
  })
}
