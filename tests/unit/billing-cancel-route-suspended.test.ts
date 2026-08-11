import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Fix 3 (R2 🟡): /api/billing/cancel usaba `withTenant`, que bloquea con 403
// TODO método no-GET para tenants `suspended` (READ_ONLY_TENANT_STATUSES en
// with-tenant.ts) — pero `CancelSubscriptionSection.tsx` SÍ ofrece el botón
// de baja para `suspended` (junto con active/past_due, ver `CANCELABLE`). El
// dueño moroso suspendido no podía ni siquiera darse de baja. Fix: la ruta
// pasa a `withBillingTenant` (mismo patrón ya usado por
// `/api/billing/reactivate`, que R2 verificó que NO sufre este 403).

vi.mock('next/headers', () => ({
  cookies: () => ({ get: () => undefined, set: () => {} }),
}))
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, cache: actual.cache ?? (<T>(fn: T): T => fn) }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/modules/staff/staff.service', () => ({ getStaffRole: vi.fn() }))
vi.mock('@/shared/rate-limit/route-guard', () => ({ guard: vi.fn().mockResolvedValue(null) }))
vi.mock('@/modules/billing/billing.gateway', () => ({ getBillingGateway: vi.fn() }))
vi.mock('@/modules/billing/billing.service', () => ({ cancel: vi.fn() }))

const h = vi.hoisted(() => ({ getSql: vi.fn(), withTenantContext: vi.fn() }))
vi.mock('@/shared/db/client', () => ({
  getSql: h.getSql,
  withTenantContext: h.withTenantContext,
}))

import { createClient } from '@/lib/supabase/server'
import { getStaffRole } from '@/modules/staff/staff.service'
import { cancel } from '@/modules/billing/billing.service'
import { POST } from '@/app/api/billing/cancel/route'

const mockCreateClient = vi.mocked(createClient)
const mockCancel = vi.mocked(cancel)

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
  return new NextRequest('http://localhost/api/billing/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Muy caro' }),
  })
}

function mockTenantStatus(status: string) {
  h.getSql.mockReturnValue(vi.fn().mockResolvedValue([{ status }]))
}

beforeEach(() => {
  vi.clearAllMocks()
  setSupabaseUser()
  vi.mocked(getStaffRole).mockResolvedValue('admin')
  h.withTenantContext.mockImplementation((async (
    _id: string,
    cb: (tx: never) => Promise<unknown>,
  ) => cb({} as never)) as never)
  mockCancel.mockResolvedValue({ accessUntil: new Date('2027-01-01T00:00:00Z') })
})

describe('POST /api/billing/cancel — estados cancelables no dan 403 (Fix 3, R2 🟡)', () => {
  it.each(['active', 'past_due', 'suspended'])(
    'tenant %s: llega al service, NO 403',
    async (status) => {
      mockTenantStatus(status)
      const res = await POST(makeRequest())
      expect(res.status).toBe(200)
      expect(mockCancel).toHaveBeenCalledTimes(1)
    },
  )

  it('deleted sigue bloqueado (mismo comportamiento que /api/billing/reactivate)', async () => {
    mockTenantStatus('deleted')
    const res = await POST(makeRequest())
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('TENANT_DELETED')
    expect(mockCancel).not.toHaveBeenCalled()
  })
})
