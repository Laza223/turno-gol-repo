import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildImpersonationCookie } from '@/modules/auth/impersonation'

const TENANT_ID = '11111111-1111-4111-8111-111111111111'
const SYSTEM_ADMIN_ID = '22222222-2222-4222-8222-222222222222'
const STAFF_ID = '99999999-9999-4999-8999-999999999999'

const cookieStore = { get: vi.fn() }
// audit.ts hace `await import('next/headers')` (import dinámico): vi.mock lo
// intercepta igual que un import estático.
vi.mock('next/headers', () => ({ cookies: () => cookieStore }))

function makeTx() {
  const values = vi.fn()
  const insert = vi.fn(() => ({ values }))
  return { tx: { insert } as unknown as import('@/shared/db/client').DbTx, values }
}

const BASE_ENTRY = {
  tenantId: TENANT_ID,
  actorId: STAFF_ID,
  actorType: 'staff' as const,
  action: 'booking.created',
  resourceType: 'booking',
  resourceId: 'b-1',
  metadata: { foo: 'bar' },
}

beforeEach(() => {
  process.env.PIN_COOKIE_SECRET = 'test-secret-at-least-16-chars-long'
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('insertAuditLog — forzado de actor por impersonación (spec §6)', () => {
  it('con cookie válida: fuerza actor_type=system, actor_id=systemAdminId, metadata.impersonated_tenant_id', async () => {
    cookieStore.get.mockReturnValue({
      value: buildImpersonationCookie({ tenantId: TENANT_ID, systemAdminId: SYSTEM_ADMIN_ID }),
    })
    const { insertAuditLog } = await import('@/shared/db/audit')
    const { tx, values } = makeTx()

    await insertAuditLog(tx, BASE_ENTRY)

    expect(values).toHaveBeenCalledTimes(1)
    const row = values.mock.calls[0][0]
    expect(row.actorType).toBe('system')
    expect(row.actorId).toBe(SYSTEM_ADMIN_ID) // NO el staff real
    expect(row.metadata).toMatchObject({ foo: 'bar', impersonated_tenant_id: TENANT_ID })
    // El resto del evento se preserva.
    expect(row.action).toBe('booking.created')
    expect(row.tenantId).toBe(TENANT_ID)
  })

  it('sin cookie: pasa el actor original sin tocar', async () => {
    cookieStore.get.mockReturnValue(undefined)
    const { insertAuditLog } = await import('@/shared/db/audit')
    const { tx, values } = makeTx()

    await insertAuditLog(tx, BASE_ENTRY)

    const row = values.mock.calls[0][0]
    expect(row.actorType).toBe('staff')
    expect(row.actorId).toBe(STAFF_ID)
    expect(row.metadata).toEqual({ foo: 'bar' })
  })

  it('cookie con firma inválida: no fuerza nada (cae al actor original)', async () => {
    cookieStore.get.mockReturnValue({ value: 'tampered.signature' })
    const { insertAuditLog } = await import('@/shared/db/audit')
    const { tx, values } = makeTx()

    await insertAuditLog(tx, BASE_ENTRY)

    const row = values.mock.calls[0][0]
    expect(row.actorType).toBe('staff')
    expect(row.actorId).toBe(STAFF_ID)
  })

  it('contexto sin request (cookies() lanza, p. ej. worker): no fuerza, no rompe', async () => {
    cookieStore.get.mockImplementation(() => {
      throw new Error('cookies was called outside a request scope')
    })
    const { insertAuditLog } = await import('@/shared/db/audit')
    const { tx, values } = makeTx()

    await insertAuditLog(tx, BASE_ENTRY)

    const row = values.mock.calls[0][0]
    expect(row.actorType).toBe('staff')
    expect(row.actorId).toBe(STAFF_ID)
  })
})
