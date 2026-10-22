import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Sql } from 'postgres'
import { closeSql, getSql } from '@/shared/db/client'
import {
  resetEmailProvider,
  setEmailProvider,
  type EmailProvider,
} from '@/modules/notifications/email.provider'
import { cleanupAll, createTestSystemAdmin, createTestTenant, ensureRoles } from '../helpers/tenant'
import { getOrCreatePlanId, insertCourt, insertSubscription } from '../helpers/factories'

/**
 * Canchas prendidas por encima de lo facturado, contra DB real
 * (`docs/decisions/2026-10-22-cancha-en-mora.md`).
 *
 * Lo que se prueba acá es la condición, que vive en el SQL del worker: qué
 * estados mira, qué cuenta como cancha prendida, cuándo un cambio agendado ya
 * lo cubre y el dedup de 20 h sobre `audit_logs`. El cableado fino (Sentry, que
 * un fallo no frene a los demás) está en
 * `tests/unit/reconcile-subscriptions-worker.test.ts`.
 */

// Las suscripciones de acá no tienen preapproval, así que ningún barrido que le
// pregunta a MP las levanta. Si alguno llegara a MP, el test lo canta.
vi.mock('@/modules/billing/billing.gateway', () => ({
  getBillingGateway: () => ({
    getSubscriptionState: async () => {
      throw new Error('el chequeo de canchas no debería consultar a MP')
    },
    searchPaymentsByReference: async () => [],
  }),
}))

import { reconcileSubscriptions } from '@/shared/jobs/workers/reconcile-subscriptions.worker'

type Sent = Parameters<EmailProvider['send']>[0]

let sent: Sent[]
let adminEmail: string

async function seedComplejo(
  sql: Sql,
  opts: {
    status: 'trialing' | 'active' | 'past_due'
    billedCourts: number
    online: number
    offline?: number
  },
): Promise<{ id: string; name: string }> {
  const tenant = await createTestTenant(sql)
  await insertSubscription(sql, {
    tenantId: tenant.id,
    planId: await getOrCreatePlanId(sql),
    status: opts.status === 'past_due' ? 'active' : opts.status,
    billedCourts: opts.billedCourts,
  })
  if (opts.status === 'past_due') {
    await sql`
      UPDATE tenant_subscriptions SET status = 'past_due' WHERE tenant_id = ${tenant.id}
    `
  }
  for (let i = 0; i < opts.online; i += 1) await insertCourt(sql, tenant.id)
  for (let i = 0; i < (opts.offline ?? 0); i += 1) {
    const courtId = await insertCourt(sql, tenant.id)
    await sql`UPDATE courts SET status = 'offline' WHERE id = ${courtId}`
  }
  return { id: tenant.id, name: tenant.name }
}

/** `audit_logs` leído cross-tenant a propósito: el assert es "cuántas alertas hubo en total". */
async function alertas(
  sql: Sql,
): Promise<Array<{ tenantId: string; metadata: Record<string, unknown> }>> {
  return sql<Array<{ tenantId: string; metadata: Record<string, unknown> }>>`
    SELECT tenant_id AS "tenantId", metadata
    FROM audit_logs
    WHERE action = 'subscription.courts_over_billed'
    ORDER BY created_at
  `
}

/** `ops_alerts` es deny-all para la app: se lee con el pool de los tests. */
async function opsKeys(sql: Sql): Promise<string[]> {
  const rows = await sql<{ key: string }[]>`SELECT key FROM ops_alerts ORDER BY key`
  return rows.map((r) => r.key)
}

async function billedCourtsOf(sql: Sql, tenantId: string): Promise<number> {
  const rows = await sql<{ billedCourts: number }[]>`
    SELECT billed_courts AS "billedCourts" FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
  `
  return rows[0]!.billedCourts
}

beforeAll(async () => {
  await ensureRoles(getSql())
}, 30_000)

beforeEach(async () => {
  const sql = getSql()
  await cleanupAll(sql)
  adminEmail = (await createTestSystemAdmin(sql)).email
  sent = []
  setEmailProvider({
    send: async (params) => {
      sent.push(params)
    },
  })
}, 30_000)

afterEach(() => {
  resetEmailProvider()
})

afterAll(async () => {
  await closeSql()
})

describe('reconcile-subscriptions — canchas por encima de lo facturado (DB real)', () => {
  it('avisa a ops cuando un complejo al día opera más canchas de las que paga, sin tocar nada', async () => {
    const sql = getSql()
    const complejo = await seedComplejo(sql, { status: 'active', billedCourts: 2, online: 3 })

    await reconcileSubscriptions()

    expect(await alertas(sql)).toEqual([
      { tenantId: complejo.id, metadata: { billedCourts: 2, onlineCourts: 3 } },
    ])
    expect(sent).toHaveLength(1)
    expect(sent[0]?.to).toBe(adminEmail)
    expect(sent[0]?.subject).toContain(complejo.name)
    expect(sent[0]?.text).toContain(`/super-admin/tenants/${complejo.id}`)
    const keys = await opsKeys(sql)
    expect(keys).toHaveLength(1)
    expect(keys[0]).toMatch(
      new RegExp(`^courts-over-billed:${complejo.id}:\\d{4}-\\d{2}-\\d{2}T\\d{2}$`),
    )
    // Solo avisa: la cuota la decide el dueño.
    expect(await billedCourtsOf(sql, complejo.id)).toBe(2)
  })

  it('no avisa cuando lo facturado alcanza', async () => {
    const sql = getSql()
    await seedComplejo(sql, { status: 'active', billedCourts: 3, online: 3 })
    await seedComplejo(sql, { status: 'active', billedCourts: 3, online: 2 })

    await reconcileSubscriptions()

    expect(await alertas(sql)).toEqual([])
    expect(sent).toEqual([])
    expect(await opsKeys(sql)).toEqual([])
  })

  it('las canchas apagadas no cuentan', async () => {
    const sql = getSql()
    await seedComplejo(sql, { status: 'active', billedCourts: 2, online: 2, offline: 3 })

    await reconcileSubscriptions()

    expect(await alertas(sql)).toEqual([])
  })

  it('con un cambio de canchas agendado no avisa: dunning-retry lo aplica al cierre del período', async () => {
    const sql = getSql()
    const complejo = await seedComplejo(sql, { status: 'active', billedCourts: 2, online: 3 })
    await sql`
      UPDATE tenant_subscriptions
      SET pending_billed_courts = 3, pending_change_at = current_period_end
      WHERE tenant_id = ${complejo.id}
    `

    await reconcileSubscriptions()

    expect(await alertas(sql)).toEqual([])
  })

  it('solo mira los complejos al día: ni la prueba ni la mora', async () => {
    const sql = getSql()
    await seedComplejo(sql, { status: 'trialing', billedCourts: 1, online: 3 })
    await seedComplejo(sql, { status: 'past_due', billedCourts: 1, online: 3 })

    await reconcileSubscriptions()

    expect(await alertas(sql)).toEqual([])
    expect(sent).toEqual([])
  })

  it('dedup de 20 h: dos corridas seguidas, un solo aviso', async () => {
    const sql = getSql()
    await seedComplejo(sql, { status: 'active', billedCourts: 1, online: 2 })

    await reconcileSubscriptions()
    await reconcileSubscriptions()

    expect(await alertas(sql)).toHaveLength(1)
    expect(sent).toHaveLength(1)
  })

  it('si el mail falla no gasta el dedup: el próximo tick vuelve a avisar', async () => {
    const sql = getSql()
    await seedComplejo(sql, { status: 'active', billedCourts: 1, online: 2 })
    setEmailProvider({
      send: async () => {
        throw new Error('Resend caído')
      },
    })

    await reconcileSubscriptions()

    expect(await alertas(sql)).toEqual([])
    expect(await opsKeys(sql)).toEqual([])

    setEmailProvider({
      send: async (params) => {
        sent.push(params)
      },
    })
    await reconcileSubscriptions()

    expect(await alertas(sql)).toHaveLength(1)
    expect(sent).toHaveLength(1)
  })

  it('un aviso de hace más de 20 h no frena el nuevo', async () => {
    const sql = getSql()
    const complejo = await seedComplejo(sql, { status: 'active', billedCourts: 1, online: 2 })
    await sql`
      INSERT INTO audit_logs (
        tenant_id, actor_id, actor_type, action, resource_type, resource_id, created_at
      ) VALUES (
        ${complejo.id}, ${'00000000-0000-0000-0000-000000000000'}, 'system',
        'subscription.courts_over_billed', 'tenant_subscription', ${complejo.id},
        NOW() - INTERVAL '21 hours'
      )
    `

    await reconcileSubscriptions()

    expect(await alertas(sql)).toHaveLength(2)
    expect(sent).toHaveLength(1)
  })
})
