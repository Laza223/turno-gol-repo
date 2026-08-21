import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Sql } from 'postgres'
import { closeSql, getSql } from '@/shared/db/client'
import type { GatewaySubscriptionState } from '@/modules/payments/payment.types'
import { cleanupAll, createTestTenant, ensureRoles } from '../helpers/tenant'

/**
 * Idempotencia del reconciliador de suscripciones, contra DB real.
 *
 * El test que carga el diseño entero es "correrlo dos veces deja la misma
 * fila": es la propiedad que justifica escribir el período en ABSOLUTO
 * (`next_payment_date` de MP) en vez de sumarle un ciclo al que ya estaba.
 *
 * El otro test que importa es el del caso real del 2026-08-20: el evento del
 * cobro YA está en `processed_webhooks` y la suscripción sigue en `trialing`.
 * Un reconciliador que reactuara el webhook haría no-op ahí — justo sobre el
 * único caso que había que rescatar.
 */

/** Estado que devuelve "MP" en cada test. Lo setea cada caso. */
let estadoRemoto: GatewaySubscriptionState | null = null
/** Pagos que devuelve la búsqueda por external_reference (clave compartida). */
let pagosDelComplejo: Array<Record<string, unknown>> = []
/**
 * Gancho para simular una escritura concurrente: corre DESPUÉS de que el worker
 * le preguntó a MP y ANTES de que tome el lock de la fila, que es exactamente
 * la ventana donde un `reactivate()`/`cancel()` se mete.
 */
let alConsultarMp: (() => Promise<void>) | null = null

vi.mock('@/modules/billing/billing.gateway', () => ({
  getBillingGateway: () => ({
    getSubscriptionState: async () => {
      if (alConsultarMp) {
        const hook = alConsultarMp
        alConsultarMp = null
        await hook()
      }
      return estadoRemoto
    },
    searchPaymentsByReference: async () => pagosDelComplejo,
  }),
}))

import { reconcileSubscriptions } from '@/shared/jobs/workers/reconcile-subscriptions.worker'

const PREAPPROVAL = '275616150bef48aa85d502d9b490a359'
/** Id real del pago del cobro del 2026-08-20. */
const MP_PAYMENT_ID = '173833098759'

// Instantes explícitos, nunca CURRENT_DATE ni `new Date()`: un test de fechas
// que dependa del reloj se cae solo en la ventana 21-24 ART.
const COBRO = new Date('2026-08-20T14:49:04.486Z')
const PROXIMO_COBRO = new Date('2026-09-20T14:47:30.000Z')

async function loadPredioPlanId(sql: Sql): Promise<string> {
  const rows = await sql<{ id: string }[]>`SELECT id FROM plans WHERE slug = 'predio' LIMIT 1`
  return rows[0]!.id
}

async function seedSubscription(
  sql: Sql,
  opts: { status: string; lastPaymentAt?: Date | null } = { status: 'trialing' },
): Promise<string> {
  const tenant = await createTestTenant(sql)
  const planId = await loadPredioPlanId(sql)
  await sql`
    UPDATE tenants SET status = ${opts.status}::tenant_status WHERE id = ${tenant.id}
  `
  await sql`
    INSERT INTO tenant_subscriptions (
      tenant_id, plan_id, billing_cycle, status,
      current_period_start, current_period_end, mp_subscription_id, last_payment_at
    ) VALUES (
      ${tenant.id},
      ${planId},
      'monthly'::billing_cycle,
      ${opts.status}::subscription_status,
      ${'2026-08-01T00:00:00Z'}::timestamptz,
      ${'2026-09-18T00:00:00Z'}::timestamptz,
      ${PREAPPROVAL},
      ${opts.lastPaymentAt ? opts.lastPaymentAt.toISOString() : null}::timestamptz
    )
  `
  return tenant.id
}

type SubRow = {
  status: string
  current_period_end: Date
  last_payment_at: Date | null
  updated_at: Date
}

async function readSub(sql: Sql, tenantId: string): Promise<SubRow> {
  const rows = await sql<SubRow[]>`
    SELECT status, current_period_end, last_payment_at, updated_at
    FROM tenant_subscriptions WHERE tenant_id = ${tenantId}
  `
  return rows[0]!
}

function estadoAuthorizedConUnCobro(): GatewaySubscriptionState {
  return {
    preapprovalId: PREAPPROVAL,
    status: 'authorized',
    externalReference: '',
    nextPaymentDate: PROXIMO_COBRO,
    chargedQuantity: 1,
    lastChargedDate: COBRO,
    lastChargedAmountCents: 10_000,
  }
}

describe('reconcile-subscriptions (DB real)', () => {
  beforeAll(async () => {
    await ensureRoles()
  })

  afterEach(async () => {
    estadoRemoto = null
    pagosDelComplejo = []
    alConsultarMp = null
    await cleanupAll()
  })

  afterAll(async () => {
    await closeSql()
  })

  it('activa un trialing que MP dice que ya cobró, y reclama la clave del cobro', async () => {
    const sql = getSql()
    const tenantId = await seedSubscription(sql)
    estadoRemoto = { ...estadoAuthorizedConUnCobro(), externalReference: tenantId }
    pagosDelComplejo = [
      { mpPaymentId: MP_PAYMENT_ID, status: 'approved', preapprovalId: PREAPPROVAL },
    ]

    const fixed = await reconcileSubscriptions()

    // La clave compartida con el webhook (D3): sin esta fila, un aviso tardío
    // volvería a extender el período un ciclo más.
    const claves = await sql<{ mp_event_id: string }[]>`
      SELECT mp_event_id FROM processed_webhooks
      WHERE mp_event_id = ${`sub-charge:${MP_PAYMENT_ID}`}
    `
    expect(claves).toHaveLength(1)

    expect(fixed).toBe(1)
    const sub = await readSub(sql, tenantId)
    expect(sub.status).toBe('active')
    expect(new Date(sub.current_period_end).toISOString()).toBe(PROXIMO_COBRO.toISOString())

    const [tenant] = await sql<{ status: string }[]>`
      SELECT status FROM tenants WHERE id = ${tenantId}
    `
    expect(tenant!.status).toBe('active')

    const audits = await sql<{ action: string }[]>`
      SELECT action FROM audit_logs
      WHERE tenant_id = ${tenantId} AND action = 'subscription.reconciled'
    `
    expect(audits).toHaveLength(1)
  })

  it('correrlo dos veces deja EXACTAMENTE la misma fila', async () => {
    const sql = getSql()
    const tenantId = await seedSubscription(sql)
    estadoRemoto = { ...estadoAuthorizedConUnCobro(), externalReference: tenantId }

    await reconcileSubscriptions()
    const primera = await readSub(sql, tenantId)

    const segunda_corrida = await reconcileSubscriptions()
    const segunda = await readSub(sql, tenantId)

    expect(segunda_corrida).toBe(0)
    expect(new Date(segunda.current_period_end).toISOString()).toBe(
      new Date(primera.current_period_end).toISOString(),
    )
    expect(new Date(segunda.updated_at).toISOString()).toBe(
      new Date(primera.updated_at).toISOString(),
    )
  })

  it('no toca la suscripción si el webhook ya aplicó ese cobro', async () => {
    const sql = getSql()
    // `last_payment_at` posterior al `last_charged_date` de MP = ese cobro ya
    // está aplicado. Es el guard de marca de agua.
    const tenantId = await seedSubscription(sql, {
      status: 'past_due',
      lastPaymentAt: new Date('2026-08-20T23:00:00Z'),
    })
    estadoRemoto = { ...estadoAuthorizedConUnCobro(), externalReference: tenantId }
    const antes = await readSub(sql, tenantId)

    const fixed = await reconcileSubscriptions()

    expect(fixed).toBe(0)
    const despues = await readSub(sql, tenantId)
    expect(despues.status).toBe('past_due')
    expect(new Date(despues.updated_at).toISOString()).toBe(new Date(antes.updated_at).toISOString())
  })

  it('rescata el caso real: el evento ya está en processed_webhooks y no aplicó nada', async () => {
    const sql = getSql()
    const tenantId = await seedSubscription(sql)
    estadoRemoto = { ...estadoAuthorizedConUnCobro(), externalReference: tenantId }

    // Exactamente lo que pasó el 2026-08-20: el aviso llegó, se marcó
    // procesado y la suscripción quedó en `trialing`. La clave del webhook es
    // el id de NOTIFICACIÓN de MP, así que un replay no puede rescatarlo.
    await sql`
      INSERT INTO processed_webhooks (mp_event_id, event_type, payload)
      VALUES ('136481525617', 'payment', '{}'::jsonb)
    `

    const fixed = await reconcileSubscriptions()

    expect(fixed).toBe(1)
    expect((await readSub(sql, tenantId)).status).toBe('active')
  })

  it('no vuelve a aplicar un cobro cuya clave ya reclamó el webhook', async () => {
    const sql = getSql()
    const tenantId = await seedSubscription(sql)
    estadoRemoto = { ...estadoAuthorizedConUnCobro(), externalReference: tenantId }
    pagosDelComplejo = [
      { mpPaymentId: MP_PAYMENT_ID, status: 'approved', preapprovalId: PREAPPROVAL },
    ]

    // El webhook aplicó ESTE cobro y dejó su clave. `last_payment_at` sigue en
    // NULL, así que el guard de marca de agua no alcanza: lo que corta es la
    // clave compartida.
    await sql`
      INSERT INTO processed_webhooks (mp_event_id, event_type, payload)
      VALUES (${`sub-charge:${MP_PAYMENT_ID}`}, 'payment:charge', '{}'::jsonb)
    `

    const fixed = await reconcileSubscriptions()

    expect(fixed).toBe(0)
    expect((await readSub(sql, tenantId)).status).toBe('trialing')
  })

  it('rescata un blocked reciente (rescate post-terminal)', async () => {
    const sql = getSql()
    const tenantId = await seedSubscription(sql, { status: 'blocked' })
    estadoRemoto = { ...estadoAuthorizedConUnCobro(), externalReference: tenantId }

    const fixed = await reconcileSubscriptions()

    expect(fixed).toBe(1)
    expect((await readSub(sql, tenantId)).status).toBe('active')
  })

  it('aborta si el preapproval cambió entre la consulta a MP y la escritura', async () => {
    const sql = getSql()
    const tenantId = await seedSubscription(sql)
    estadoRemoto = { ...estadoAuthorizedConUnCobro(), externalReference: tenantId }

    // La carrera: un `reactivate()`/`subscribe()` concurrente pisa el
    // preapproval justo después de que el worker le preguntó a MP. La respuesta
    // que el worker tiene en mano quedó siendo sobre un preapproval que ya no es
    // el vigente, así que no puede aplicarla. El 2026-08-20 hubo 5 `subscribe()`
    // del mismo complejo en un día: la ventana existe.
    alConsultarMp = async () => {
      await sql`
        UPDATE tenant_subscriptions SET mp_subscription_id = ${'preapproval-nuevo'}
        WHERE tenant_id = ${tenantId}
      `
    }

    const fixed = await reconcileSubscriptions()

    expect(fixed).toBe(0)
    expect((await readSub(sql, tenantId)).status).toBe('trialing')
  })

  it('alerta y NO activa cuando MP dice cancelled (los $100 del 2026-08-20)', async () => {
    const sql = getSql()
    const tenantId = await seedSubscription(sql)
    estadoRemoto = {
      ...estadoAuthorizedConUnCobro(),
      externalReference: tenantId,
      status: 'cancelled',
    }

    const fixed = await reconcileSubscriptions()

    expect(fixed).toBe(0)
    expect((await readSub(sql, tenantId)).status).toBe('trialing')
    const audits = await sql<{ action: string }[]>`
      SELECT action FROM audit_logs
      WHERE tenant_id = ${tenantId} AND action = 'subscription.mp_desync'
    `
    expect(audits).toHaveLength(1)
  })
})
