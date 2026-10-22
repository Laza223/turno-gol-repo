import { beforeEach, describe, expect, it, vi } from 'vitest'

// `markMpDisconnected`: el push sale una sola vez, DESPUÉS del commit, y solo
// si esta llamada hizo la transición. El compare-and-set contra Postgres real
// está en `tests/integration/mp-disconnected-mark.test.ts`; acá se cuida el
// orden con el push. Spec:
// `docs/superpowers/specs/2026-10-22-aviso-mp-desconectado-design.md`.

const h = vi.hoisted(() => ({
  withTenantContext: vi.fn(),
  insertSystemAuditLog: vi.fn(),
  notifyAdminPush: vi.fn(),
  captureException: vi.fn(),
  /** Filas que devuelve el UPDATE: vacío = el CAS no pasó. */
  updatedRows: [] as Array<{ id: string }>,
  updateAt: 0,
  committed: false,
}))

vi.mock('@/shared/db/client', () => ({ withTenantContext: h.withTenantContext }))
vi.mock('@/shared/db/audit', () => ({ insertSystemAuditLog: h.insertSystemAuditLog }))
vi.mock('@/modules/notifications/push.service', () => ({ notifyAdminPush: h.notifyAdminPush }))
vi.mock('@/lib/sentry', () => ({ captureException: h.captureException }))
vi.mock('@/shared/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

import { markMpDisconnected } from '@/modules/payments/mp-connection.service'

const tx = {
  update: () => ({
    set: () => ({
      where: () => ({
        returning: async () => {
          h.updateAt = Date.now()
          return h.updatedRows
        },
      }),
    }),
  }),
}

const input = {
  tenantId: 'tenant-1',
  usedRefreshToken: 'encrypted-refresh',
  detectedBy: 'webhook' as const,
  mpError: 'invalid_grant' as const,
}

beforeEach(() => {
  vi.clearAllMocks()
  h.updatedRows = [{ id: 'tenant-1' }]
  h.committed = false
  h.withTenantContext.mockImplementation(async (_id: string, cb: (t: unknown) => unknown) => {
    const result = await cb(tx)
    h.committed = true
    return result
  })
  h.notifyAdminPush.mockImplementation(async () => {
    // El push nunca sale con la tx abierta.
    expect(h.committed).toBe(true)
    return 1
  })
})

describe('markMpDisconnected', () => {
  it('con la transición hecha: audita en la tx y manda UN push después del commit', async () => {
    await expect(markMpDisconnected(input)).resolves.toBe(true)

    expect(h.insertSystemAuditLog).toHaveBeenCalledTimes(1)
    expect(h.notifyAdminPush).toHaveBeenCalledTimes(1)
    expect(h.notifyAdminPush).toHaveBeenCalledWith('tenant-1', {
      type: 'mp_disconnected',
      url: '/dashboard',
      disconnectedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    })
  })

  it('si el CAS no pasa (ya marcado o token rotado): ni audit ni push', async () => {
    h.updatedRows = []

    await expect(markMpDisconnected(input)).resolves.toBe(false)

    expect(h.insertSystemAuditLog).not.toHaveBeenCalled()
    expect(h.notifyAdminPush).not.toHaveBeenCalled()
  })

  it('espera antes del CAS, para que un refresh concurrente que ganó llegue a persistir', async () => {
    const start = Date.now()
    await markMpDisconnected(input)
    expect(h.updateAt - start).toBeGreaterThanOrEqual(900)
  })

  it('si falla la tx no tira (corre en un camino de error) y no manda push', async () => {
    h.withTenantContext.mockRejectedValue(new Error('connection reset'))

    await expect(markMpDisconnected(input)).resolves.toBe(false)

    expect(h.captureException).toHaveBeenCalledTimes(1)
    expect(h.notifyAdminPush).not.toHaveBeenCalled()
  })

  it('si falla el push, la marca igual quedó', async () => {
    h.notifyAdminPush.mockRejectedValue(new Error('pg-boss caído'))

    await expect(markMpDisconnected(input)).resolves.toBe(true)
  })
})
