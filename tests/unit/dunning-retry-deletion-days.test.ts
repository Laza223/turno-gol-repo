import { beforeEach, describe, expect, it, vi } from 'vitest'

// Hallazgo #1 (campaña de mutación, docs/qa/TEST_AUDIT.md): el mail de baja
// armaba `daysRemaining`/`deletionDate` con literales viejos (7 y 67) en vez
// de leer CHURNED_DELETION_DAYS (90) y CANCELED_BLOCKED_DELETION_DAYS (97) de
// lifecycle.service — mientras la MISMA transacción escribía
// scheduled_deletion_at con el valor correcto. Este test verifica que el
// contenido del mail (`enqueueTenantOwnerNotification`) coincide con las
// constantes reales, no con un literal reescrito a mano en el worker.

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

type SqlMock = ReturnType<typeof vi.fn> & ((...args: unknown[]) => Promise<unknown[]>)

function makeSqlMock(results: unknown[][]): SqlMock {
  let call = 0
  return vi.fn(() => {
    const result = results[call] ?? []
    call += 1
    return Promise.resolve(result)
  }) as SqlMock
}

let sqlMock: SqlMock

vi.mock('@/shared/db/client', () => ({
  getWorkerSql: () => sqlMock,
  withTenantContext: vi.fn(async (_id: string, fn: (tx: unknown) => Promise<unknown>) => fn({})),
}))

import { runDunningSweep } from '@/shared/jobs/workers/dunning-retry.worker'
import { enqueueTenantOwnerNotification } from '@/modules/notifications/notification.service'
import {
  CHURNED_DELETION_DAYS,
  CANCELED_BLOCKED_DELETION_DAYS,
} from '@/modules/billing/lifecycle.service'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('runDunningSweep — el mail de baja usa las constantes reales de retención', () => {
  it('blocked→churned: content.daysRemaining coincide con CHURNED_DELETION_DAYS (90)', async () => {
    sqlMock = makeSqlMock([
      [], // pastDueRows
      [], // suspendedRows
      [{ tenant_id: 'tenant-blocked' }], // blockedRows
      [], // canceledRows
      [], // pendingItems
      [{ tenantId: 'tenant-blocked', tenantName: 'Club Norte', ownerName: 'Marcelo' }], // loadTenantOwners
    ])

    await runDunningSweep()

    expect(enqueueTenantOwnerNotification).toHaveBeenCalledTimes(1)
    const [payload] = (enqueueTenantOwnerNotification as ReturnType<typeof vi.fn>).mock
      .calls[0] as [{ templateName: string; content: { daysRemaining: number } }]
    expect(payload.templateName).toBe('tenant_deletion_warning')
    expect(payload.content.daysRemaining).toBe(CHURNED_DELETION_DAYS)
  })

  it('canceled→blocked: content.daysRemaining coincide con CANCELED_BLOCKED_DELETION_DAYS (97)', async () => {
    sqlMock = makeSqlMock([
      [], // pastDueRows
      [], // suspendedRows
      [], // blockedRows
      [{ tenant_id: 'tenant-canceled' }], // canceledRows
      [], // pendingItems
      [{ tenantId: 'tenant-canceled', tenantName: 'Club Sur', ownerName: 'Rodrigo' }], // loadTenantOwners
    ])

    await runDunningSweep()

    expect(enqueueTenantOwnerNotification).toHaveBeenCalledTimes(1)
    const [payload] = (enqueueTenantOwnerNotification as ReturnType<typeof vi.fn>).mock
      .calls[0] as [{ templateName: string; content: { daysRemaining: number } }]
    expect(payload.templateName).toBe('tenant_deletion_warning')
    expect(payload.content.daysRemaining).toBe(CANCELED_BLOCKED_DELETION_DAYS)
  })
})
