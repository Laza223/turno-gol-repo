/**
 * Planes privados (migr. 083): el catálogo y `loadPlan` filtran por complejo.
 *
 * `plans` es una tabla GLOBAL y **sin RLS**, así que acá no hay red debajo: si
 * el `owner_tenant_id` se cae de una de estas dos consultas, el plan privado de
 * un complejo aparece en la pantalla de facturación de cualquier otro, y peor,
 * cualquiera puede contratarlo pasando su id. No hay policy que lo ataje.
 *
 * Estos tests miran el SQL que se emite, no el resultado — es lo que se puede
 * verificar sin Postgres. El comportamiento real (que un tenant ajeno reciba
 * cero filas) lo cubre `tests/integration/billing-private-plans.test.ts`, que
 * corre en CI contra una base de verdad. Los dos hacen falta: este atrapa el
 * filtro borrado en el commit que lo borra, aunque nadie levante Docker.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

vi.mock('@/shared/db/audit', () => ({ insertSystemAuditLog: vi.fn() }))

import { listActivePlans, reactivate } from '@/modules/billing/billing.service'
import { MockGateway } from '@/modules/payments/mp-gateway.mock'
import type { DbTx } from '@/shared/db/client'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const AJENO = '99999999-9999-4999-8999-999999999999'
const PLAN_ID = '22222222-2222-4222-8222-222222222222'

const dialect = new PgDialect()

/** El SQL de cada `tx.execute`, ya resuelto a texto + parámetros. */
function queriesDe(tx: DbTx) {
  return vi.mocked(tx.execute).mock.calls.map(([q]) => dialect.sqlToQuery(q as SQL))
}

const PLAN_ROW = {
  id: PLAN_ID,
  slug: 'prueba-interna',
  name: 'Prueba interna — NO OFRECER',
  max_courts: 3,
  price_monthly: 10_000,
  price_annual: 96_000,
}

const SUB_ROW = {
  status: 'canceled',
  plan_id: 'plan-old',
  billing_cycle: 'monthly',
  current_period_start: '2027-01-01T00:00:00Z',
  current_period_end: '2027-02-01T00:00:00Z',
  mp_subscription_id: null,
  mp_payer_email: null,
  pending_plan_change: null,
  pending_change_at: null,
  canceled_at: null,
  cancellation_reason: null,
  scheduled_deletion_at: null,
  dunning_started_at: null,
  last_payment_failed_at: null,
  last_payment_at: null,
}

/**
 * `tx` que devuelve la fila que corresponda según qué tabla se consulte. No
 * simula el WHERE — de eso justamente se trata el test: se mira el SQL que sale.
 */
function makeTx(): DbTx {
  const execute = vi.fn(async (q: unknown) => {
    const texto = dialect.sqlToQuery(q as SQL).sql
    if (texto.includes('FROM plans')) return [PLAN_ROW]
    if (texto.includes('FROM tenant_subscriptions')) return [SUB_ROW]
    if (texto.includes('FROM tenants')) {
      return [{ tenantName: 'Complejo Elite', ownerName: 'Lazar', ownerEmail: 'a@b.com' }]
    }
    return []
  })
  return { execute } as unknown as DbTx
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('planes privados — el catálogo del complejo', () => {
  it('filtra por `owner_tenant_id`, con el complejo como parámetro', async () => {
    const tx = makeTx()

    await listActivePlans(TENANT_ID, tx)

    const q = queriesDe(tx).find((x) => x.sql.includes('FROM plans'))
    expect(q, 'listActivePlans no consultó plans').toBeDefined()
    // El filtro completo: público (NULL) o del complejo. Sin el `IS NULL` se
    // romperían los tres planes reales; sin el `=` se filtra el privado a todos.
    expect(q?.sql).toContain('owner_tenant_id IS NULL')
    expect(q?.sql).toContain('owner_tenant_id =')
    expect(q?.params).toContain(TENANT_ID)
  })

  it('sigue exigiendo `is_active`: la columna nueva no lo reemplaza', async () => {
    // Son dos conceptos distintos a propósito — interruptor de encendido vs.
    // alcance de visibilidad. Confundirlos rompe el apagado global de un plan.
    const tx = makeTx()

    await listActivePlans(TENANT_ID, tx)

    const q = queriesDe(tx).find((x) => x.sql.includes('FROM plans'))
    expect(q?.sql).toContain('is_active = true')
  })
})

describe('planes privados — `loadPlan` en un camino de plata', () => {
  it('reactivate acota el plan al complejo que reactiva', async () => {
    // `reactivate` es el camino que HOY falla con PlanNotFoundError sobre un
    // plan apagado; es el que la migración viene a destrabar, así que sirve de
    // sonda para `loadPlan` sin tener que exportarla.
    const tx = makeTx()

    await reactivate(TENANT_ID, PLAN_ID, 'monthly', new MockGateway(), tx)

    const q = queriesDe(tx).find((x) => x.sql.includes('FROM plans'))
    expect(q, 'reactivate no cargó el plan').toBeDefined()
    expect(q?.sql).toContain('owner_tenant_id IS NULL')
    expect(q?.params).toContain(TENANT_ID)
    // Lo que NO puede pasar: que el scope venga de otro lado que el tenant real.
    expect(q?.params).not.toContain(AJENO)
  })
})
