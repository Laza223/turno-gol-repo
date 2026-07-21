import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Bug: al confirmar un cambio de email de staff (type=email_change),
// staff_users.email nunca se sincronizaba con el nuevo email de Supabase
// Auth. Fix: el callback sincroniza vía syncStaffUserEmail ANTES de
// provisionAndRouteStaff, usando el staff_user_id ya presente en
// app_metadata (nunca el email, que en ese momento todavía apunta al viejo
// en staff_users).

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/modules/auth/auth.service', () => ({
  provisionAndRouteStaff: vi.fn(),
  syncStaffUserEmail: vi.fn(),
}))
vi.mock('@/modules/players/player.service', () => ({ getOrCreatePlayer: vi.fn() }))
vi.mock('@/shared/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))
vi.mock('@/shared/observability', () => ({
  track: { auth: vi.fn() },
  withSpan: (_name: string, _op: string, fn: () => Promise<unknown>) => fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { provisionAndRouteStaff, syncStaffUserEmail } from '@/modules/auth/auth.service'
import { GET } from '@/app/api/auth/callback/route'

const mockCreateClient = vi.mocked(createClient)
const mockProvision = vi.mocked(provisionAndRouteStaff)
const mockSync = vi.mocked(syncStaffUserEmail)

function makeRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/auth/callback')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

function verifyOtpUser(user: unknown) {
  mockCreateClient.mockResolvedValue({
    auth: { verifyOtp: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  mockProvision.mockResolvedValue({ path: '/dashboard' })
})

describe('GET /api/auth/callback — email_change confirmado', () => {
  it('sincroniza staff_users.email al nuevo email ANTES de provisionar (staff_user_id en metadata)', async () => {
    const user = {
      id: 'auth-1',
      email: 'nuevo@complejo.com',
      app_metadata: { staff_user_id: 'staff-1', tenant_id: 'tenant-1', role: 'admin' },
      user_metadata: {},
    }
    verifyOtpUser(user)

    const res = await GET(makeRequest({ token_hash: 'tok-123', type: 'email_change' }))

    expect(mockSync).toHaveBeenCalledWith('staff-1', 'nuevo@complejo.com')
    expect(mockProvision).toHaveBeenCalledWith(user)
    expect(res.headers.get('location')).toBe(
      'http://localhost/verify?status=success&next=%2Fdashboard&intent=signup',
    )
  })

  it('sin staff_user_id en metadata, no llama a syncStaffUserEmail (nada que sincronizar todavía)', async () => {
    const user = {
      id: 'auth-2',
      email: 'nuevo@complejo.com',
      app_metadata: {},
      user_metadata: {},
    }
    verifyOtpUser(user)

    await GET(makeRequest({ token_hash: 'tok-123', type: 'email_change' }))

    expect(mockSync).not.toHaveBeenCalled()
    expect(mockProvision).toHaveBeenCalledWith(user)
  })

  it('type=signup no dispara sync (solo aplica a email_change)', async () => {
    const user = {
      id: 'auth-3',
      email: 'alta@complejo.com',
      app_metadata: { staff_user_id: 'staff-3' },
      user_metadata: {},
    }
    verifyOtpUser(user)

    await GET(makeRequest({ token_hash: 'tok-123', type: 'signup' }))

    expect(mockSync).not.toHaveBeenCalled()
    expect(mockProvision).toHaveBeenCalledWith(user)
  })
})
