import { beforeEach, describe, expect, it, vi } from 'vitest'

// Bug de plata: `runDunningSweep` aplicaba un downgrade pendiente moviendo
// `plan_id` en la DB, pero nunca tocaba el preapproval de MP — el complejo
// seguía pagando el monto del plan VIEJO después de bajar. Este test cubre
// el camino nuevo: tras el UPDATE, si hay `mp_subscription_id`, se llama a
// `getBillingGateway().updatePreapprovalAmount` con `planAmount(planDestino,
// billingCycle)` (mismo patrón "MP último" que `handleUpgradeApproved`).

vi.mock('@/modules/notifications/notification.service', () => ({
  enqueueTenantOwnerNotification: vi.fn(),
}))
vi.mock('@/shared/db/audit', () => ({
  insertSystemAuditLog: vi.fn(),
}))
vi.mock('@/shared/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('@/modules/billing/lifecycle.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/billing/lifecycle.service')>()
  return {
    ...actual,
    transitionPastDueToSuspended: vi.fn(),
    transitionSuspendedToBlocked: vi.fn(),
    transitionBlockedToChurned: vi.fn(),
    transitionCanceledToBlocked: vi.fn(),
  }
})
vi.mock('@/modules/payments/mock-mp', () => ({
  MP_MOCK_ENABLED: false,
}))

const { updatePreapprovalAmount } = vi.hoisted(() => ({ updatePreapprovalAmount: vi.fn() }))
vi.mock('@/modules/billing/billing.gateway', () => ({
  getBillingGateway: () => ({ updatePreapprovalAmount }),
}))

type SqlMock = ReturnType<typeof vi.fn> & ((...args: unknown[]) => Promise<unknown[]>)

function makeSqlMock(results: unknown[][]): SqlMock {
  let call = 0
  return vi.fn(() => {
    const result = results[call] ?? []
    call += 1
    return Promise.resolve(result)
  }) as SqlMock
}

type TxMock = { execute: ReturnType<typeof vi.fn> }

function makeTxMock(results: unknown[][]): TxMock {
  let call = 0
  return {
    execute: vi.fn(() => {
      const result = results[call] ?? []
      call += 1
      return Promise.resolve(result)
    }),
  }
}

let sqlMock: SqlMock
let txMock: TxMock

vi.mock('@/shared/db/client', () => ({
  getWorkerSql: () => sqlMock,
  withTenantContext: (_id: string, fn: (tx: unknown) => Promise<unknown>) => fn(txMock),
}))

import { runDunningSweep } from '@/shared/jobs/workers/dunning-retry.worker'

const PLAN_ROW = {
  id: 'plan-complejo',
  slug: 'complejo',
  name: 'Complejo',
  max_courts: 6,
  price_monthly: 9_900_000,
  price_annual: 7_920_000,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('runDunningSweep — downgrade aplicado actualiza el monto recurrente en MP', () => {
  it('billing_cycle mensual: PUT con price_monthly del plan destino', async () => {
    sqlMock = makeSqlMock([
      [], // pastDueRows
      [], // suspendedRows
      [], // blockedRows
      [], // canceledRows
      [{ tenant_id: 'tenant-1', pendingPlanChange: 'plan-complejo' }], // pendingItems
      [{ tenantId: 'tenant-1', tenantName: 'Club Norte', ownerName: 'Marcelo' }], // loadTenantOwners
    ])
    txMock = makeTxMock([
      [{ mp_subscription_id: 'mp-sub-1', billing_cycle: 'monthly' }], // UPDATE ... RETURNING
      [PLAN_ROW], // SELECT plan destino
    ])

    await runDunningSweep()

    expect(updatePreapprovalAmount).toHaveBeenCalledTimes(1)
    expect(updatePreapprovalAmount).toHaveBeenCalledWith('mp-sub-1', 9_900_000)
  })

  it('billing_cycle anual: PUT con price_annual × 12 del plan destino (NUNCA el equivalente mensual a pelo)', async () => {
    sqlMock = makeSqlMock([
      [],
      [],
      [],
      [],
      [{ tenant_id: 'tenant-1', pendingPlanChange: 'plan-complejo' }],
      [{ tenantId: 'tenant-1', tenantName: 'Club Norte', ownerName: 'Marcelo' }],
    ])
    txMock = makeTxMock([[{ mp_subscription_id: 'mp-sub-1', billing_cycle: 'annual' }], [PLAN_ROW]])

    await runDunningSweep()

    expect(updatePreapprovalAmount).toHaveBeenCalledTimes(1)
    expect(updatePreapprovalAmount).toHaveBeenCalledWith('mp-sub-1', 7_920_000 * 12)
  })

  it('sin mp_subscription_id: aplica el downgrade local y NO llama a MP', async () => {
    sqlMock = makeSqlMock([
      [],
      [],
      [],
      [],
      [{ tenant_id: 'tenant-1', pendingPlanChange: 'plan-complejo' }],
      [{ tenantId: 'tenant-1', tenantName: 'Club Norte', ownerName: 'Marcelo' }],
    ])
    txMock = makeTxMock([[{ mp_subscription_id: null, billing_cycle: 'monthly' }]])

    await runDunningSweep()

    expect(updatePreapprovalAmount).not.toHaveBeenCalled()
  })
})
