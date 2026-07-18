import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// ENS-20: withBillingTenant es el middleware de /api/billing/reactivate. Antes
// 403-eaba `blocked` explícitamente (aun cuando billing.service.reactivate()
// lo necesitaba habilitado) — el botón de "pagar ahora" de /reactivar nunca
// hubiera llegado al service layer para un tenant blocked. Solo `deleted`
// (datos ya eliminados) debe seguir bloqueado acá.

vi.mock('next/headers', () => ({
  cookies: () => ({ get: () => undefined, set: () => {} }),
}))
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, cache: actual.cache ?? (<T,>(fn: T): T => fn) }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/modules/staff/staff.service', () => ({ getStaffRole: vi.fn() }))

const h = vi.hoisted(() => ({ getSql: vi.fn(), withTenantContext: vi.fn() }))
vi.mock('@/shared/db/client', () => ({
  getSql: h.getSql,
  withTenantContext: h.withTenantContext,
}))

import { createClient } from '@/lib/supabase/server'
import { getStaffRole } from '@/modules/staff/staff.service'
import { withBillingTenant } from '@/shared/middleware/with-tenant'

const mockCreateClient = vi.mocked(createClient)

function setSupabaseUser(): void {
  mockCreateClient.mockReturnValue({
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: 'staff-1',
            email: 'a@b.com',
            app_metadata: { tenant_id: 't-1', staff_user_id: 'staff-1' },
          },
        },
        error: null,
      }),
    },
  } as unknown as ReturnType<typeof createClient>)
}

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/billing/reactivate', { method: 'POST' })
}

function mockTenantStatus(status: string) {
  h.getSql.mockReturnValue(vi.fn().mockResolvedValue([{ status }]))
}

beforeEach(() => {
  vi.clearAllMocks()
  setSupabaseUser()
  vi.mocked(getStaffRole).mockResolvedValue('admin')
  h.withTenantContext.mockImplementation(
    (async (_id: string, cb: (tx: never) => Promise<unknown>) => cb({} as never)) as never,
  )
})

describe('withBillingTenant — estados de recovery (ENS-20)', () => {
  it.each(['canceled', 'churned', 'blocked', 'suspended', 'past_due', 'active', 'trialing'])(
    'deja pasar %s',
    async (status) => {
      mockTenantStatus(status)
      const handler = withBillingTenant(async () => NextResponse.json({ ok: true }))
      const res = await handler(makeRequest())
      expect(res.status).toBe(200)
    },
  )

  it('bloquea deleted → 403 TENANT_DELETED', async () => {
    mockTenantStatus('deleted')
    const handler = withBillingTenant(async () => NextResponse.json({ ok: true }))
    const res = await handler(makeRequest())
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('TENANT_DELETED')
  })
})
