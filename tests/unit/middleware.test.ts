import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// Mock next/headers cookies (used by Supabase server client + with-pin).
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: () => undefined,
    set: () => {},
  }),
}))

// React.cache existe en el runtime server de Next pero no en el build de react
// que resuelve vitest (node): fallback identidad para poder importar
// auth.middleware real (extractAuthUser está envuelto en cache()).
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, cache: actual.cache ?? (<T,>(fn: T): T => fn) }
})

// Mock Supabase server client to avoid env var requirement.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

// El rol real se lee de tenant_staff_members (getStaffRole), nunca de
// user.role (hardcodeado a 'admin' para todo el staff, ver StaffUser).
vi.mock('@/modules/staff/staff.service', () => ({ getStaffRole: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { withAuth } from '@/shared/middleware/with-auth'
import { withTenant } from '@/shared/middleware/with-tenant'
import { withRole } from '@/shared/middleware/with-role'
import { getStaffRole } from '@/modules/staff/staff.service'
import type { StaffUser } from '@/modules/auth/types'
import type { DbTx } from '@/shared/db/client'

const mockCreateClient = vi.mocked(createClient)

type FakeUserPayload = {
  id: string
  email?: string
  app_metadata?: Record<string, unknown>
  user_metadata?: Record<string, unknown>
} | null

function setSupabaseUser(user: FakeUserPayload): void {
  mockCreateClient.mockReturnValue({
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
  } as unknown as ReturnType<typeof createClient>)
}

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/test')
}

describe('withAuth', () => {
  beforeEach(() => mockCreateClient.mockReset())

  it('returns 401 when no session', async () => {
    setSupabaseUser(null)
    const handler = withAuth(async () => NextResponse.json({ ok: true }))
    const res = await handler(makeRequest())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('AUTH_REQUIRED')
  })

  it('calls handler when session present', async () => {
    setSupabaseUser({
      id: 'user-1',
      email: 'a@b.com',
      app_metadata: { tenant_id: 't1', role: 'admin' },
    })
    const handler = withAuth(async (_req, user) =>
      NextResponse.json({ id: user.id, type: user.type }),
    )
    const res = await handler(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ id: 'user-1', type: 'staff' })
  })
})

describe('withTenant', () => {
  beforeEach(() => mockCreateClient.mockReset())

  it('rejects player → 403 STAFF_REQUIRED', async () => {
    setSupabaseUser({
      id: 'p1',
      email: 'p@x.com',
      app_metadata: { is_player: true, player_id: 'p1' },
    })
    const handler = withTenant(async () => NextResponse.json({ ok: true }))
    const res = await handler(makeRequest())
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('STAFF_REQUIRED')
  })

  it('rejects staff without tenant_id → 403 NO_TENANT_CONTEXT', async () => {
    setSupabaseUser({
      id: 's1',
      email: 's@x.com',
      app_metadata: {},
    })
    const handler = withTenant(async () => NextResponse.json({ ok: true }))
    const res = await handler(makeRequest())
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('NO_TENANT_CONTEXT')
  })

  it('rejects no session → 401 AUTH_REQUIRED', async () => {
    setSupabaseUser(null)
    const handler = withTenant(async () => NextResponse.json({ ok: true }))
    const res = await handler(makeRequest())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('AUTH_REQUIRED')
  })
})

describe('withRole', () => {
  beforeEach(() => {
    vi.mocked(getStaffRole).mockReset()
  })

  it('rejects role mismatch → 403 ROLE_REQUIRED', async () => {
    vi.mocked(getStaffRole).mockResolvedValue('manager')
    const handler = withRole('admin', async () => NextResponse.json({ ok: true }))
    const fakeUser: StaffUser = {
      type: 'staff',
      id: 'x',
      email: 'e',
      staffUserId: 'staff-1',
      tenantId: 't',
      role: 'admin',
    }
    const fakeTx = {} as DbTx
    const res = await handler(makeRequest(), fakeUser, fakeTx)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('ROLE_REQUIRED')
  })

  it('rejects membresía inactiva (rol null) → 403 ROLE_REQUIRED', async () => {
    vi.mocked(getStaffRole).mockResolvedValue(null)
    const handler = withRole('admin', async () => NextResponse.json({ ok: true }))
    const fakeUser: StaffUser = {
      type: 'staff',
      id: 'x',
      email: 'e',
      staffUserId: 'staff-1',
      tenantId: 't',
      role: 'admin',
    }
    const fakeTx = {} as DbTx
    const res = await handler(makeRequest(), fakeUser, fakeTx)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error.code).toBe('ROLE_REQUIRED')
  })

  it('passes when role matches', async () => {
    vi.mocked(getStaffRole).mockResolvedValue('admin')
    const handler = withRole('admin', async (_req, user) =>
      NextResponse.json({ role: user.role }),
    )
    const fakeUser: StaffUser = {
      type: 'staff',
      id: 'x',
      email: 'e',
      staffUserId: 'staff-1',
      tenantId: 't',
      role: 'admin',
    }
    const fakeTx = {} as DbTx
    const res = await handler(makeRequest(), fakeUser, fakeTx)
    expect(res.status).toBe(200)
  })
})
