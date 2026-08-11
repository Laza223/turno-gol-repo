import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeSql, getSql, withTenantContext } from '@/shared/db/client'
import { lockMpEvent } from '@/modules/payments/payment.service'
import { onPaymentRejected } from '@/modules/billing/dunning.service'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'

// Regresión de la clase "jsonb double-encode en INSERT crudo": `processed_webhooks.payload`
// debe quedar como jsonb OBJETO (consultable por `->>`), no como jsonb STRING
// (lo que dejaba `${JSON.stringify(rawPayload)}::jsonb`). Cubre los dos escritores:
// payment.service.lockMpEvent y dunning.service.lockWebhook (vía onPaymentRejected).

let tenant: { id: string }

beforeAll(async () => {
  const s = getSql()
  await ensureRoles(s)
  await cleanupAll(s)
  await s`DELETE FROM processed_webhooks WHERE mp_event_id LIKE 'jsonbtest-%'`
  tenant = await createTestTenant(s)
}, 30_000)

afterAll(async () => {
  const s = getSql()
  await s`DELETE FROM processed_webhooks WHERE mp_event_id LIKE 'jsonbtest-%'`
  await closeSql()
})

async function typeAndField(mpEventId: string): Promise<{ typ: string; field: string | null }> {
  const s = getSql()
  const rows = await s<{ typ: string; field: string | null }[]>`
    SELECT jsonb_typeof(payload) AS typ, payload->>'marker' AS field
    FROM processed_webhooks WHERE mp_event_id = ${mpEventId}
  `
  return rows[0]!
}

describe('processed_webhooks.payload — jsonb object, no double-encode', () => {
  it('lockMpEvent (payments) guarda payload como jsonb object consultable', async () => {
    const mpEventId = 'jsonbtest-payments-1'
    await withTenantContext(tenant.id, (tx) =>
      lockMpEvent(
        {
          mpEventId,
          eventType: 'payment',
          mpPaymentId: 'p-1',
          rawPayload: { marker: 'pay', data: { id: 'x' } },
        },
        tx,
      ),
    )
    expect(await typeAndField(mpEventId)).toEqual({ typ: 'object', field: 'pay' })
  })

  it('onPaymentRejected (dunning) guarda payload como jsonb object consultable', async () => {
    const mpEventId = 'jsonbtest-dunning-1'
    // Sin fila de suscripción para este tenant → onPaymentRejected inserta el
    // lock de idempotencia (payload) y retorna en loadSub null: aísla el escritor.
    await withTenantContext(tenant.id, (tx) =>
      onPaymentRejected(
        tenant.id,
        mpEventId,
        'subscription',
        { marker: 'rej', foo: 1 },
        new Date(),
        tx,
      ),
    )
    expect(await typeAndField(mpEventId)).toEqual({ typ: 'object', field: 'rej' })
  })
})
