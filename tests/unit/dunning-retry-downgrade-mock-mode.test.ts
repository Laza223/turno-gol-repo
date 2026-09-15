import { beforeEach, describe, expect, it, vi } from 'vitest'

// `getBillingGateway()` NO honra MP_MOCK_ENABLED (mismo guard que
// reconcile-subscriptions.worker.ts) — en modo mock, el downgrade se aplica
// igual en la DB pero jamás se pega contra MP.

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
  MP_MOCK_ENABLED: true,
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
import { insertSystemAuditLog } from '@/shared/db/audit'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('runDunningSweep — MP_MOCK_ENABLED', () => {
  it('con mp_subscription_id presente: aplica el downgrade local (audit) y NO llama a MP', async () => {
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
    ])

    await runDunningSweep()

    expect(insertSystemAuditLog).toHaveBeenCalledTimes(1)
    expect(updatePreapprovalAmount).not.toHaveBeenCalled()
  })
})
